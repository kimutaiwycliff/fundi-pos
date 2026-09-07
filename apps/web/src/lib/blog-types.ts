// Mirrors apps/api/src/collections/Posts.ts's fields as they come back over
// Payload's REST API. Kept as a small hand-written type here rather than
// importing apps/api's generated payload-types.ts - the two apps are
// separate deployed processes talking over HTTP (see payload-client.ts),
// not a shared build, so there's no existing precedent for cross-app type
// imports in this codebase.
export type BlogPostImage = {
  id: string;
  url?: string;
  alt?: string;
};

export type BlogPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content?: unknown;
  coverImage?: BlogPostImage | string | null;
  publishedAt?: string;
  seoTitle?: string;
  seoDescription?: string;
  status: 'draft' | 'published';
};
