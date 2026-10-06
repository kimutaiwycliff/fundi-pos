import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getPayload, type Payload } from 'payload';
import sharp from 'sharp';
import config from '../payload.config.ts';

let payload: Payload;

async function truncateAll() {
  const tables = [
    'orders_line_items', 'orders', 'stock_movements', 'products', 'customers', 'users_sessions', 'users', 'stores',
    'platform_audit_log', 'tenants_addons', 'tenants',
  ];
  await payload.db.drizzle.execute(`TRUNCATE ${tables.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE;`);
}

async function upload(tenant: number, colour: string, width = 2000, height = 2500) {
  const data = await sharp({ create: { width, height, channels: 3, background: colour } }).png().toBuffer();
  return payload.create({
    collection: 'media',
    data: { tenant, alt: `${colour} photo` } as never,
    file: { data, mimetype: 'image/png', name: `test-${colour.replace('#', '')}-${width}.png`, size: data.length },
    overrideAccess: true,
  });
}

describe('Product photo galleries', () => {
  let tenantId: number;
  const mediaIds: Array<number | string> = [];

  beforeAll(async () => {
    payload = await getPayload({ config });
  });

  afterAll(async () => {
    // Removes the uploaded files from disk too.
    for (const id of mediaIds) await payload.delete({ collection: 'media', id, overrideAccess: true }).catch(() => undefined);
    await payload.destroy();
  });

  beforeEach(async () => {
    await truncateAll();
    const tenant = await payload.create({
      collection: 'tenants',
      data: { name: 'Gallery Shop', status: 'active', subscriptionTier: 'starter', billingStatus: 'active', addons: ['sell_online'], shopSlug: 'gallery-shop', storefrontEnabled: true },
      overrideAccess: true,
    });
    tenantId = tenant.id as number;
  });

  it('makes thumb/card/large WebP copies on upload, never enlarging small images', async () => {
    const big = await upload(tenantId, '#ff0000');
    const small = await upload(tenantId, '#00ff00', 300, 300);
    mediaIds.push(big.id, small.id);
    const sizes = big.sizes as Record<string, { width?: number; mimeType?: string; url?: string }>;
    expect(sizes.thumb.width).toBe(240);
    expect(sizes.card.width).toBe(640);
    expect(sizes.large.width).toBe(1600);
    expect(sizes.large.mimeType).toBe('image/webp');
    const smallSizes = small.sizes as Record<string, { width?: number | null; url?: string | null }>;
    // A 300px original is never upscaled - any "large" copy stays <= 300px.
    expect(smallSizes.large.width ?? 0).toBeLessThanOrEqual(300);
  });

  it('serves cover + gallery (product and variant) with resized URLs, cover first, no duplicates', async () => {
    const cover = await upload(tenantId, '#111111');
    const back = await upload(tenantId, '#222222');
    const pink = await upload(tenantId, '#ff88aa');
    const pinkDetail = await upload(tenantId, '#ffaacc');
    mediaIds.push(cover.id, back.id, pink.id, pinkDetail.id);

    await payload.create({
      collection: 'products',
      data: {
        tenant: tenantId, sku: 'ROMP', name: 'Romper', costPrice: 100, sellPrice: 1000, taxRate: 0, reorderPoint: 0, maxDiscountAmount: 0,
        showOnline: true,
        image: cover.id,
        gallery: [back.id, cover.id], // duplicate of the cover is dropped
        variants: [{ label: 'Pink', image: pink.id, gallery: [pinkDetail.id] }],
      } as never,
      overrideAccess: true,
      draft: false,
    });

    const { GET } = await import('../app/api/storefront/[slug]/route.ts');
    const body = await (await GET(new Request('http://test'), { params: Promise.resolve({ slug: 'gallery-shop' }) })).json();
    const [product] = body.products;
    expect(product.images.map((i: { alt: string }) => i.alt)).toEqual(['#111111 photo', '#222222 photo']);
    const first = product.images[0];
    expect(first.thumb).not.toBe(first.url);
    expect(first.large).toContain('.webp');
    expect(product.image).toBe(first.card); // grid uses the card-size cover
    expect(product.variants[0].images.map((i: { alt: string }) => i.alt)).toEqual(['#ff88aa photo', '#ffaacc photo']);
  });

  it("keeps a variant's gallery when a till saves the variants without it", async () => {
    const pink = await upload(tenantId, '#cc5577');
    const detail = await upload(tenantId, '#dd7799');
    mediaIds.push(pink.id, detail.id);
    const product = await payload.create({
      collection: 'products',
      data: {
        tenant: tenantId, sku: 'KEEP', name: 'Keep', costPrice: 1, sellPrice: 5, taxRate: 0, reorderPoint: 0, maxDiscountAmount: 0,
        variants: [{ label: 'Pink', image: pink.id, gallery: [detail.id] }],
      } as never,
      overrideAccess: true,
      draft: false,
    });
    const variantId = (product.variants as Array<{ id: string }>)[0].id;
    // Exactly what the Android/desktop till sends when editing a variant.
    const updated = await payload.update({
      collection: 'products',
      id: product.id,
      data: { variants: [{ id: variantId, label: 'Pink (new)', image: pink.id }] } as never,
      overrideAccess: true,
      depth: 0,
    });
    const variant = (updated.variants as Array<{ label: string; gallery?: unknown[] }>)[0];
    expect(variant.label).toBe('Pink (new)');
    expect(variant.gallery).toEqual([detail.id]);
  });

  it('still works for products with only an old single photo and none at all', async () => {
    await payload.create({
      collection: 'products',
      data: { tenant: tenantId, sku: 'PLAIN', name: 'Plain', costPrice: 1, sellPrice: 5, taxRate: 0, reorderPoint: 0, maxDiscountAmount: 0, showOnline: true } as never,
      overrideAccess: true,
      draft: false,
    });
    const { GET } = await import('../app/api/storefront/[slug]/route.ts');
    const body = await (await GET(new Request('http://test'), { params: Promise.resolve({ slug: 'gallery-shop' }) })).json();
    expect(body.products[0]).toMatchObject({ image: null, images: [] });
  });
});
