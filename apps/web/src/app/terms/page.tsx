import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/marketing/logo-mark';
import { WhatsAppButton } from '@/components/marketing/whatsapp-button';

export const metadata: Metadata = {
  title: 'Terms and Conditions',
  description: 'Terms and Conditions for using Fundi POS.',
};

export default function TermsPage() {
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
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Terms and Conditions</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: September 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
          <p>
            These Terms and Conditions (&quot;Terms&quot;) govern your access to and use of Fundi POS (the &quot;Service&quot;), a
            point-of-sale, inventory, and reporting product for small businesses, operated under the name{' '}
            <strong className="text-foreground">Fundi POS</strong>, based in Nairobi, Kenya. By creating an account or
            using the Service, you agree to these Terms. If you don&apos;t agree, please don&apos;t use the Service.
          </p>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">1. The Service</h2>
            <p className="mt-3">
              Fundi POS provides point-of-sale, inventory management, and sales/margin reporting software, delivered
              through a web dashboard and downloadable till applications (Windows, macOS, and Android). Some features
              work offline and sync automatically once your device reconnects.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">2. Accounts and plans</h2>
            <p className="mt-3">
              You need an account to use the Service. You&apos;re responsible for keeping your login credentials and
              staff PINs secure, and for all activity that happens under your account. Fundi POS is offered on
              Starter, Growth, and Enterprise plans, each with a free trial and no card required to start. Paid plans
              are billed monthly in advance. You can cancel at any time; cancellation takes effect at the end of the
              current billing period, and we don&apos;t provide refunds for partial billing periods except where
              required by law.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">3. Your data</h2>
            <p className="mt-3">
              Everything you enter into Fundi POS — your products, stock movements, sales, customers, staff records,
              and reports — belongs to you. We don&apos;t sell it, and we don&apos;t use it to train or improve
              products for anyone outside your own account. See our{' '}
              <Link href="/privacy" className="text-primary underline underline-offset-2">
                Privacy Policy
              </Link>{' '}
              for how we handle and protect it. You&apos;re responsible for the accuracy of the data you enter,
              including pricing, tax rates, and any information used for KRA eTIMS compliance.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">4. Acceptable use</h2>
            <p className="mt-3">You agree not to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Use the Service for any unlawful purpose, or to process transactions you know to be fraudulent.</li>
              <li>Attempt to access another business&apos;s data, or to bypass the role-based access controls built into the Service.</li>
              <li>Reverse-engineer, resell, or white-label the Service without our written permission.</li>
              <li>Overload or disrupt the Service&apos;s infrastructure (for example, through automated scraping or denial-of-service activity).</li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">5. Payments and M-Pesa</h2>
            <p className="mt-3">
              M-Pesa payments taken through the Service are processed via Safaricom&apos;s Daraja API. Fundi POS
              relays these transactions but is not itself a payment processor, bank, or holder of your funds — M-Pesa
              settlement happens directly between your business and Safaricom, subject to Safaricom&apos;s own terms.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">6. Availability</h2>
            <p className="mt-3">
              We work to keep the Service reliable, and the till applications are built to keep working offline
              during connectivity or power interruptions. That said, Fundi POS is provided on a best-effort basis by
              a small team, without a formal uptime guarantee or service-level agreement at this time. We&apos;ll do
              our best to give notice of planned maintenance that could affect availability.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">7. Limitation of liability</h2>
            <p className="mt-3">
              To the fullest extent permitted by Kenyan law, Fundi POS and its operators are not liable for indirect,
              incidental, or consequential damages arising from your use of the Service, including lost profits or
              lost data, except where such loss results from our gross negligence or willful misconduct. Nothing in
              these Terms limits liability that cannot be limited under applicable law.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">8. Termination</h2>
            <p className="mt-3">
              You may stop using the Service and cancel your account at any time. We may suspend or terminate an
              account that breaches these Terms, is used fraudulently, or has payment significantly overdue, after
              reasonable notice where practical. On termination, you can request an export of your data within a
              reasonable period before it&apos;s deleted from our systems.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">9. Changes to these Terms</h2>
            <p className="mt-3">
              We may update these Terms from time to time. If we make material changes, we&apos;ll let you know
              (for example, by email or an in-app notice) before they take effect. Continuing to use the Service
              after changes take effect means you accept the updated Terms.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">10. Governing law</h2>
            <p className="mt-3">
              These Terms are governed by the laws of Kenya, and any disputes will be subject to the exclusive
              jurisdiction of the courts of Kenya.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">11. Contact</h2>
            <p className="mt-3">
              Questions about these Terms? Reach us at{' '}
              <a href="mailto:kimutaiwycliff90@gmail.com" className="text-primary underline underline-offset-2">
                kimutaiwycliff90@gmail.com
              </a>{' '}
              or <a href="tel:+254716522948" className="text-primary underline underline-offset-2">+254 716 522948</a>,
              or by WhatsApp using the button on this page. Fundi POS is based in Nairobi, Kenya.
            </p>
          </section>

          <p className="border-t pt-6 text-xs text-muted-foreground/80">
            This is a template drafted to reflect how Fundi POS actually operates today. It is not a substitute for
            legal advice — if you rely on these Terms for a registered business, we recommend having them reviewed by
            a lawyer familiar with Kenyan law before relying on them.
          </p>
        </div>
      </main>
      <WhatsAppButton />
    </div>
  );
}
