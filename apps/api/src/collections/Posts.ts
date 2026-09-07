import type { CollectionConfig } from 'payload';
import { lexicalEditor } from '@payloadcms/richtext-lexical';

// Public blog content for SEO - the first "public read" collection in this
// codebase. Every other collection is tenant-scoped (see access/index.ts's
// header comment); this is deliberately the opposite shape: platform-owned
// content (like PlatformAdmins.ts), not tenant-owned, with no `tenant`
// field at all. Published posts are readable by anyone (no auth); drafts
// are visible only in the admin panel to platform admins, who are also the
// only ones who can write.
export const Posts: CollectionConfig = {
  slug: 'posts',
  admin: { useAsTitle: 'title', defaultColumns: ['title', 'status', 'publishedAt'] },
  access: {
    read: ({ req }) => {
      if (req.user?.collection === 'platform-admins') return true;
      return { status: { equals: 'published' } };
    },
    create: ({ req }) => req.user?.collection === 'platform-admins',
    update: ({ req }) => req.user?.collection === 'platform-admins',
    delete: ({ req }) => req.user?.collection === 'platform-admins',
  },
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'slug',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      admin: { description: 'URL path segment, e.g. "etims-compliance-2026" for /blog/etims-compliance-2026.' },
    },
    { name: 'excerpt', type: 'textarea', required: true, admin: { description: 'Shown on the blog list page and used as the default meta description.' } },
    { name: 'content', type: 'richText', editor: lexicalEditor() },
    { name: 'coverImage', type: 'upload', relationTo: 'post-images' },
    { name: 'publishedAt', type: 'date', admin: { description: 'Controls sort order and the date shown on the post.' } },
    { name: 'seoTitle', type: 'text', admin: { description: 'Overrides the <title> tag if set; otherwise falls back to the post title.' } },
    { name: 'seoDescription', type: 'textarea', admin: { description: 'Overrides the meta description if set; otherwise falls back to the excerpt.' } },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: ['draft', 'published'],
    },
  ],
};
