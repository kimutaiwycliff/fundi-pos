import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchCatalog, type CatalogProduct } from './catalog';
import { createProduct, deleteProduct, fetchMediaUrlMap, updateProduct, uploadImage, type ProductInput } from './products';
import type { PayloadUser } from './auth';
import { Drawer } from './Drawer';
import { ConfirmDialog } from './ConfirmDialog';
import { XIcon } from './icons';

// Product catalog management (create/view/edit + variants + images) - the
// one thing InventoryScreen.tsx never covered (that screen is stock-levels +
// manual adjustment only). Mirrors apps/mobile/src/inventory/ProductsScreen.tsx's
// plain-REST shape (search list + a create/edit form, no framework dialog
// component) more than apps/web's shadcn dialog, per this app's own existing
// style - reuses the same section-card/data-table/Drawer/field/btn classes
// every other desktop screen already uses rather than inventing new ones.

interface WorkingVariant {
  // Present for an already-saved row so PATCH updates it in place instead
  // of appending a new one; absent for a row added in this session.
  id?: string;
  label: string;
  sku: string;
  barcode: string;
  sellPrice: string;
  costPrice: string;
  imageId: number | null;
  imageUrl: string | null;
  imageUploading: boolean;
}

function toWorkingVariant(v: CatalogProduct['variants'][number], mediaUrlById: Record<number, string>): WorkingVariant {
  return {
    id: v.id,
    label: v.label,
    sku: v.sku,
    barcode: v.barcode ?? '',
    sellPrice: v.sellPrice != null ? String(v.sellPrice) : '',
    costPrice: v.costPrice != null ? String(v.costPrice) : '',
    imageId: v.image,
    imageUrl: v.image != null ? (mediaUrlById[v.image] ?? null) : null,
    imageUploading: false,
  };
}

