import { useEffect, useMemo, useState } from 'react';
import { fetchCatalog } from './catalog';
import type { PayloadUser } from './auth';
import { useToast } from './Toast';
import { ConfirmDialog } from './ConfirmDialog';
import {
  createPurchaseOrder,
  createSupplier,
  deletePurchaseOrder,
  fetchPurchaseOrder,
  fetchPurchaseOrders,
  fetchRestockSuggestions,
  fetchSuppliers,
  receivePurchaseOrder,
  type PurchaseOrderDetail,
  type PurchaseOrderListItem,
  type RestockSuggestion,
  type Supplier,
} from './restock';
import { printRestockDocument } from './restockDocument';

interface CatalogProduct {
  id: string;
  name: string;
  sku: string;
  cost_price: number;
}

interface Line {
  productId: number;
  productName: string;
  quantity: string;
  unitCost: string;
}

const STATUS_LABEL: Record<PurchaseOrderListItem['status'], string> = {
  draft: 'draft',
  sent: 'sent',
  partially_received: 'partially received',
  received: 'received',
};

type View = { tab: 'new' } | { tab: 'lists' } | { tab: 'detail'; id: number };

// Restocking on desktop, mirroring apps/mobile/src/restock/*: a New/My lists
// tab switcher (no router needed, same lightweight state-machine style as
// Till.tsx's own login flow) plus a detail drill-in with draft-only delete
// and a per-line receive checklist. Product search for new lines uses the
// shared catalog.ts REST fetcher (same one Till.tsx's own cart search uses);
// everything else (suppliers, suggestions, purchase-orders themselves) is
// online-only via restock.ts, same as every other client.
export function Restock({ user, storeId, payloadToken }: { user: PayloadUser; storeId: number | null; payloadToken: string }) {
  const [view, setView] = useState<View>({ tab: 'new' });

  return (
    <div className="section-shell">
      {view.tab !== 'detail' ? (
        <div className="section-toolbar">
          <div className="segmented" role="tablist" aria-label="Restock view">
            <button type="button" role="tab" aria-pressed={view.tab === 'new'} onClick={() => setView({ tab: 'new' })}>
              New
            </button>
            <button type="button" role="tab" aria-pressed={view.tab === 'lists'} onClick={() => setView({ tab: 'lists' })}>
              My lists
            </button>
          </div>
        </div>
      ) : null}

      {view.tab === 'new' ? <NewRestockForm user={user} storeId={storeId} payloadToken={payloadToken} /> : null}
      {view.tab === 'lists' ? <PurchaseOrderList payloadToken={payloadToken} onOpen={(id) => setView({ tab: 'detail', id })} /> : null}
      {view.tab === 'detail' ? (
        <PurchaseOrderDetailPane
          user={user}
          payloadToken={payloadToken}
          poId={view.id}
          onBack={() => setView({ tab: 'lists' })}
          onDeleted={() => setView({ tab: 'lists' })}
        />
      ) : null}
    </div>
  );
}

