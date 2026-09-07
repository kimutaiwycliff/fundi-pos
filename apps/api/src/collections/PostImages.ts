import type { CollectionConfig } from 'payload';

// Cover images for blog Posts - deliberately a SEPARATE upload collection
// from Media.ts, not a reuse of it. Media is tenant-scoped (every doc has a
// required `tenant` relationship and is gated by ownTenantOnly/managerOrOwner);
// blog images are public marketing content with no tenant at all, so reusing
// Media's access rules would be wrong in both directions - public visitors
// couldn't read tenant-scoped images, and this collection's own public-read
// rule below would otherwise leak into Media if merged.
export const PostImages: CollectionConfig = {
  slug: 'post-images',
  admin: { useAsTitle: 'alt' },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.collection === 'platform-admins',
    update: ({ req }) => req.user?.collection === 'platform-admins',
    delete: ({ req }) => req.user?.collection === 'platform-admins',
  },
  upload: { mimeTypes: ['image/*'] },
  fields: [{ name: 'alt', type: 'text', required: true, admin: { description: 'Describes the image for accessibility.' } }],
};