// Shared by the product's own image and each variant's - image has NO
// access restriction on either side (Products.ts's field-level access
// re-locks every other field to owner/manager on update, but never this
// one), so this is never gated by `disabled`/fieldsDisabled the way every
// other input in this file is - only `uploading` (mid-request) disables it.
function ImagePicker({
  label,
  imageUrl,
  uploading,
  onPick,
  onRemove,
  compact,
}: {
  label: string;
  imageUrl: string | null;
  uploading: boolean;
  onPick: (file: File) => void;
  onRemove: () => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) onPick(file);
  }

  return (
    <div className={`product-image-picker ${compact ? 'product-image-picker-compact' : ''}`}>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="product-image-thumb" />
      ) : (
        <div className="product-image-thumb product-image-placeholder" />
      )}
      <div className="product-image-picker-actions">
        {label ? <span className="field-label">{label}</span> : null}
        <div className="section-actions">
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleChange} disabled={uploading} />
          <button type="button" className="btn btn-secondary btn-sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
            {uploading ? 'Uploading...' : imageUrl ? 'Replace' : 'Upload'}
          </button>
          {imageUrl ? (
            <button type="button" className="btn btn-ghost btn-sm" disabled={uploading} onClick={onRemove}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface ProductFormProps {
  product: CatalogProduct | null;
  canManage: boolean;
  catalog: CatalogProduct[];
  mediaUrlById: Record<number, string>;
  payloadToken: string;
  onDone: () => void;
}

// One form for both create and edit, same "isEdit ternary" pattern as
// web's product-dialog.tsx. Create is only ever reachable via the
// canManage-gated "+ New product" button below, so fieldsDisabled (the
// cashier-can-only-touch-the-photo lock) only ever applies in edit mode.
function ProductForm({ product, canManage, catalog, mediaUrlById, payloadToken, onDone }: ProductFormProps) {
  const isEdit = product != null;
  const fieldsDisabled = isEdit && !canManage;

  const [form, setForm] = useState({
    name: product?.name ?? '',
    category: product?.category ?? '',
    costPrice: product?.costPrice != null ? String(product.costPrice) : '',
    sellPrice: product ? String(product.sellPrice) : '',
    taxRate: product ? String(product.taxRate) : '0',
    reorderPoint: product?.reorderPoint != null ? String(product.reorderPoint) : '0',
    maxDiscountAmount: product?.maxDiscountAmount != null ? String(product.maxDiscountAmount) : '0',
  });
  const [imageId, setImageId] = useState<number | null>(product?.image ?? null);
  const [imageUrl, setImageUrl] = useState<string | null>(product?.image != null ? (mediaUrlById[product.image] ?? null) : null);
  const [imageUploading, setImageUploading] = useState(false);
  const [variants, setVariants] = useState<WorkingVariant[]>((product?.variants ?? []).map((v) => toWorkingVariant(v, mediaUrlById)));
  const [relatedProducts, setRelatedProducts] = useState<number[]>(product?.relatedProducts ?? []);
  const [relatedQuery, setRelatedQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [field]: e.currentTarget.value }));
  }

  async function handleProductImagePick(file: File) {
    setImageUploading(true);
    setError(null);
    try {
      const uploaded = await uploadImage(payloadToken, file);
      setImageId(uploaded.id);
      setImageUrl(uploaded.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImageUploading(false);
    }
  }

  async function handleVariantImagePick(index: number, file: File) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, imageUploading: true } : v)));
    setError(null);
    try {
      const uploaded = await uploadImage(payloadToken, file);
      setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, imageId: uploaded.id, imageUrl: uploaded.url, imageUploading: false } : v)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, imageUploading: false } : v)));
    }
  }

  function updateVariantField(index: number, field: 'label' | 'sku' | 'barcode' | 'sellPrice' | 'costPrice', value: string) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)));
  }

  function addVariant() {
    setVariants((prev) => [...prev, { label: '', sku: '', barcode: '', sellPrice: '', costPrice: '', imageId: null, imageUrl: null, imageUploading: false }]);
  }

  function removeVariant(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }

  function toggleRelated(id: number) {
    setRelatedProducts((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const relatedResults = useMemo(() => {
    const trimmed = relatedQuery.trim().toLowerCase();
    const pool = catalog.filter((p) => p.id !== product?.id);
    if (!trimmed) return pool.filter((p) => relatedProducts.includes(p.id));
    return pool.filter((p) => p.name.toLowerCase().includes(trimmed) || p.sku.toLowerCase().includes(trimmed)).slice(0, 8);
  }, [catalog, relatedQuery, relatedProducts, product]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError('Name is required');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload: ProductInput = {
        name: form.name.trim(),
        category: form.category.trim() || null,
        image: imageId,
        costPrice: Number(form.costPrice) || 0,
        sellPrice: Number(form.sellPrice) || 0,
        taxRate: Number(form.taxRate) || 0,
        maxDiscountAmount: Number(form.maxDiscountAmount) || 0,
        reorderPoint: Number(form.reorderPoint) || 0,
        variants: variants
          .filter((v) => v.label.trim())
          .map((v) => ({
            id: v.id,
            label: v.label.trim(),
            sku: v.sku || undefined,
            barcode: v.barcode || undefined,
            sellPrice: v.sellPrice === '' ? undefined : Number(v.sellPrice),
            costPrice: v.costPrice === '' ? undefined : Number(v.costPrice),
            image: v.imageId,
          })),
        relatedProducts,
      };
      if (isEdit) {
        // A cashier's request only ever actually changes `image` server-side
        // (Products.ts's field-level access) - sending just that keeps the
        // request itself honest about what it can do, rather than silently
        // no-op-ing on a payload that looks like it should do more.
        await updateProduct(payloadToken, product!.id, fieldsDisabled ? { image: imageId } : payload);
      } else {
        await createProduct(payloadToken, payload);
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleArchiveToggle() {
    if (!product) return;
    setArchiving(true);
    setError(null);
    try {
      await updateProduct(payloadToken, product.id, { isActive: !product.isActive });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setArchiving(false);
    }
  }

  async function handleDelete() {
    if (!product) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteProduct(payloadToken, product.id);
      onDone();
    } catch (err) {
      setConfirmDelete(false);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="login-form product-form">
      {fieldsDisabled ? (
        <p className="section-card-hint">
          Only owners/managers can edit this product&apos;s details - you can still update its photo (and each variant&apos;s) below.
        </p>
      ) : null}

      <ImagePicker
        label="Product image"
        imageUrl={imageUrl}
        uploading={imageUploading}
        onPick={handleProductImagePick}
        onRemove={() => {
          setImageId(null);
          setImageUrl(null);
        }}
      />

      <div className="field">
        <span className="field-label">Name</span>
        <input required disabled={fieldsDisabled} value={form.name} onChange={update('name')} />
      </div>
      <div className="field">
        <span className="field-label">Category</span>
        <input disabled={fieldsDisabled} value={form.category} onChange={update('category')} />
      </div>

      <div className="field-row">
        {canManage ? (
          <div className="field">
            <span className="field-label">Cost price</span>
            <input type="number" step="0.01" disabled={fieldsDisabled} value={form.costPrice} onChange={update('costPrice')} />
          </div>
        ) : null}
        <div className="field">
          <span className="field-label">Sell price</span>
          <input type="number" step="0.01" disabled={fieldsDisabled} value={form.sellPrice} onChange={update('sellPrice')} />
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <span className="field-label">Tax rate</span>
          <input type="number" step="0.01" disabled={fieldsDisabled} value={form.taxRate} onChange={update('taxRate')} />
        </div>
        <div className="field">
          <span className="field-label">Reorder point</span>
          <input type="number" step="1" disabled={fieldsDisabled} value={form.reorderPoint} onChange={update('reorderPoint')} />
        </div>
        <div className="field">
          <span className="field-label">Max discount</span>
          <input type="number" step="0.01" min="0" disabled={fieldsDisabled} value={form.maxDiscountAmount} onChange={update('maxDiscountAmount')} />
        </div>
      </div>

      <div className="section-card">
        <div className="section-card-toolbar">
          <h3>Variants</h3>
          {!fieldsDisabled ? (
            <button type="button" className="btn btn-secondary btn-sm" onClick={addVariant}>
              Add variant
            </button>
          ) : null}
        </div>
        {variants.length === 0 ? (
          <p className="section-card-hint">No variants - this product is sold as-is. Add one for options like size or color.</p>
        ) : (
          variants.map((v, index) => (
            <div key={v.id ?? `new-${index}`} className="product-variant-row">
              <ImagePicker
                label=""
                compact
                imageUrl={v.imageUrl}
                uploading={v.imageUploading}
                onPick={(file) => handleVariantImagePick(index, file)}
                onRemove={() => setVariants((prev) => prev.map((x, i) => (i === index ? { ...x, imageId: null, imageUrl: null } : x)))}
              />
              <div className="product-variant-fields">
                <input
                  placeholder="Label (e.g. Red / L)"
                  disabled={fieldsDisabled}
                  value={v.label}
                  onChange={(e) => updateVariantField(index, 'label', e.currentTarget.value)}
                />
                <div className="field-row">
                  <input placeholder="SKU" disabled={fieldsDisabled} value={v.sku} onChange={(e) => updateVariantField(index, 'sku', e.currentTarget.value)} />
                  <input
                    placeholder="Barcode"
                    disabled={fieldsDisabled}
                    value={v.barcode}
                    onChange={(e) => updateVariantField(index, 'barcode', e.currentTarget.value)}
                  />
                </div>
                <div className="field-row">
                  <input
                    type="number"
                    step="0.01"
                    placeholder={`Sell (${form.sellPrice || '0'})`}
                    disabled={fieldsDisabled}
                    value={v.sellPrice}
                    onChange={(e) => updateVariantField(index, 'sellPrice', e.currentTarget.value)}
                  />
                  {canManage ? (
                    <input
                      type="number"
                      step="0.01"
                      placeholder={`Cost (${form.costPrice || '0'})`}
                      disabled={fieldsDisabled}
                      value={v.costPrice}
                      onChange={(e) => updateVariantField(index, 'costPrice', e.currentTarget.value)}
                    />
                  ) : null}
                </div>
              </div>
              {!fieldsDisabled ? (
                <button type="button" className="btn btn-ghost btn-icon" onClick={() => removeVariant(index)} aria-label="Remove variant">
                  <XIcon />
                </button>
              ) : null}
            </div>
          ))
        )}
      </div>

      <div className="section-card">
        <h3>Related products</h3>
        <p className="section-card-hint">Suggested as add-ons on the Sell page once this product is in the cart.</p>
        {!fieldsDisabled ? (
          <input placeholder="Search to add..." value={relatedQuery} onChange={(e) => setRelatedQuery(e.currentTarget.value)} />
        ) : null}
        {relatedResults.length === 0 ? (
          <p className="section-card-hint">{relatedQuery.trim() ? 'No matches' : 'No related products linked yet.'}</p>
        ) : (
          <ul className="find-sale-list">
            {relatedResults.map((p) => (
              <li key={p.id}>
                <button type="button" className="btn btn-ghost btn-block" disabled={fieldsDisabled} onClick={() => toggleRelated(p.id)}>
                  {relatedProducts.includes(p.id) ? '✓ ' : ''}
                  {p.name} · {p.sku}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error ? <p className="error-banner">{error}</p> : null}

      <div className="product-form-actions">
        {isEdit && canManage ? (
          <div className="section-actions">
            <button
              type="button"
              className={`btn ${product!.isActive ? 'btn-danger' : 'btn-secondary'} btn-sm`}
              disabled={archiving || deleting}
              onClick={handleArchiveToggle}
            >
              {archiving ? 'Saving...' : product!.isActive ? 'Archive' : 'Restore'}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" disabled={archiving || deleting} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          </div>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create product'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${product?.name ?? 'this product'}?`}
        message="This cannot be undone. If this product has any order or stock-movement history, the delete will be blocked - archive it instead to hide it while keeping records intact."
        confirmLabel="Delete permanently"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={handleDelete}
      />
    </form>
  );
}

type EditTarget = { mode: 'create' } | { mode: 'edit'; product: CatalogProduct };

export function Products({ user, payloadToken }: { user: PayloadUser; payloadToken: string }) {
  // Matches Products.ts's own managerOrOwnerField - a cashier can still see
  // and open every product (to change its photo), just not create one or
  // edit any other field.
  const canManage = user.role === 'owner' || user.role === 'manager';
  const tenantId = typeof user.tenant === 'object' ? user.tenant.id : user.tenant;

  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [mediaUrlById, setMediaUrlById] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);

  const refresh = useCallback(() => {
    if (tenantId == null) return;
    // Unlike the Sell/Inventory catalog fetches, this deliberately passes
    // activeOnly: false - an archived product still needs to show up here
    // (this is the screen where it gets restored), unlike screens where it
    // should stay hidden from an active sale/adjustment flow.
    Promise.all([fetchCatalog(payloadToken, tenantId, { activeOnly: false }), fetchMediaUrlMap(payloadToken)])
      .then(([products, media]) => {
        setCatalog(products);
        setMediaUrlById(media);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [payloadToken, tenantId]);

  useEffect(refresh, [refresh]);

  const filtered = useMemo(() => {
    const trimmed = search.trim().toLowerCase();
    if (!trimmed) return catalog;
    return catalog.filter(
      (p) =>
        p.name.toLowerCase().includes(trimmed) ||
        p.sku.toLowerCase().includes(trimmed) ||
        (p.barcode ?? '').toLowerCase().includes(trimmed) ||
        (p.category ?? '').toLowerCase().includes(trimmed),
    );
  }, [catalog, search]);

  function handleDone() {
    setEditTarget(null);
    refresh();
  }

  return (
    <div className="section-shell">
      <div className="section-card">
        <div className="section-card-toolbar">
          <h3>Products</h3>
          <input placeholder="Search by name, SKU, barcode, or category..." value={search} onChange={(e) => setSearch(e.currentTarget.value)} />
          <div className="section-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={refresh}>
              Refresh
            </button>
            {canManage ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditTarget({ mode: 'create' })}>
                + New product
              </button>
            ) : null}
          </div>
        </div>

        {loadError ? <p className="error-banner">{loadError}</p> : null}

        {loading ? (
          <p className="section-card-hint">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="section-card-hint">No products found.</p>
        ) : (
          <table className="data-table clickable-rows">
            <tbody>
              {filtered.map((p) => {
                const imageUrl = p.image != null ? mediaUrlById[p.image] : undefined;
                return (
                  <tr key={p.id} onClick={() => setEditTarget({ mode: 'edit', product: p })}>
                    <td className="product-row-thumb-cell">
                      {imageUrl ? (
                        <img src={imageUrl} alt="" className="product-row-thumb" />
                      ) : (
                        <span className="product-row-thumb product-row-thumb-placeholder" />
                      )}
                    </td>
                    <td>
                      {p.name}
                      {p.variants.length > 0 ? <span className="section-card-hint"> · {p.variants.length} variants</span> : null}
                      {!p.isActive ? <span className="section-card-hint"> · Archived</span> : null}
                      <br />
                      <span className="section-card-hint">
                        {p.sku || 'No SKU'}
                        {p.category ? ` · ${p.category}` : ''}
                      </span>
                    </td>
                    <td className="num">{p.sellPrice.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Drawer open={editTarget != null} onClose={() => setEditTarget(null)} title={editTarget?.mode === 'edit' ? editTarget.product.name : 'New product'}>
        {editTarget ? (
          <ProductForm
            key={editTarget.mode === 'edit' ? editTarget.product.id : 'new'}
            product={editTarget.mode === 'edit' ? editTarget.product : null}
            canManage={canManage}
            catalog={catalog}
            mediaUrlById={mediaUrlById}
            payloadToken={payloadToken}
            onDone={handleDone}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