function NewRestockForm({ user, storeId, payloadToken }: { user: PayloadUser; storeId: number | null; payloadToken: string }) {
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  // Matches Products.ts's own costPrice field access - owner and manager.
  const canSeeCost = user.role === 'owner' || user.role === 'manager';
  const showToast = useToast();

  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState<number | null>(null);
  const [newSupplierName, setNewSupplierName] = useState('');
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [query, setQuery] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (storeId == null) return;
    let active = true;
    fetchRestockSuggestions(payloadToken, storeId).then((rows) => {
      if (active) setSuggestions(rows);
    });
    fetchSuppliers(payloadToken).then((rows) => {
      if (active) setSuppliers(rows);
    });
    // Base-product-only, same as Till.tsx's own product search - via the
    // shared catalog.ts REST fetcher now (this used to be a local PowerSync
    // query; desktop's now-deleted local schema had no products_variants
    // table anyway, so this was always base-product-only).
    fetchCatalog(payloadToken, tenantId)
      .then((rows) => {
        if (active) setCatalog(rows.map((p) => ({ id: String(p.id), name: p.name, sku: p.sku, cost_price: p.costPrice })));
      })
      .catch(() => {
        // Best-effort - the suggestions/suppliers fetches above already
        // surface their own state; a failed catalog load just leaves the
        // "Add items" search empty until the next mount/store switch.
      });
    return () => {
      active = false;
    };
  }, [storeId, tenantId, payloadToken]);

  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return [];
    return catalog.filter((p) => p.name.toLowerCase().includes(trimmed) || p.sku.toLowerCase().includes(trimmed)).slice(0, 8);
  }, [query, catalog]);

  function addLine(productId: number, productName: string, unitCost: number) {
    setLines((prev) => {
      if (prev.some((l) => l.productId === productId)) return prev;
      return [...prev, { productId, productName, quantity: '1', unitCost: String(unitCost) }];
    });
  }
  function updateLine(productId: number, field: 'quantity' | 'unitCost', value: string) {
    setLines((prev) => prev.map((l) => (l.productId === productId ? { ...l, [field]: value } : l)));
  }
  function removeLine(productId: number) {
    setLines((prev) => prev.filter((l) => l.productId !== productId));
  }

  const estimatedTotal = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);

  async function handleAddSupplier() {
    if (!newSupplierName.trim()) return;
    const created = await createSupplier(payloadToken, newSupplierName.trim());
    if (created) {
      setSuppliers((prev) => [...prev, created]);
      setSupplierId(created.id);
      setNewSupplierName('');
    } else {
      showToast('Could not add supplier', 'error');
    }
  }

  async function handleSave() {
    if (storeId == null || !supplierId || lines.length === 0) {
      showToast('Pick a supplier and add at least one item', 'error');
      return;
    }
    setSaving(true);
    const doc = await createPurchaseOrder(payloadToken, {
      store: storeId,
      supplier: supplierId,
      lineItems: lines.map((l) => ({ product: l.productId, quantity: Number(l.quantity) || 0, unitCost: Number(l.unitCost) || 0 })),
    });
    setSaving(false);
    if (!doc) {
      showToast('Could not save - check your connection', 'error');
      return;
    }
    showToast(`Saved restock list #${doc.id}`, 'success');
    setLines([]);
  }

  function handleGenerateDocument() {
    const supplierName = suppliers.find((s) => s.id === supplierId)?.name ?? 'Supplier';
    printRestockDocument(
      {
        poNumber: 'DRAFT',
        storeName: storeId != null ? `Store #${storeId}` : '',
        supplierName,
        createdAtLabel: new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        lines: lines.map((l) => ({
          productName: l.productName,
          variantLabel: null,
          quantity: Number(l.quantity) || 0,
          unitCost: canSeeCost ? Number(l.unitCost) || 0 : null,
        })),
        estimatedTotal: canSeeCost ? estimatedTotal : null,
      },
      user.name ?? user.email,
    );
  }

  if (storeId == null) {
    return (
      <div className="pane-empty-state">
        <p className="pane-empty-state-title">Select a branch to start a restock list</p>
        <p className="pane-empty-state-hint">Use the branch switcher at the top of the screen to pick a store.</p>
      </div>
    );
  }

  return (
    <div className="section-body">
      <div className="section-card">
        <h3>Supplier</h3>
        <div className="chip-row">
          {suppliers.map((s) => (
            <button key={s.id} type="button" className={`chip ${supplierId === s.id ? 'is-active' : ''}`} onClick={() => setSupplierId(s.id)}>
              {s.name}
            </button>
          ))}
        </div>
        <div className="field-row">
          <input placeholder="New supplier name" value={newSupplierName} onChange={(e) => setNewSupplierName(e.currentTarget.value)} />
          <button type="button" className="btn btn-secondary" onClick={handleAddSupplier}>
            Add
          </button>
        </div>
      </div>

      {suggestions.length > 0 ? (
        <div className="section-card">
          <h3>Suggested for this store</h3>
          <div className="chip-row">
            {suggestions.map((s) => {
              const added = lines.some((l) => l.productId === s.productId);
              return (
                <button
                  key={`${s.productId}::${s.variant ?? ''}`}
                  type="button"
                  disabled={added}
                  className={`chip ${added ? 'is-disabled' : ''}`}
                  onClick={() => addLine(s.productId, s.productName, s.costPrice ?? 0)}
                >
                  {s.productName} · {s.reason === 'low-stock' ? 'Low stock' : s.reason === 'fast-moving' ? 'Fast moving' : 'Low stock + fast moving'}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="section-card">
        <h3>Add items</h3>
        <input placeholder="Search products by name or SKU..." value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        {searchResults.length > 0 ? (
          <ul className="find-sale-list">
            {searchResults.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="btn btn-ghost btn-block"
                  onClick={() => {
                    addLine(Number(p.id), p.name, p.cost_price);
                    setQuery('');
                  }}
                >
                  {p.name} · {p.sku}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="section-card">
        <h3>Items ({lines.length})</h3>
        {lines.length === 0 ? (
          <p className="section-card-hint">No items added yet.</p>
        ) : (
          <table className="data-table">
            <tbody>
              {lines.map((l) => (
                <tr key={l.productId}>
                  <td>{l.productName}</td>
                  <td className="num">
                    <input className="table-input" value={l.quantity} onChange={(e) => updateLine(l.productId, 'quantity', e.currentTarget.value)} />
                  </td>
                  {canSeeCost ? (
                    <td className="num">
                      <input className="table-input" value={l.unitCost} onChange={(e) => updateLine(l.productId, 'unitCost', e.currentTarget.value)} />
                    </td>
                  ) : null}
                  <td>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeLine(l.productId)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {canSeeCost && lines.length > 0 ? <p className="section-card-total">Estimated total: {estimatedTotal.toFixed(2)}</p> : null}
      </div>

      <div className="section-actions">
        <button type="button" className="btn btn-secondary" disabled={lines.length === 0} onClick={handleGenerateDocument}>
          Generate document
        </button>
        <button type="button" className="btn btn-primary" disabled={saving} onClick={handleSave}>
          {saving ? 'Saving...' : 'Save restock list'}
        </button>
      </div>
    </div>
  );
}

function PurchaseOrderList({ payloadToken, onOpen }: { payloadToken: string; onOpen: (id: number) => void }) {
  const [orders, setOrders] = useState<PurchaseOrderListItem[]>([]);

  useEffect(() => {
    fetchPurchaseOrders(payloadToken).then(setOrders);
  }, [payloadToken]);

  return (
    <div className="section-body">
      {orders.length === 0 ? (
        <p className="pane-empty-state-hint">No restock lists yet.</p>
      ) : (
        <table className="data-table clickable-rows">
          <tbody>
            {orders.map((po) => (
              <tr key={po.id} onClick={() => onOpen(po.id)}>
                <td>{typeof po.store === 'object' ? po.store.name : `Store #${po.store}`}</td>
                <td>{typeof po.supplier === 'object' ? po.supplier.name : `#${po.supplier}`}</td>
                <td>{po.lineItems.length} item(s)</td>
                <td>
                  <span className={`status-badge status-${po.status}`}>{STATUS_LABEL[po.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PurchaseOrderDetailPane({
  user,
  payloadToken,
  poId,
  onBack,
  onDeleted,
}: {
  user: PayloadUser;
  payloadToken: string;
  poId: number;
  onBack: () => void;
  onDeleted: () => void;
}) {
  // Matches Products.ts's own costPrice field access - owner and manager.
  const canSeeCost = user.role === 'owner' || user.role === 'manager';
  const showToast = useToast();
  const [po, setPo] = useState<PurchaseOrderDetail | null>(null);
  const [checked, setChecked] = useState<Record<number, boolean>>({});
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  function load() {
    fetchPurchaseOrder(payloadToken, poId).then((doc) => {
      if (!doc) return;
      setPo(doc);
      const outstanding: Record<number, string> = {};
      const check: Record<number, boolean> = {};
      doc.lineItems.forEach((l, index) => {
        const remaining = l.quantity - (l.receivedQuantity ?? 0);
        outstanding[index] = String(remaining);
        check[index] = remaining > 0;
      });
      setQuantities(outstanding);
      setChecked(check);
    });
  }

  useEffect(load, [payloadToken, poId]);

  if (!po) {
    return <p className="pane-empty-state-hint">Loading...</p>;
  }

  const storeName = typeof po.store === 'object' ? po.store.name : `Store #${po.store}`;
  const supplierName = typeof po.supplier === 'object' ? po.supplier.name : `#${po.supplier}`;

  async function handleDelete() {
    setConfirmDeleteOpen(false);
    const ok = await deletePurchaseOrder(payloadToken, poId);
    if (ok) onDeleted();
    else showToast('Could not delete restock list', 'error');
  }

  async function handleConfirmReceipt() {
    if (!po) return;
    const items = po.lineItems
      .map((_, index) => ({ index, quantity: Number(quantities[index]) || 0 }))
      .filter((i) => checked[i.index] && i.quantity > 0);
    if (items.length === 0) {
      showToast('Tick at least one item to receive', 'error');
      return;
    }
    setBusy(true);
    const updated = await receivePurchaseOrder(payloadToken, poId, items);
    setBusy(false);
    if (!updated) {
      showToast('Could not confirm receipt', 'error');
      return;
    }
    showToast('Receipt confirmed - stock levels updated', 'success');
    load();
  }

  function handleGenerateDocument() {
    if (!po) return;
    const estimatedTotal = canSeeCost ? po.lineItems.reduce((sum, l) => sum + l.quantity * l.unitCost, 0) : null;
    printRestockDocument(
      {
        poNumber: `PO-${po.id}`,
        storeName,
        supplierName,
        createdAtLabel: new Date(po.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
        lines: po.lineItems.map((l) => ({
          productName: l.product?.name ?? `#${l.product}`,
          variantLabel: l.variant ? (l.product?.variants?.find((v) => v.id === l.variant)?.label ?? null) : null,
          quantity: l.quantity,
          unitCost: canSeeCost ? l.unitCost : null,
        })),
        estimatedTotal,
      },
      user.name ?? user.email,
    );
  }

  const outstandingLines = po.lineItems
    .map((l, index) => ({ index, label: l.product?.name ?? `#${l.product}`, outstanding: l.quantity - (l.receivedQuantity ?? 0) }))
    .filter((l) => l.outstanding > 0);

  return (
    <div className="section-body">
      <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
        ← Back
      </button>
      <div className="section-card">
        <h3>Restock list #{po.id}</h3>
        <p className="section-card-hint">
          {storeName} · {supplierName} · {po.status.replace('_', ' ')}
        </p>
        <table className="data-table">
          <tbody>
            {po.lineItems.map((l, i) => (
              <tr key={i}>
                <td>{l.product?.name ?? `#${l.product}`}</td>
                <td className="num">
                  {l.quantity}
                  {canSeeCost ? ` × ${l.unitCost.toFixed(2)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="section-actions">
          <button type="button" className="btn btn-secondary" onClick={handleGenerateDocument}>
            Generate document
          </button>
          {po.status === 'draft' ? (
            <button type="button" className="btn btn-danger" onClick={() => setConfirmDeleteOpen(true)}>
              Delete draft
            </button>
          ) : null}
        </div>
      </div>

      {po.status !== 'received' && outstandingLines.length > 0 ? (
        <div className="section-card">
          <h3>Confirm what actually arrived</h3>
          {outstandingLines.map((l) => (
            <div key={l.index} className="receive-row">
              <label className="receive-row-check">
                <input type="checkbox" checked={checked[l.index] ?? false} onChange={() => setChecked((prev) => ({ ...prev, [l.index]: !prev[l.index] }))} />
                {l.label}
              </label>
              <input
                className="table-input"
                disabled={!checked[l.index]}
                value={quantities[l.index] ?? ''}
                onChange={(e) => setQuantities((prev) => ({ ...prev, [l.index]: e.currentTarget.value }))}
              />
              <span className="section-card-hint">of {l.outstanding}</span>
            </div>
          ))}
          <button type="button" className="btn btn-primary" disabled={busy} onClick={handleConfirmReceipt}>
            {busy ? 'Confirming...' : 'Confirm receipt'}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete this draft?"
        message="This cannot be undone."
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
