import type { CollectionConfig, FieldAccess } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';
import { generateProductCodes } from '../hooks/generateProductCodes.ts';
import { isTenantUser, toID } from '../lib/relations.ts';

// FIELD-level access, not access/index.ts's collection-level managerOrOwner -
// that one is typed `Access` (returns a Where clause for row-filtering) and
// isn't assignable to a field's own `access.update`/`access.read`, which
// must return a plain boolean. Using it directly here would still typecheck-
// fail (confirmed live), and worse, would be a real bug if the type were
// forced: a returned Where object is truthy, so every field guarded with it
// would silently evaluate as "allowed" for ANY tenant user, not just
// manager/owner. This is the field-level equivalent - same owner-or-manager
// check, boolean return - reused below both to gate costPrice's visibility
// and to lock every other writable field back down once the collection's
// own `update` access is loosened to let a cashier through at all (see
// below, for the image field's sake).
const managerOrOwnerField: FieldAccess = ({ req }) =>
  req.user?.collection === 'platform-admins' || req.user?.role === 'owner' || req.user?.role === 'manager';

export const Products: CollectionConfig = {
  slug: 'products',
  admin: { useAsTitle: 'name' },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    // Loosened from managerOrOwner: a cashier can now attempt an update at
    // all (needed so they can change a product's own image at will), but
    // every field below except `image` re-locks itself to managerOrOwner
    // at the field level - Payload checks collection access first (can
    // this operation be attempted?) and field access second (which fields
    // in the request actually get applied), so this alone doesn't open
    // anything else up.
    update: ownTenantOnly,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    // Not schema-required: a blank sku/barcode (here, and on each variant
    // below) is always filled in by the generateProductCodes beforeValidate
    // hook before Payload's own required-field check would ever run - the
    // dashboard's product dialog hides both fields entirely and never sends
    // one, per the user's own instruction not to have to deal with them.
    { name: 'sku', type: 'text', index: true, access: { update: managerOrOwnerField } },
    { name: 'barcode', type: 'text', index: true, access: { update: managerOrOwnerField } },
    { name: 'name', type: 'text', required: true, access: { update: managerOrOwnerField } },
    { name: 'category', type: 'text', access: { update: managerOrOwnerField } },
    {
      // Deliberately no access.update override here - any tenant user
      // (cashier included) can change a product's own photo. Everything
      // else on this collection stays manager/owner-only.
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
      access: { update: managerOrOwnerField },
      admin: {
        description: 'Archived products are hidden from the Sell page and the default Products list, but stay intact on past orders, stock movements, and reports.',
      },
    },
    {
      name: 'variants',
      type: 'array',
      // Deliberately NO access.update override at the array level - tested
      // live and confirmed an array field's own access gates the WHOLE
      // array (any change to it, including just a sub-field on an existing
      // row), not just structural add/remove. Restricting it here would
      // have blocked a cashier from touching a variant's `image` too,
      // defeating the point. Every sub-field below still has its own
      // access.update, individually - that's what actually stops a
      // cashier from changing label/sku/price, whether on an existing row
      // or one they try to add.
      fields: [
        { name: 'label', type: 'text', required: true, access: { update: managerOrOwnerField } }, // e.g. "Red / L"
        { name: 'sku', type: 'text', access: { update: managerOrOwnerField } },
        { name: 'barcode', type: 'text', access: { update: managerOrOwnerField } },
        // Denormalized copy of the parent product's own tenant, stamped in
        // beforeChange below - PowerSync's sync rules don't support joins
        // (see Orders.ts's lineItems.tenantId for the full explanation),
        // so products_variants's stream can't reach this via `JOIN
        // products` the way docker/powersync/sync-config.yaml previously
        // tried to. Never read/written by any client - hidden on purpose.
        { name: 'tenantId', type: 'number', admin: { hidden: true } },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          admin: { description: "Optional. Leave blank to use the product's own image." },
        },
        // Null/unset means "use the product's own price" - most variants
        // (e.g. a T-shirt's colors) don't need their own price, but some
        // (e.g. a drill's battery-capacity options) genuinely do.
        {
          name: 'sellPrice',
          type: 'number',
          admin: { step: 0.01, description: "Leave blank to use the product's own sell price." },
          access: { update: managerOrOwnerField },
        },
        {
          name: 'costPrice',
          type: 'number',
          admin: { step: 0.01, description: "Leave blank to use the product's own cost price." },
          // Same owner/manager-only visibility as the product-level
          // costPrice field below - a variant's cost shouldn't leak margin
          // info to a cashier just because it happens to live inside an
          // array.
          access: { read: managerOrOwnerField, update: managerOrOwnerField },
        },
      ],
    },
    {
      name: 'costPrice',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: { step: 0.01 },
      // Cost (and therefore margin) is owner/manager-only - it never comes
      // back in any response to a cashier's own session, and a cashier's
      // update request can't change it either (overrideAccess: true
      // server-side code - reports, receipts - is unaffected either way).
      access: { read: managerOrOwnerField, update: managerOrOwnerField },
    },
    { name: 'sellPrice', type: 'number', required: true, defaultValue: 0, admin: { step: 0.01 }, access: { update: managerOrOwnerField } },
    { name: 'taxRate', type: 'number', required: true, defaultValue: 0, admin: { step: 0.01 }, access: { update: managerOrOwnerField } },
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
      access: { update: managerOrOwnerField },
    },
    {
      name: 'reorderPoint',
      type: 'number',
      required: true,
      defaultValue: 0,
      admin: { description: 'Dashboard flags this product as low-stock per store once on-hand quantity drops to or below this.' },
      access: { update: managerOrOwnerField },
    },
    { name: 'isBundle', type: 'checkbox', defaultValue: false, access: { update: managerOrOwnerField } },
    {
      name: 'bundleComponents',
      type: 'array',
      admin: { condition: (data) => Boolean(data?.isBundle) },
      access: { update: managerOrOwnerField },
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
      access: { update: managerOrOwnerField },
    },
  ],
  hooks: {
    beforeValidate: [generateProductCodes],
    beforeChange: [
      enforceOwnTenant(),
      // See variants.tenantId's own comment above. Unlike Orders.lineItems
      // (create-only), a product's variants array is genuinely editable
      // after creation (add/remove/reprice a variant), so this re-stamps
      // on every save rather than only at create.
      ({ data }) => {
        if (Array.isArray(data.variants)) {
          data.variants = data.variants.map((variant: Record<string, unknown>) => ({
            ...variant,
            tenantId: Number(data.tenant),
          }));
        }
        return data;
      },
    ],
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
