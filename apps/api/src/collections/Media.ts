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
    create: managerOrOwner,
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
