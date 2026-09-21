import { useEffect, useMemo, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { useWatchedQuery } from './useWatchedQuery';
import type { PayloadUser } from './auth';
import { useToast } from './Toast';
import { VariantPickerDialog, type LocalVariant } from './VariantPickerDialog';
import {
  createQuotation,
  downloadQuotationPdf,
  fetchQuotation,
  fetchQuotations,
  type QuotationDetail,
  type QuotationListItem,
} from './quotations';

interface LocalProduct {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  sell_price: number;
  variant_count: number;
}

interface BuilderLine {
  key: string;
  productId: number;
  variant: string | null;
  label: string;
  quantity: string;
  unitPrice: string;
}

type View = { tab: 'list' } | { tab: 'builder' } | { tab: 'detail'; id: number };

/** Composite key for a (product, variant) builder line - a bare product still needs a stable key distinct from any of its own variants. */
function lineKey(productId: string | number, variantId?: string | null): string {
  return `${productId}::${variantId ?? ''}`;
}

// Kenyan local format (0712345678, what normalizeKenyanPhone stores
// customerPhone as - see CustomerPicker.tsx) has no country code, which
// wa.me requires. Only this display-time link needs the 254 prefix - the
// value stored/sent to the API is left exactly as the server normalized it.
function toWhatsAppPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  return digits;
}

// Quotations, gated to manager/owner only by AppShell.tsx (matches this
// collection's own access control - a cashier session gets a 403 from every
// endpoint quotations.ts calls). No router/multiple-pages concept on
// desktop (see AppShell.tsx's own top-level comment) - one component with
// internal view-state switching, same lightweight style as RestockScreen.tsx's
// own New/My lists/detail tabs.
export function Quotations({ user, storeId, payloadToken }: { user: PayloadUser; storeId: number | null; payloadToken: string }) {
  const [view, setView] = useState<View>({ tab: 'list' });
  const [listVersion, setListVersion] = useState(0);

  return (
    <div className="section-shell">
      {view.tab === 'list' ? (
        <div className="section-toolbar">
          <button type="button" className="btn btn-primary" onClick={() => setView({ tab: 'builder' })}>
            + New quotation
          </button>
        </div>
      ) : null}

      {view.tab === 'list' ? (
        <QuotationList key={listVersion} payloadToken={payloadToken} onOpen={(id) => setView({ tab: 'detail', id })} />
      ) : null}

      {view.tab === 'builder' ? (
        <QuotationBuilder
          user={user}
          storeId={storeId}
          payloadToken={payloadToken}
          onCancel={() => setView({ tab: 'list' })}
          onCreated={(id) => setView({ tab: 'detail', id })}
        />
      ) : null}

      {view.tab === 'detail' ? (
        <QuotationDetailPane
          payloadToken={payloadToken}
          quotationId={view.id}
          onBack={() => {
            // Forces QuotationList to refetch (via the key bump) so a
            // just-created quotation shows up without needing a manual
            // reload - fetchQuotations is a one-shot REST call, not a
            // reactive local query, so nothing else would pick it up.
            setListVersion((v) => v + 1);
            setView({ tab: 'list' });
          }}
        />
      ) : null}
    </div>
  );
}

