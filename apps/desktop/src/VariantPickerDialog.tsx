import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
import { useWatchedQuery } from './useWatchedQuery';
import { SearchIcon } from './icons';

export interface LocalVariant {
  id: string;
  label: string;
  sku: string;
  barcode: string | null;
  sell_price: number | null;
  cost_price: number | null;
  stock_on_hand: number;
}

interface PickerProduct {
  id: string;
  name: string;
  sell_price: number;
}

// Opens whenever a variant-having product is picked - a product with
// variants is never sold as its bare self, matching web/Android's
// identical rule. Queries products_variants on demand rather than joining
// it into every search result row, since most searches never open this.
// Same search-box treatment (Fuse config, same keys) as the web/Android
// pickers this ports the feature from.
export function VariantPickerDialog({
  product,
  storeId,
  onSelect,
  onClose,
}: {
  product: PickerProduct | null;
  storeId: number;
  onSelect: (variant: LocalVariant) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  // Clears the in-dialog search box whenever a different product opens (or
  // the dialog closes) - a UI-only reset, kept separate from the data query
  // below since it has nothing to do with what's fetched.
  useEffect(() => {
    setQuery('');
  }, [product]);

  // Reactive (useWatchedQuery, not a one-shot db.getAll): re-runs on its
  // own whenever products_variants/stock_movements change locally, so a
  // stock count on screen never goes stale mid-pick the way a one-shot
  // snapshot would - same overselling-relevant risk as Till.tsx's own
  // product search. `product?.id ?? null` (rather than skipping the query
  // when the dialog is closed) reproduces the old "no product -> no
  // variants" behavior in SQL, since a hook can't be called conditionally.
  const { data: variants } = useWatchedQuery<LocalVariant>(
    `SELECT pv.id, pv.label, pv.sku, pv.barcode, pv.sell_price, pv.cost_price,
            COALESCE((SELECT SUM(sm.quantity_delta) FROM stock_movements sm
                      WHERE sm.variant = pv.id AND sm.store_id = ?), 0) AS stock_on_hand
     FROM products_variants pv
     WHERE pv._parent_id = ?
     ORDER BY pv._order`,
    [storeId, product?.id ?? null],
  );

  const results = useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return variants;
    const fuse = new Fuse(variants, { threshold: 0.4, ignoreLocation: true, keys: ['label', 'sku', 'barcode'] });
    return fuse.search(trimmed).map((r) => r.item);
  }, [query, variants]);

  if (!product) return null;

  return (
    <div className="drawer-overlay confirm-overlay" onClick={onClose}>
      <div className="variant-picker-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${product.name} - choose an option`}>
        <h2>{product.name} — choose an option</h2>
        {variants.length > 6 ? (
          <div className="search-box">
            <SearchIcon />
            <input autoFocus placeholder="Search by name, SKU, or barcode..." value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
          </div>
        ) : null}
        <div className="variant-picker-list">
          {results.length === 0 ? (
            <p className="pane-empty-state-hint">No options match &ldquo;{query.trim()}&rdquo;.</p>
          ) : (
            results.map((variant) => {
              const outOfStock = variant.stock_on_hand <= 0;
              const price = variant.sell_price ?? product.sell_price;
              return (
                <button
                  key={variant.id}
                  type="button"
                  className="variant-picker-row"
                  disabled={outOfStock}
                  onClick={() => onSelect(variant)}
                >
                  <span>
                    <span className="variant-picker-row-name">{variant.label}</span>
                    <br />
                    <span className="variant-picker-row-meta">{variant.sku}</span>
                  </span>
                  <span style={{ textAlign: 'right' }}>
                    <span className="variant-picker-row-name">{price.toFixed(2)}</span>
                    <br />
                    <span className="variant-picker-row-meta">{outOfStock ? 'Out of stock' : `${variant.stock_on_hand} in stock`}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
