import type { CollectionConfig } from 'payload';
import { APIError } from 'payload';
import { normalizeKenyanPhone } from '@hardware-pos/business-logic';
import { isAuthenticated, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';

export const Customers: CollectionConfig = {
  slug: 'customers',
  admin: { useAsTitle: 'name' },
  access: {
    read: ownTenantOnly,
    // Any authenticated tenant user (incl. cashiers) can register/update a
    // customer profile at checkout time for loyalty tracking.
    create: isAuthenticated,
    update: ownTenantOnly,
    delete: () => false,
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'name', type: 'text', required: true },
    { name: 'phone', type: 'text', index: true },
    // Optional - only needed to email a credit-sale invoice (see
    // apps/web's Sales/Sell pages). Payload's built-in email type validates
    // format for us.
    { name: 'email', type: 'email' },
    { name: 'loyaltyPoints', type: 'number', required: true, defaultValue: 0 },
  ],
  hooks: {
    beforeChange: [
      enforceOwnTenant(),
      // Applies wherever a customer is created/updated (desktop till quick-add,
      // web dashboard's New customer dialog, any future caller) so none of
      // them can drift out of sync with each other on what counts as valid.
      ({ data }) => {
        if (data?.phone) {
          const normalized = normalizeKenyanPhone(String(data.phone));
          if (!normalized) {
            throw new APIError('Enter a valid Kenyan phone number, e.g. 0712345678.', 400);
          }
          data.phone = normalized;
        }
        return data;
      },
    ],
  },
};
