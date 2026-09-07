import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { LogoMark } from '@/components/marketing/logo-mark';
import { WhatsAppButton } from '@/components/marketing/whatsapp-button';
import { payloadPublicFetch } from '@/lib/payload-public-client';
import type { BlogPost } from '@/lib/blog-types';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Practical guidance on running a small business in Kenya - margins, compliance, and getting the most out of your till.',
};

// Rendered per-request rather than statically generated: this app's
// production build produces the web image and the Payload API image as
// two separate, isolated Docker build stages (see docker/docker-compose.yml)
// with no live API reachable during `next build` - a build-time fetch here
// would fail the image build itself, not just local dev. payloadPublicFetch's
// own `next: { revalidate }` still lets Next's fetch-level Data Cache serve
// repeat requests without re-hitting the API every time.
export const dynamic = 'force-dynamic';

export default async function BlogIndexPage() {
  const { docs: posts } = await payloadPublicFetch<{ docs: BlogPost[] }>(
    '/api/posts?where[status][equals]=published&sort=-publishedAt&limit=50&depth=1',
  );

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="font-heading text-lg font-semibold">Fundi</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Blog</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Practical guidance on running a small business in Kenya — margins, compliance, and getting the most out of
          your till.
        </p>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg"
            >
              {post.coverImage && typeof post.coverImage === 'object' && post.coverImage.url ? (
                <div className="relative aspect-video w-full overflow-hidden bg-muted">
                  <Image
                    src={post.coverImage.url}
                    alt={post.coverImage.alt ?? post.title}
                    fill
                    className="object-cover transition-transform group-hover:scale-105"
                    sizes="(min-width: 640px) 50vw, 100vw"
                  />
                </div>
              ) : null}
              <div className="flex flex-1 flex-col p-5">
                {post.publishedAt ? (
                  <p className="text-xs text-muted-foreground">
                    {new Date(post.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                ) : null}
                <h2 className="mt-1.5 font-heading text-lg font-semibold group-hover:text-primary">{post.title}</h2>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{post.excerpt}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <WhatsAppButton />
    </div>
  );
}
