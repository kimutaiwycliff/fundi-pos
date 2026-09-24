import type { CollectionConfig } from 'payload';
import { managerOrOwner, ownTenantOnly } from '../access/index.ts';
import { enforceOwnTenant } from '../hooks/enforceTenant.ts';

// Product/variant photos, stored via the s3Storage plugin (payload.config.ts)
// against Cloudflare R2 - collection-level access still gates who can see/
// upload/delete a tenant's image records through the API, same as every
// other tenant-scoped collection here, even though the actual file bytes
// are served from R2's own public URL (disablePayloadAccessControl: true)
// rather than proxied through Payload.
export const Media: CollectionConfig = {
  slug: 'media',
  admin: { useAsTitle: 'alt' },
  access: {
    read: ownTenantOnly,
    // Not managerOrOwner: Products.ts deliberately leaves the product/
    // variant `image` field open to any tenant user (a cashier needs to be
    // able to change a product's own photo), but that update is a two-step
    // process - upload the file here first, then PATCH the product to point
    // at it. Gating create to managerOrOwner silently broke the cashier
    // half of that despite the field access implying it should work -
    // caught live: a cashier's upload 403'd before ever reaching Products.ts.
    create: ownTenantOnly,
    update: managerOrOwner,
    delete: managerOrOwner,
  },
  upload: {
    mimeTypes: ['image/*'],
  },
  fields: [
    { name: 'tenant', type: 'relationship', relationTo: 'tenants', required: true, index: true },
    { name: 'alt', type: 'text', admin: { description: 'Optional - describes the image for accessibility.' } },
  ],
  hooks: {
    beforeChange: [enforceOwnTenant()],
  },
};
