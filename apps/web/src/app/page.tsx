import Link from 'next/link';
import type { Metadata } from 'next';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  KeyRound,
  LineChart,
  ReceiptText,
  Smartphone,
  TabletSmartphone,
  UploadCloud,
  Warehouse,
  WifiOff,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LogoMark } from '@/components/marketing/logo-mark';
import { MobileNav } from '@/components/marketing/mobile-nav';
import { DownloadButtons } from '@/components/marketing/download-buttons';
import { Reveal } from '@/components/marketing/reveal';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils';

const SITE_URL = 'https://app.fundipos.co.ke';

const NAV_LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#how-it-works', label: 'How it works' },
  { href: '#download', label: 'Download' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
];

const CAPABILITIES = ['Real sales & margin reports', 'Works fully offline', 'M-Pesa built in', 'Multi-store ready'];

const FEATURES: Array<{ icon: LucideIcon; title: string; description: string }> = [
  {
    icon: BarChart3,
    title: 'See your best (and worst) days coming',
    description:
      'Daily and weekly sales trends and peak hours, plus your top and bottom performers — so restocking and staffing decisions are based on numbers, not guesswork.',
  },
  {
    icon: Building2,
    title: 'Compare every store, every cashier',
    description:
      "See revenue, margin, and average order value side by side across branches and shifts, so you know exactly where performance is strong and where it isn't.",
  },
  {
    icon: TabletSmartphone,
    title: 'Your dashboard, in your pocket',
    description:
      "Check today's sales, margin, and stock levels from your phone, wherever you are — the same reports your till produces, no laptop required.",
  },
  {
    icon: LineChart,
    title: 'Know your real margins',
    description:
      'Cost prices stay visible to owners only. See true profit by product, store, and shift — not just top-line revenue.',
  },
  {
    icon: Smartphone,
    title: 'M-Pesa at the till',
    description:
      'Send an STK push straight from checkout. Cash and M-Pesa are both tracked and reconciled automatically, tender by tender.',
  },
  {
    icon: Warehouse,
    title: 'Real inventory, every branch',
    description:
      'Stock levels update live from every till and every store. Transfer stock between branches and see exactly what moved, when, and why.',
  },
  {
    icon: KeyRound,
    title: 'Staff you can trust — and verify',
    description:
      'Fast PIN logins for cashier switching, manager approval on every void or refund, and a full audit trail of who changed what.',
  },
  {
    icon: WifiOff,
    title: 'Works through blackouts and dead zones',
    description:
      "Ring up sales completely offline. Every order and stock movement is recorded on the till itself and syncs the moment you're back online — nothing lost, nothing double-counted.",
  },
  {
    icon: ReceiptText,
    title: 'Built for compliance',
    description:
      'Itemized tax breakdowns on every receipt, with KRA eTIMS invoice fields ready to switch on as certification completes.',
  },
];

const STEPS = [
  {
    title: 'Sign up your business',
    description: 'Create your account in minutes, then add your stores and staff.',
  },
  {
    title: 'Load your stock',
    description: 'Import your product catalog from a spreadsheet, or add items as you go.',
  },
  {
    title: 'Sell — online or off',
    description: 'Ring up sales on the till. It keeps working through blackouts and dead zones.',
  },
  {
    title: 'Watch it sync',
    description: "The moment you're back online, every sale and stock movement lands in your dashboard.",
  },
];

const PLANS = [
  {
    name: 'Starter',
    tagline: 'For a single till getting started.',
    price: 'KES 1,000',
    priceNote: '/ month · 1 store',
    features: [
      '1 store, unlimited PIN logins',
      'Offline till + M-Pesa payments',
      'Sales reports & margin visibility (owner-only)',
      'Standard receipt printing',
    ],
    featured: false,
  },
  {
    name: 'Growth',
    tagline: 'For growing multi-branch stores.',
    price: 'KES 2,800',
    priceNote: '/ month · up to 5 stores',
    features: [
      'Everything in Starter',
      'Multiple stores & stock transfers',
      'Staff roles, PIN gating & audit log',
      'Compare margin across every store',
      'Held sales & shift reconciliation',
    ],
    featured: true,
  },
  {
    name: 'Enterprise',
    tagline: 'For larger operations with custom needs.',
    price: 'Custom',
    priceNote: 'unlimited stores',
    features: ['Everything in Growth', 'Unlimited stores', 'Dedicated onboarding', 'Priority support'],
    featured: false,
  },
];

