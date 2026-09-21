import { useEffect, useMemo, useState } from 'react';
import { fetchProductCatalog, recordStockMovement, type PickableProduct } from './inventory';
import { useWatchedQuery } from './useWatchedQuery';
import type { PayloadUser } from './auth';

const NO_VARIANT = '__base__';

// Was fetched from the tenant-wide /api/reports/stock-levels endpoint
// web/mobile also use - now a local reactive query instead (see the
// useWatchedQuery call below), mirroring apps/mobile/src/inventory/
// InventoryScreen.tsx's already-local equivalent (minus its media/image
// join - desktop's schema.ts has no media table, and this screen has never
// rendered product images). Field names/shape kept identical to what this
// screen already rendered, so only *where* the data comes from changed.
interface StockLevel {
  store: number;
  product: number;
  variant: string | null;
  productName: string;
  variantLabel: string | null;
  quantity: number;
  reorderPoint: number;
  lowStock: boolean;
}

const TYPES = [
  { value: 'restock', label: 'Restock (received new stock)' },
  { value: 'adjustment', label: 'Correction (recount - can be + or -)' },
  { value: 'write_off', label: 'Write-off (damaged / lost / expired)' },
] as const;

// Stock levels + a manual adjustment form - desktop had zero inventory
// visibility and zero adjustment-writing code before this (Till.tsx only
// ever reads stock to gate the cart, never writes it). Mirrors web's
// inventory page + stock-adjustment-dialog.tsx: every change is a new
// StockMovements row, never a direct edit to a stored count (there is none).
export function Inventory({ user, storeId, payloadToken }: { user: PayloadUser; storeId: number | null; payloadToken: string }) {
  // Matches StockMovements.ts's own access.create - owner and manager only.
  const canManage = user.role === 'owner' || user.role === 'manager';
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;
  const [catalog, setCatalog] = useState<PickableProduct[]>([]);
  const [filter, setFilter] = useState('');

  const [productQuery, setProductQuery] = useState('');
  const [productId, setProductId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState(NO_VARIANT);
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('restock');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reactive (useWatchedQuery, not a REST call): re-runs on its own
  // whenever products/products_variants/stock_movements change locally -
  // this screen's own manual adjustments below (once they sync back down),
  // another till's sales, a restock landing from sync, etc. - without
  // needing a remount or a manual refresh call to catch up. Bare products
  // (no variants) unioned with one row per variant for products that have
  // them - a variant-having product never shows a bare-self row, matching
  // web's identical "tracked separately" rule. storeId ?? -1 (rather than
  // skipping the query) since hooks can't be called conditionally - a -1
  // store id naturally matches zero rows, the same empty-state result the
  // old storeId == null early-return-before-fetching produced. p.is_active
  // = 1 both gives desktop live/local inventory for the first time and
  // independently fixes the archive-visibility bug at the source (on top
  // of the separate REST-endpoint fix already made server-side this
  // session, and the fetchProductCatalog fix above/in inventory.ts).
  const { data: rawLevels } = useWatchedQuery<Omit<StockLevel, 'lowStock'>>(
    `SELECT ? AS store, CAST(p.id AS INTEGER) AS product, NULL AS variant, p.name AS productName, NULL AS variantLabel,
            p.reorder_point AS reorderPoint,
            COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm
                      WHERE sm.product_id = p.id AND sm.store_id = ? AND sm.variant IS NULL), 0) AS quantity
     FROM products p
     WHERE p.tenant_id = ? AND p.is_active = 1
       AND NOT EXISTS (SELECT 1 FROM products_variants pv WHERE pv._parent_id = p.id)
     UNION ALL
     SELECT ? AS store, CAST(p.id AS INTEGER) AS product, pv.id AS variant, p.name AS productName, pv.label AS variantLabel,
            p.reorder_point AS reorderPoint,
            COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm
                      WHERE sm.variant = pv.id AND sm.store_id = ?), 0) AS quantity
     FROM products_variants pv
     JOIN products p ON p.id = pv._parent_id
     WHERE p.tenant_id = ? AND p.is_active = 1
     ORDER BY productName`,
    [storeId ?? -1, storeId ?? -1, tenantId, storeId ?? -1, storeId ?? -1, tenantId],
  );
  // lowStock kept as its own client-side computed field (quantity <=
  // reorderPoint, same threshold /api/reports/stock-levels used) rather
  // than folded into the SQL above, and the low-stock-first sort applied
  // here - matches this screen's own previous behavior exactly, just fed
  // by local rows instead of a REST response.
  const levels = useMemo<StockLevel[]>(
    () =>
      rawLevels
        .map((l) => ({ ...l, lowStock: l.quantity <= l.reorderPoint }))
        .sort((a, b) => Number(b.lowStock) - Number(a.lowStock)),
    [rawLevels],
  );

  useEffect(() => {
    fetchProductCatalog(payloadToken).then(setCatalog);
  }, [payloadToken]);

  const filteredLevels = useMemo(() => {
    const trimmed = filter.trim().toLowerCase();
    if (!trimmed) return levels;
    return levels.filter((l) => l.productName.toLowerCase().includes(trimmed) || l.variantLabel?.toLowerCase().includes(trimmed));
  }, [levels, filter]);

  const productResults = useMemo(() => {
    const trimmed = productQuery.trim().toLowerCase();
    if (!trimmed) return [];
    return catalog.filter((p) => p.name.toLowerCase().includes(trimmed) || p.sku.toLowerCase().includes(trimmed)).slice(0, 8);
  }, [catalog, productQuery]);

  const selectedProduct = catalog.find((p) => p.id === productId) ?? null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (storeId == null || !productId) {
      setError('Pick a product');
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty === 0) {
      setError('Enter a non-zero quantity');
      return;
    }
    const quantityDelta = type === 'write_off' ? -Math.abs(qty) : type === 'restock' ? Math.abs(qty) : qty;

    setSaving(true);
    const ok = await recordStockMovement(payloadToken, {
      product: productId,
      variant: variantId === NO_VARIANT ? null : variantId,
      store: storeId,
      quantityDelta,
      reason: type,
    });
    setSaving(false);
    if (!ok) {
      setError('Failed to record the stock movement');
      return;
    }
    setProductId(null);
    setProductQuery('');
    setVariantId(NO_VARIANT);
    setQuantity('');
    setType('restock');
    // No manual refresh call needed - levels above is now a reactive local
    // query and will update on its own once this movement syncs back down
    // (it's still a REST write - see fetchProductCatalog's comment above -
    // so, unlike a same-till local write, there's a brief sync round-trip
    // before it's reflected here rather than an instant read-your-write).
  }

  if (storeId == null) {
    return (
      <div className="pane-empty-state">
        <p className="pane-empty-state-title">Select a branch to view inventory</p>
        <p className="pane-empty-state-hint">Use the branch switcher at the top of the screen to pick a store.</p>
      </div>
    );
  }

  return (
    <div className="section-shell">
      <div className="section-body inventory-layout">
        {canManage ? (
        <div className="section-card">
          <h3>Adjust stock</h3>
          <form onSubmit={handleSubmit} className="login-form">
            {selectedProduct ? (
              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => {
                  setProductId(null);
                  setVariantId(NO_VARIANT);
                }}
              >
                {selectedProduct.name} ({selectedProduct.sku}) - change
              </button>
            ) : (
              <div className="field">
                <span className="field-label">Product</span>
                <input placeholder="Search by name or SKU..." value={productQuery} onChange={(e) => setProductQuery(e.currentTarget.value)} />
                {productResults.length > 0 ? (
                  <ul className="find-sale-list">
                    {productResults.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-block"
                          onClick={() => {
                            setProductId(p.id);
                            setProductQuery('');
                            setVariantId(NO_VARIANT);
                          }}
                        >
                          {p.name} · {p.sku}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )}

            {selectedProduct && selectedProduct.variants.length > 0 ? (
              <div className="field">
                <span className="field-label">Variant</span>
                <select value={variantId} onChange={(e) => setVariantId(e.currentTarget.value)}>
                  <option value={NO_VARIANT}>Base product (no variant)</option>
                  {selectedProduct.variants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="field">
              <span className="field-label">Type</span>
              <select value={type} onChange={(e) => setType(e.currentTarget.value as typeof type)}>
                {TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <span className="field-label">{type === 'adjustment' ? 'Quantity (use a minus sign to remove stock)' : 'Quantity'}</span>
              <input type="number" step="0.001" value={quantity} onChange={(e) => setQuantity(e.currentTarget.value)} />
            </div>

            {error ? <p className="error-banner">{error}</p> : null}

            <button type="submit" className="btn btn-primary btn-block" disabled={saving}>
              {saving ? 'Saving...' : 'Record movement'}
            </button>
          </form>
        </div>
        ) : null}

        <div className="section-card">
          <div className="section-card-toolbar">
            <h3>Stock levels</h3>
            <input placeholder="Filter..." value={filter} onChange={(e) => setFilter(e.currentTarget.value)} />
          </div>
          {filteredLevels.length === 0 ? (
            <p className="section-card-hint">No products yet.</p>
          ) : (
            <table className="data-table">
              <tbody>
                {filteredLevels.map((l) => (
                  <tr key={`${l.product}::${l.variant ?? ''}`} className={l.lowStock ? 'is-low-stock' : ''}>
                    <td>
                      {l.variantLabel ? `${l.productName} — ${l.variantLabel}` : l.productName}
                      {l.reorderPoint > 0 ? <span className="section-card-hint"> · reorder at {l.reorderPoint}</span> : null}
                    </td>
                    <td className="num">{l.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