function QuotationList({ payloadToken, onOpen }: { payloadToken: string; onOpen: (id: number) => void }) {
  const [quotations, setQuotations] = useState<QuotationListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchQuotations(payloadToken).then((rows) => {
      setQuotations(rows);
      setLoading(false);
    });
  }, [payloadToken]);

  return (
    <div className="section-body">
      {loading ? (
        <p className="pane-empty-state-hint">Loading...</p>
      ) : quotations.length === 0 ? (
        <div className="pane-empty-state">
          <p className="pane-empty-state-title">No quotations yet</p>
          <p className="pane-empty-state-hint">Create one to send a priced estimate to a customer.</p>
        </div>
      ) : (
        <table className="data-table clickable-rows">
          <tbody>
            {quotations.map((q) => (
              <tr key={q.id} onClick={() => onOpen(q.id)}>
                <td>{q.customerName}</td>
                <td>{q.customerPhone}</td>
                <td className="num">{q.total.toFixed(2)}</td>
                <td>{new Date(q.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function QuotationBuilder({
  user,
  storeId,
  payloadToken,
  onCancel,
  onCreated,
}: {
  user: PayloadUser;
  storeId: number | null;
  payloadToken: string;
  onCancel: () => void;
  onCreated: (id: number) => void;
}) {
  const showToast = useToast();
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<BuilderLine[]>([]);
  const [variantPickerProduct, setVariantPickerProduct] = useState<LocalProduct | null>(null);
  const [saving, setSaving] = useState(false);

  const trimmedQuery = query.trim();

  // Same local-search approach as Till.tsx's own product search (reactive
  // via useWatchedQuery, `AND ? != ''` reproducing the old
  // early-return-when-empty behavior in SQL since a hook can't be called
  // conditionally) - trimmed to just what a quotation line needs. No
  // stock_on_hand/tax_rate/max_discount_amount join: a quotation line has no
  // stock gating, no tax, and no discount cap (see this app's own header
  // comment on why), so those columns would just be dead weight here.
  const { data: results } = useWatchedQuery<LocalProduct>(
    `SELECT p.id, p.name, p.sku, p.barcode, p.sell_price,
            (SELECT COUNT(*) FROM products_variants pv WHERE pv._parent_id = p.id) AS variant_count
     FROM products p
     WHERE p.tenant_id = ? AND ? != '' AND (p.sku LIKE ? OR p.barcode = ? OR p.name LIKE ?)
     ORDER BY p.name LIMIT 20`,
    [tenantId, trimmedQuery, `%${trimmedQuery}%`, trimmedQuery, `%${trimmedQuery}%`],
  );

  function addProduct(product: LocalProduct) {
    if (product.variant_count > 0) {
      setVariantPickerProduct(product);
      return;
    }
    addLine(product, null);
  }

  function addLine(product: LocalProduct, variant: LocalVariant | null) {
    const key = lineKey(product.id, variant?.id ?? null);
    setLines((prev) => {
      const existing = prev.find((l) => l.key === key);
      if (existing) {
        return prev.map((l) => (l.key === key ? { ...l, quantity: String((Number(l.quantity) || 0) + 1) } : l));
      }
      const label = variant ? `${product.name} — ${variant.label}` : product.name;
      const unitPrice = variant?.sell_price ?? product.sell_price;
      return [...prev, { key, productId: Number(product.id), variant: variant?.id ?? null, label, quantity: '1', unitPrice: String(unitPrice) }];
    });
    setQuery('');
    setVariantPickerProduct(null);
  }

  function updateLine(key: string, field: 'quantity' | 'unitPrice', value: string) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, [field]: value } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const estimatedTotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);

  async function handleSubmit() {
    if (!customerName.trim()) {
      showToast('Enter a customer name', 'error');
      return;
    }
    if (lines.length === 0) {
      showToast('Add at least one item', 'error');
      return;
    }
    setSaving(true);
    try {
      const doc = await createQuotation(payloadToken, {
        store: storeId ?? undefined,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        notes: notes.trim() || undefined,
        lineItems: lines.map((l) => ({
          product: l.productId,
          variant: l.variant,
          label: l.label,
          quantity: Number(l.quantity) || 0,
          unitPrice: Number(l.unitPrice) || 0,
        })),
      });
      showToast(`Quotation #${doc.id} created`, 'success');
      onCreated(doc.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not save quotation', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="section-body">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>
        ← Back
      </button>

      <div className="section-card">
        <h3>Customer</h3>
        <div className="field-row">
          <input placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.currentTarget.value)} />
          <input placeholder="Phone e.g. 0712345678" value={customerPhone} onChange={(e) => setCustomerPhone(e.currentTarget.value)} />
        </div>
        <textarea
          className="quotation-notes"
          placeholder="Notes (optional)"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
      </div>

      <div className="section-card">
        <h3>Add items</h3>
        {storeId == null ? (
          <p className="section-card-hint">Select a branch from the branch switcher on the Sell screen, then come back here to add products.</p>
        ) : (
          <>
            <input placeholder="Search products by name or SKU..." value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
            {results.length > 0 ? (
              <ul className="find-sale-list">
                {results.map((p) => (
                  <li key={p.id}>
                    <button type="button" className="btn btn-ghost btn-block" onClick={() => addProduct(p)}>
                      {p.name} · {p.sku} · {p.sell_price.toFixed(2)}
                      {p.variant_count > 0 ? ` · ${p.variant_count} options` : ''}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>

      <div className="section-card">
        <h3>Items ({lines.length})</h3>
        {lines.length === 0 ? (
          <p className="section-card-hint">No items added yet.</p>
        ) : (
          <table className="data-table">
            <tbody>
              {lines.map((l) => (
                <tr key={l.key}>
                  <td>{l.label}</td>
                  <td className="num">
                    <input
                      type="number"
                      className="table-input"
                      value={l.quantity}
                      onChange={(e) => updateLine(l.key, 'quantity', e.currentTarget.value)}
                    />
                  </td>
                  <td className="num">
                    <input
                      type="number"
                      className="table-input"
                      value={l.unitPrice}
                      onChange={(e) => updateLine(l.key, 'unitPrice', e.currentTarget.value)}
                    />
                  </td>
                  <td className="num">{((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)).toFixed(2)}</td>
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(l.key)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lines.length > 0 ? <p className="section-card-total">Total: {estimatedTotal.toFixed(2)}</p> : null}
      </div>

      <div className="section-actions">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSubmit}>
          {saving ? 'Saving...' : 'Save quotation'}
        </button>
      </div>

      {storeId != null ? (
        <VariantPickerDialog
          product={variantPickerProduct}
          storeId={storeId}
          onSelect={(variant) => variantPickerProduct && addLine(variantPickerProduct, variant)}
          onClose={() => setVariantPickerProduct(null)}
        />
      ) : null}
    </div>
  );
}

function QuotationDetailPane({ payloadToken, quotationId, onBack }: { payloadToken: string; quotationId: number; onBack: () => void }) {
  const showToast = useToast();
  const [quotation, setQuotation] = useState<QuotationDetail | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchQuotation(payloadToken, quotationId).then(setQuotation);
  }, [payloadToken, quotationId]);

  const whatsAppUrl = useMemo(() => {
    if (!quotation) return null;
    const message = `Hello ${quotation.customerName}, here is your quotation #${quotation.id} - total ${quotation.total.toFixed(2)}. I'll follow up shortly with the PDF.`;
    return `https://wa.me/${toWhatsAppPhone(quotation.customerPhone)}?text=${encodeURIComponent(message)}`;
  }, [quotation]);

  async function handleDownloadPdf() {
    if (!quotation) return;
    setDownloading(true);
    try {
      await downloadQuotationPdf(payloadToken, quotation.id);
      showToast('PDF downloaded', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not download PDF', 'error');
    } finally {
      setDownloading(false);
    }
  }

  async function handleSendWhatsApp() {
    if (!whatsAppUrl) return;
    try {
      await openUrl(whatsAppUrl);
      // WhatsApp has no URL scheme for pre-attaching a file - a real,
      // unavoidable limitation of the wa.me link, not something this can
      // work around client-side.
      showToast('Remember to attach the downloaded PDF to the WhatsApp chat yourself - it can\'t be pre-attached via the link.', 'info');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not open WhatsApp', 'error');
    }
  }

  if (!quotation) {
    return <p className="pane-empty-state-hint">Loading...</p>;
  }

  return (
    <div className="section-body">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        ← Back
      </button>

      <div className="section-card">
        <h3>Quotation #{quotation.id}</h3>
        <p className="section-card-hint">
          {quotation.customerName} · {quotation.customerPhone}
        </p>
        {quotation.notes ? <p className="section-card-hint">{quotation.notes}</p> : null}

        <table className="data-table">
          <tbody>
            {quotation.lineItems.map((l, i) => (
              <tr key={i}>
                <td>{l.label}</td>
                <td className="num">{l.quantity}</td>
                <td className="num">{l.unitPrice.toFixed(2)}</td>
                <td className="num">{(l.quantity * l.unitPrice).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="section-card-total">Total: {quotation.total.toFixed(2)}</p>

        <div className="section-actions">
          <button type="button" className="btn btn-secondary" disabled={downloading} onClick={handleDownloadPdf}>
            {downloading ? 'Downloading...' : 'Download PDF'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleSendWhatsApp}>
            Send via WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
