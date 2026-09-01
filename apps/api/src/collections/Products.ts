import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
import { generateProductCodes } from '../hooks/generateProductCodes.ts';
import { isTenantUser, toID } from '../lib/relations.ts';

export const Products: CollectionConfig = {
  slug: 'products',
  admin: { useAsTitle: 'name' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    // Not schema-required: a blank sku/barcode (here, and on each variant
    // below) is always filled in by the generateProductCodes beforeValidate
    // hook before Payload's own required-field check would ever run - the
    // dashboard's product dialog hides both fields entirely and never sends
    // one, per the user's own instruction not to have to deal with them.
    { name: 'sku', type: 'text', index: true },
    { name: 'barcode', type: 'text', index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'category', type: 'text' },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      admin: { description: "Optional. Shown on the Sell page and Products list. A variant without its own image below falls back to this one." },
    },
    {
      name: 'isActive',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: {
        description: 'Archived products are hidden from the Sell page and the default Products list, but stay intact on past orders, stock movements, and reports.',
      },
    },
    {
      name: 'variants',
      type: 'array',
      fields: [
        { name: 'label', type: 'text', required: true }, // e.g. "Red / L"
        { name: 'sku', type: 'text' },
        { name: 'barcode', type: 'text' },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          admin: { description: "Optional. Leave blank to use the product's own image." },
        },
        // Null/unset means "use the product's own price" - most variants
        // (e.g. a T-shirt's colors) don't need their own price, but some
        // (e.g. a drill's battery-capacity options) genuinely do.
        { name: 'sellPrice', type: 'number', admin: { step: 0.01, description: "Leave blank to use the product's own sell price." } },
        {
          name: 'costPrice',
          type: 'number',
          admin: { step: 0.01, description: "Leave blank to use the product's own cost price." },
          // Same owner-only visibility as the product-level costPrice field
          // above - a variant's cost shouldn't leak margin info to non-owners
          // just because it happens to live inside an array.
          access: { read: ({ req }) => req.user?.collection === 'platform-admins' || req.user?.role === 'owner' },
        },
      ],
    },
    {
      name: 'costPrice',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: { step: 0.01 },
      // Cost (and therefore margin) is owner-only - a manager/cashier can
      // still set it when receiving stock (collection-level create/update
      // stays managerOrOwner below), but it never comes back in any
      // response to their own session afterward. overrideAccess: true
      // server-side code (reports, receipts) is unaffected.
      access: { read: ({ req }) => req.user?.collection === 'platform-admins' || req.user?.role === 'owner' },
    },
    { name: 'sellPrice', type: 'number', required: true, defaultValue: 0, admin: { step: 0.01 } },
    { name: 'taxRate', type: 'number', required: true, defaultValue: 0, admin: { step: 0.01 } },
    {
      // Caps how much a cashier can knock off this specific product's line
      // total at the till (see cart-panel.tsx's discount input, clamped to
      // this * quantity). A flat currency amount per unit, not a percentage
      // - per the user's own instruction, entering a discount cap should be
      // a value someone can read straight off without doing sellPrice math.
      // Defaults to 0 - no discount is allowed unless a manager/owner
      // explicitly opts a product into one.
      name: 'maxDiscountAmount',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      admin: { step: 0.01, description: 'Maximum amount a cashier may discount this product by per unit at the till. 0 = no discount allowed.' },
    },
    {
      name: 'reorderPoint',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: { description: 'Dashboard flags this product as low-stock per store once on-hand quantity drops to or below this.' },
    },
    { name: 'isBundle', type: 'checkbox', defaultValue: false },
    {
      name: 'bundleComponents',
      type: 'array',
      admin: { condition: (data) => Boolean(data?.isBundle) },
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products', required: true },
        { name: 'quantity', type: 'number', required: true, defaultValue: 1 },
      ],
    },
    {
      // Cross-sell/accessory suggestions ("frequently bought with"), not a
      // bundle - each side is sold and priced independently. Surfaced on
      // the Sell page as an add-on suggestion once the anchor product is
      // in the cart.
      name: 'relatedProducts',
      type: 'relationship',
      relationTo: 'products',
      hasMany: true,
    },
  ],
  hooks: {
    beforeValidate: [generateProductCodes],
    beforeChange: [enforceOwnTenant()],
    afterChange: [
      // Multi-staff accountability: a manager quietly discounting or
      // marking up a product should leave a trail. Only fires when a price
      // actually changed on an update - never on create (nothing to
      // compare against) and never a no-op edit of an unrelated field.
      async ({ doc, previousDoc, operation, req }) => {
        if (operation !== 'update' || !previousDoc || !isTenantUser(req.user)) return doc;

        const changes: string[] = [];
        const metadata: Record<string, { from: number; to: number }> = {};
        if (previousDoc.costPrice !== doc.costPrice) {
          changes.push(`cost ${previousDoc.costPrice} -> ${doc.costPrice}`);
          metadata.costPrice = { from: previousDoc.costPrice, to: doc.costPrice };
        }
        if (previousDoc.sellPrice !== doc.sellPrice) {
          changes.push(`sell ${previousDoc.sellPrice} -> ${doc.sellPrice}`);
          metadata.sellPrice = { from: previousDoc.sellPrice, to: doc.sellPrice };
        }
        if (changes.length === 0) return doc;

        await req.payload.create({
          collection: 'audit-log',
          data: {
            tenant: Number(toID(doc.tenant)),
            actor: Number(req.user.id),
            action: 'price_changed',
            entityType: 'product',
            entityId: String(doc.id),
            summary: `${doc.name}: ${changes.join(', ')}`,
            metadata,
          },
          overrideAccess: true,
          req,
        });
        return doc;
      },
    ],
  },
};
