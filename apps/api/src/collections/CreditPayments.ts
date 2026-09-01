import type { CollectionConfig } from 'payload';
import { managerOrOwner, neverDelete, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';

// Append-only installment ledger for credit ("pay later") sales - same
// principle as StockMovements: an order's amountPaid/balance is always a
// derived sum over these rows, never a stored counter on Orders itself, so
// there's no way for a running total to drift from the individual payments
// that made it up. Written only via /api/orders/[id]/record-payment (which
// also flips the order to paymentStatus:'paid' once the balance hits zero);
// collection-level create access is a backstop, not the real authorization
// path (that route re-checks role/PIN itself, same as settle/authorize-status).
export const CreditPayments: CollectionConfig = {
  slug: 'credit-payments',
  admin: { useAsTitle: 'id', defaultColumns: ['order', 'amount', 'paidAt', 'recordedBy'] },
  access: {
    read: ownTenantOnly,
    create: managerOrOwner,
    update: () => false,
    delete: neverDelete,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'order', type: 'relationship', relationTo: 'orders', required: true, index: true },
    { name: 'amount', type: 'number', required: true, admin: { step: 0.01 } },
    {
      name: 'method',
      type: 'select',
      required: true,
      defaultValue: 'cash',
      options: ['cash', 'mpesa', 'card', 'other'],
    },
    { name: 'note', type: 'text' },
    { name: 'recordedBy', type: 'relationship', relationTo: 'users', required: true },
    { name: 'paidAt', type: 'date', required: true },
  ],
  hooks: {
    beforeChange: [enforceOwnTenant()],
  },
};
