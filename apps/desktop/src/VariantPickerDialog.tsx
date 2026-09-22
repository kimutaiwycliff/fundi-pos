import { useEffect, useMemo, useState } from 'react';
import Fuse from 'fuse.js';
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
// variants is never sold as its bare self, matching web/Android's identical
// rule. `variants` is now a pre-fetched prop from the caller (Till.tsx/
// QuotationsScreen.tsx, both of which already have the full catalog +
// stock-level fetch in hand via catalog.ts) instead of this dialog querying
// a local database itself - there's no local database any more. Same
// search-box treatment (Fuse config, same keys) as the web/Android pickers
// this ports the feature from.
export function VariantPickerDialog({
  product,
  variants,
  onSelect,
  onClose,
}: {
  product: PickerProduct | null;
  variants: LocalVariant[];
  onSelect: (variant: LocalVariant) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');

  // Clears the in-dialog search box whenever a different product opens (or
  // the dialog closes) - a UI-only reset, kept separate from the data itself.
  useEffect(() => {
    setQuery('');
  }, [product]);

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
