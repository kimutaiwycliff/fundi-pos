import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
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
    { name: 'sku', type: 'text', required: true, index: true },
    { name: 'barcode', type: 'text', index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'category', type: 'text' },
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
        { name: 'sku', type: 'text', required: true },
        { name: 'barcode', type: 'text' },
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
    { name: 'taxRate', type: 'number', required: true, defaultValue: 0.16, admin: { step: 0.01 } },
    {
      // Caps how much a cashier can knock off this specific product's line
      // total at the till (see Till.tsx's discount input, clamped to this).
      // Defaults to 0 - no discount is allowed unless a manager/owner
      // explicitly opts a product into one, per the user's own instruction.
      name: 'maxDiscountPercent',
      type: 'number',
      required: true,
      defaultValue: 0,
      min: 0,
      max: 100,
      admin: { step: 1, description: 'Maximum % a cashier may discount this product at the till. 0 = no discount allowed.' },
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
