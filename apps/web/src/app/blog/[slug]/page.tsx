import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { RichText } from '@payloadcms/richtext-lexical/react';
import { LogoMark } from '@/components/marketing/logo-mark';
import { WhatsAppButton } from '@/components/marketing/whatsapp-button';
import { payloadPublicFetch, PayloadApiError } from '@/lib/payload-public-client';
import type { BlogPost } from '@/lib/blog-types';

async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    const { docs } = await payloadPublicFetch<{ docs: BlogPost[] }>(
      `/api/posts?where[slug][equals]=${encodeURIComponent(slug)}&where[status][equals]=published&limit=1&depth=1`,
    );
    return docs[0] ?? null;
  } catch (error) {
    if (error instanceof PayloadApiError) return null;
    throw error;
  }
}

// See blog/page.tsx's comment on the same export - build-time isolation
// from a live Payload API means this must render at request time.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return {};

  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const coverUrl = typeof post.coverImage === 'object' ? post.coverImage?.url : undefined;

  return {
    title,
    description,
    alternates: { canonical: `/blog/${post.slug}` },
    openGraph: {
      title,
      description,
      type: 'article',
      publishedTime: post.publishedAt,
      images: coverUrl ? [coverUrl] : undefined,
    },
    twitter: { card: 'summary_large_image', title, description, images: coverUrl ? [coverUrl] : undefined },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  const coverImage = typeof post.coverImage === 'object' ? post.coverImage : null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt,
    image: coverImage?.url,
    author: { '@type': 'Organization', name: 'Fundi POS' },
    publisher: { '@type': 'Organization', name: 'Fundi POS' },
  };

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

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 lg:px-8">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

        <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to blog
        </Link>

        {post.publishedAt ? (
          <p className="mt-6 text-sm text-muted-foreground">
            {new Date(post.publishedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        ) : null}
        <h1 className="mt-2 font-heading text-3xl font-semibold tracking-tight sm:text-4xl">{post.title}</h1>

        {coverImage?.url ? (
          <div className="relative mt-6 aspect-video w-full overflow-hidden rounded-xl bg-muted">
            <Image src={coverImage.url} alt={coverImage.alt ?? post.title} fill className="object-cover" priority />
          </div>
        ) : null}

        <div className="prose-content mt-8">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <RichText data={post.content as any} />
        </div>
      </main>
      <WhatsAppButton />
    </div>
  );
}