const FAQS = [
  {
    q: 'Is Fundi only for hardware stores?',
    a: "No — there's no hardware-specific setup. Add whatever products, variants, and categories you sell: clothing, pharmacy stock, electronics, food, salon services — anything with a price and a stock count.",
  },
  {
    q: 'Does Fundi really work without internet?',
    a: 'Yes. The till runs on its own local database — you can ring up sales, adjust stock, and print receipts with no connection at all. Everything syncs automatically once the till is back online.',
  },
  {
    q: 'What happens if two tills are offline at the same time?',
    a: "Every sale and stock movement gets its own unique ID at the moment it's created, so nothing is double-counted or overwritten when multiple tills reconnect and sync at once.",
  },
  {
    q: 'Do you support M-Pesa?',
    a: 'Yes — M-Pesa is built into checkout. Send an STK push straight from the till and the payment status updates automatically once the customer approves it.',
  },
  {
    q: 'Can I run more than one store?',
    a: 'Yes. Fundi is built for multi-store from the ground up — stock, staff, and reporting all work across as many branches as you have, with one owner login over all of them.',
  },
  {
    q: 'Is Fundi ready for KRA eTIMS?',
    a: 'Fundi already captures itemized tax breakdowns on every receipt, with eTIMS invoice fields in place ready to switch on as certification completes — so you can stay ahead of KRA compliance requirements without changing how your till works.',
  },
  {
    q: 'What equipment do I need to get started?',
    a: 'A computer or POS terminal for your till, and any phone or laptop for the owner/manager dashboard. No special equipment is required, though Fundi supports standard ESC/POS receipt printers and cash drawers if you already have them.',
  },
  {
    q: 'Is my data kept separate from other businesses?',
    a: "Yes. Each business's data is fully isolated from every other business on Fundi, and only the roles you assign — owner, manager, cashier — can see what they're meant to.",
  },
];

const TITLE = 'Fundi POS — Point of sale with real sales & margin reporting';
const DESCRIPTION =
  'Fundi POS runs your till, tracks inventory, and takes M-Pesa payments for any small business — with real sales and margin reports by product, store, and shift. Works fully offline. KRA eTIMS-ready.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'Fundi POS',
    title: TITLE,
    description: DESCRIPTION,
    // Facebook's documented og:locale list doesn't include en_KE, so en_GB
    // is the closest supported locale to avoid an unrecognized tag.
    locale: 'en_GB',
    // Image itself comes from opengraph-image.tsx (file-based metadata takes
    // priority over this object and overrides any `images` set here anyway).
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    // Image comes from twitter-image.tsx (re-exports opengraph-image.tsx).
  },
};

const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'FAQPage',
      mainEntity: FAQS.map((item) => ({
        '@type': 'Question',
        name: item.q,
        acceptedAnswer: { '@type': 'Answer', text: item.a },
      })),
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Fundi POS',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Windows, macOS, Android',
      offers: PLANS.filter((plan) => plan.price !== 'Custom').map((plan) => ({
        '@type': 'Offer',
        name: plan.name,
        price: plan.price.replace(/[^0-9]/g, ''),
        priceCurrency: 'KES',
        url: `${SITE_URL}/#pricing`,
      })),
    },
    {
      '@type': 'Organization',
      name: 'Fundi POS',
      url: SITE_URL,
      logo: `${SITE_URL}/icon.svg`,
    },
  ],
};

