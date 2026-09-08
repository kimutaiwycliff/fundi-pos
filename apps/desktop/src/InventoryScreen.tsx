import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchProductCatalog, fetchStockLevels, recordStockMovement, type PickableProduct, type StockLevel } from './inventory';
import type { PayloadUser } from './auth';

const NO_VARIANT = '__base__';

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
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [catalog, setCatalog] = useState<PickableProduct[]>([]);
  const [filter, setFilter] = useState('');

  const [productQuery, setProductQuery] = useState('');
  const [productId, setProductId] = useState<number | null>(null);
  const [variantId, setVariantId] = useState(NO_VARIANT);
  const [type, setType] = useState<(typeof TYPES)[number]['value']>('restock');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshLevels = useCallback(() => {
    if (storeId == null) {
      setLevels([]);
      return;
    }
    fetchStockLevels(payloadToken, storeId).then((rows) =>
      setLevels([...rows].sort((a, b) => Number(b.lowStock) - Number(a.lowStock))),
    );
  }, [payloadToken, storeId]);

  useEffect(() => {
    refreshLevels();
  }, [refreshLevels]);

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
    refreshLevels();
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
