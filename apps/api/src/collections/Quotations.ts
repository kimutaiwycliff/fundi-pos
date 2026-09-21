import type { CollectionConfig } from 'payload';
import { normalizeKenyanPhone } from '@hardware-pos/business-logic';
import { APIError } from 'payload';
import { managerOrOwner } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';

// A quotation never touches stock/orders/shifts - it exists purely to
// generate a professional PDF telling a customer what they'd pay, with
// freely-editable prices (not constrained to catalog price or any
// discount cap, unlike a real sale - see sell-client.tsx/SellScreen.tsx/
// Till.tsx's maxDiscountAmountForLine for that separate, real-sale-only
// constraint). Line-item shape mirrors PurchaseOrders.ts's own
// product/variant + qty + unconstrained price convention - the closest
// existing precedent for "a price a client can type freely, never
// server-validated against the catalog."
export const Quotations: CollectionConfig = {
  slug: 'quotations',
  admin: { useAsTitle: 'name' },
  access: {
    read: managerOrOwner,
    create: managerOrOwner,
    update: managerOrOwner,
    delete: managerOrOwner,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'store', type: 'relationship', relationTo: 'stores' },
    // Computed in beforeChange below from customerName + the creation
    // date ("Jane Doe - 21 Sep 2026") - server-side, not left to each of
    // the three client builders to get right independently. Falls back
    // to "Walk-in" when no customer name was given. useAsTitle above
    // points here instead of the bare numeric id every display site
    // used to show ("Quotation #7").
    { name: 'name', type: 'text', admin: { readOnly: true } },
    { name: 'customerName', type: 'text' },
    { name: 'customerPhone', type: 'text', admin: { description: 'e.g. 0712345678 - used to send the quotation via WhatsApp.' } },
    { name: 'notes', type: 'textarea', admin: { description: 'Optional - e.g. validity period, terms. Printed at the bottom of the PDF.' } },
    {
      name: 'lineItems',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'product', type: 'relationship', relationTo: 'products', required: true },
        // Sub-document id within product.variants, same convention as
        // PurchaseOrders.ts/StockMovements.ts's own `variant` field.
        { name: 'variant', type: 'text' },
        // Snapshot of the product/variant's display name at the time this
        // line was added - the PDF route reads this directly rather than
        // populating `product`, so a quotation's wording never silently
        // changes if the product is later renamed or deleted.
        { name: 'label', type: 'text', required: true },
        { name: 'quantity', type: 'number', required: true, min: 0.001 },
        { name: 'unitPrice', type: 'number', required: true, admin: { step: 0.01 } },
      ],
    },
    // Always server-recomputed in beforeChange below from lineItems -
    // never trusted from the client, same reasoning as Orders.total.
    { name: 'total', type: 'number', required: true, admin: { readOnly: true, step: 0.01 } },
    { name: 'createdBy', type: 'relationship', relationTo: 'users', admin: { hidden: true } },
  ],
  hooks: {
    beforeChange: [
      enforceOwnTenant({ requireOwnStore: true }),
      ({ data, req, operation, originalDoc }) => {
        if (Array.isArray(data.lineItems)) {
          data.total = data.lineItems.reduce(
            (sum: number, line: Record<string, unknown>) => sum + Number(line.quantity) * Number(line.unitPrice),
            0,
          );
        }
        if (operation === 'create' && req.user) {
          data.createdBy = req.user.id;
        }
        // Recomputed on every save (not just create) so editing the
        // customer name later keeps the label accurate - always anchored
        // to the ORIGINAL creation date, not the edit date, via
        // originalDoc.createdAt when one exists.
        const createdAt = operation === 'create' ? new Date() : new Date(originalDoc?.createdAt ?? Date.now());
        const formattedDate = createdAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        // A partial update that doesn't touch customerName at all (e.g.
        // only editing notes) must not be treated as "customerName is now
        // blank" - fall back to the existing doc's value in that case,
        // only an explicit '' actually means "clear it."
        const customerNameRaw = data.customerName !== undefined ? data.customerName : originalDoc?.customerName;
        const customerName = typeof customerNameRaw === 'string' ? customerNameRaw.trim() : '';
        data.name = `${customerName || 'Walk-in'} - ${formattedDate}`;
        return data;
      },
      // Same normalization Customers.ts/Users.ts already do - optional
      // here (a quotation can exist before a phone is known), but
      // validated when present so the WhatsApp send flow always has a
      // clean number.
      ({ data }) => {
        if (data?.customerPhone) {
          const normalized = normalizeKenyanPhone(String(data.customerPhone));
          if (!normalized) {
            throw new APIError('Enter a valid Kenyan phone number, e.g. 0712345678.', 400);
          }
          data.customerPhone = normalized;
        }
        return data;
      },
    ],
  },
};