export default function LandingPage() {
  return (
    <div className="flex min-h-full flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur supports-backdrop-filter:bg-background/60">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <LogoMark />
            <span className="font-heading text-lg font-semibold">Fundi</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="transition-colors hover:text-foreground">
                {link.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <ThemeToggle />
            <div className="hidden items-center gap-2 md:flex">
              <Button variant="ghost" asChild>
                <Link href="/login">Log in</Link>
              </Button>
              <Button asChild>
                <Link href="/signup">Start free trial</Link>
              </Button>
            </div>
            <MobileNav />
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] bg-size-[28px_28px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black_10%,transparent_75%)] dark:opacity-40"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute top-[-10rem] right-[-10rem] size-96 animate-pulse rounded-full bg-primary/20 blur-3xl [animation-duration:6s]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[-12rem] left-[-8rem] size-80 rounded-full bg-chart-2/15 blur-3xl"
          />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:items-center lg:px-8 lg:py-32">
            <Reveal>
              <Badge variant="secondary" className="mb-5">
                Built for small businesses across Kenya
              </Badge>
              <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
                Ring up sales. See your real margins. Every branch, every shift.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-muted-foreground text-pretty">
                Fundi runs your till, tracks stock, and takes M-Pesa payments — for any shop, from boutiques to
                pharmacies to hardware stores. Every sale becomes real numbers: what&apos;s selling, what&apos;s
                not, and what you&apos;re actually keeping after cost, by product, by store, by shift.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" asChild>
                  <Link href="/signup">
                    Start free trial
                    <ArrowRight />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/login">Log in</Link>
                </Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">No credit card required.</p>
            </Reveal>

            <Reveal delay={150}>
              <div className="relative">
                <div
                  aria-hidden
                  className="absolute -inset-4 -z-10 rounded-3xl bg-gradient-to-tr from-primary/15 via-transparent to-transparent"
                />
                <div className="rounded-2xl border bg-card p-4 shadow-xl ring-1 ring-foreground/10 transition-transform duration-500 hover:-translate-y-1 sm:p-6">
                  <div className="flex items-center justify-between border-b pb-3">
                    <span className="text-xs font-medium text-muted-foreground">Fundi Till · Store 2, Nakuru</span>
                    <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                      <LineChart className="size-3.5" />
                      Today so far · KES 84,200
                    </span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {[
                      ['Ankara dress, size M', 'x2', 'KES 2,400'],
                      ['Paracetamol 500mg, 10-pack', 'x1', 'KES 450'],
                      ['Phone screen protector', 'x1', 'KES 6,800'],
                    ].map(([name, qty, price]) => (
                      <div key={name} className="flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-sm">
                        <span className="truncate">{name}</span>
                        <span className="mx-3 shrink-0 text-muted-foreground">{qty}</span>
                        <span className="shrink-0 font-medium">{price}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t pt-3">
                    <span className="text-sm font-medium text-muted-foreground">Total</span>
                    <span className="text-lg font-semibold">KES 9,650</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-primary bg-primary/5 px-3 py-2 text-center text-sm font-medium text-primary">
                      Cash
                    </div>
                    <div className="rounded-lg border px-3 py-2 text-center text-sm font-medium text-muted-foreground">
                      M-Pesa
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>

          <div className="relative border-y bg-muted/40">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 sm:px-6 lg:px-8">
              {CAPABILITIES.map((item) => (
                <span key={item} className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Check className="size-4 text-primary" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Every sale, turned into numbers you can act on
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              Whatever you sell, Fundi shows you what&apos;s working, what isn&apos;t, and what you&apos;re really
              keeping after cost — while still holding up through blackouts, patchy internet, and staff you
              can&apos;t watch every minute.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }, index) => (
              <Reveal key={title} delay={index * 80}>
                <Card className="h-full transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                  <CardHeader>
                    <div className="mb-2 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle as="h3" className="text-base">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{description}</p>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="border-y bg-muted/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <Reveal className="mx-auto max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                From sign-up to your first sale
              </h2>
              <p className="mt-4 text-muted-foreground text-pretty">No implementation project. No waiting on a rep.</p>
            </Reveal>
            <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, index) => (
                <Reveal key={step.title} delay={index * 100} className="relative">
                  {index < STEPS.length - 1 ? (
                    <div aria-hidden className="absolute top-4.5 left-9 hidden h-px w-[calc(100%-1.5rem)] bg-border lg:block" />
                  ) : null}
                  <div className="relative flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {index + 1}
                  </div>
                  <h3 className="mt-4 font-heading text-base font-semibold">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Download */}
        <section id="download" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Get the Fundi Till app
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              This is the offline-capable till your cashiers actually ring up sales on. Install it on the computer
              at each till — your team logs in there with a fast PIN once your account is set up.
            </p>
          </Reveal>
          <Reveal delay={100} className="mt-8 flex justify-center">
            <DownloadButtons />
          </Reveal>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              Pricing that grows with your store
            </h2>
            <p className="mt-4 text-muted-foreground text-pretty">
              Every plan starts with a free trial — no card required. Upgrade whenever you open a new branch.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {PLANS.map((plan, index) => (
              <Reveal key={plan.name} delay={index * 100}>
                <Card
                  className={cn(
                    'h-full transition-all duration-300 hover:-translate-y-1',
                    plan.featured ? 'relative ring-2 ring-primary hover:shadow-xl' : 'hover:shadow-lg',
                  )}
                >
                  {plan.featured ? (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Most popular</Badge>
                  ) : null}
                  <CardHeader>
                    <CardTitle as="h3" className="text-lg">{plan.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                    <p className="mt-3 flex items-baseline gap-1.5">
                      <span className="font-heading text-3xl font-semibold">{plan.price}</span>
                      <span className="text-sm text-muted-foreground">{plan.priceNote}</span>
                    </p>
                  </CardHeader>
                  <CardContent className="flex h-full flex-col">
                    <ul className="flex-1 space-y-2.5">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-start gap-2 text-sm">
                          <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <Button className="mt-6 w-full" variant={plan.featured ? 'default' : 'outline'} asChild>
                      <Link href="/signup">Start free trial</Link>
                    </Button>
                  </CardContent>
                </Card>
              </Reveal>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-y bg-muted/40">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
            <Reveal>
              <h2 className="text-center font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
                Questions, answered
              </h2>
            </Reveal>
            <Reveal delay={100} className="mt-10 divide-y rounded-xl border bg-card">
              {FAQS.map((item) => (
                <details key={item.q} className="group p-5 open:pb-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium marker:content-none">
                    {item.q}
                    <span className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">
                      <PlusIcon />
                    </span>
                  </summary>
                  <p className="mt-3 text-sm text-muted-foreground text-pretty">{item.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* Final CTA */}
        <section className="relative overflow-hidden bg-foreground text-background">
          <div
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/25 blur-3xl"
          />
          <Reveal className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
            <div className="flex items-center gap-2 rounded-full bg-background/10 px-4 py-1.5 text-sm font-medium">
              <UploadCloud className="size-4" />
              Set up your store in minutes
            </div>
            <h2 className="max-w-2xl font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
              Ready to know exactly what your shop is making?
            </h2>
            <p className="max-w-xl text-background/70 text-pretty">
              Start your free trial today and see your real numbers — revenue, margin, and everything in between.
            </p>
            <Button size="lg" variant="secondary" asChild>
              <Link href="/signup">
                Start free trial
                <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2 text-foreground">
            <LogoMark className="size-6" />
            <span className="font-heading font-semibold">Fundi</span>
          </Link>
          <p>Point of sale built for small businesses across Kenya.</p>
          <p>© 2026 Fundi. Built in Kenya.</p>
        </div>
      </footer>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
      <path d="M8 2.5v11M2.5 8h11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
