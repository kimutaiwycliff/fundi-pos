import type { Metadata } from 'next';
import Link from 'next/link';
import { LogoMark } from '@/components/marketing/logo-mark';
import { WhatsAppButton } from '@/components/marketing/whatsapp-button';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Fundi POS collects, uses, and protects your data.',
};

export default function PrivacyPage() {
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
        <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated: September 2026</p>

        <div className="mt-8 space-y-8 text-sm leading-7 text-muted-foreground sm:text-base sm:leading-8">
          <p>
            This Privacy Policy explains how <strong className="text-foreground">Fundi POS</strong>, based in
            Nairobi, Kenya, collects, uses, and protects information when you use our point-of-sale, inventory, and
            reporting software.
          </p>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">1. What we collect</h2>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-foreground">Account and business information</strong> — your business name,
                store locations, and the email/contact details you provide when signing up.
              </li>
              <li>
                <strong className="text-foreground">Staff records</strong> — names, roles, and login/PIN information
                for people you add as owner, manager, or cashier accounts.
              </li>
              <li>
                <strong className="text-foreground">Business data you enter</strong> — products, prices, stock
                movements, sales, customers, and supplier records used to run your till and generate reports.
              </li>
              <li>
                <strong className="text-foreground">Technical data</strong> — basic device and usage information
                (like app version and sync status) needed to keep the offline till and sync features working
                reliably.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">2. How we use it</h2>
            <p className="mt-3">We use this information to:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>Run the Service — process sales, track stock, generate receipts, invoices, and reports.</li>
              <li>Keep your account secure and enforce role-based access within your business.</li>
              <li>Provide customer support when you contact us.</li>
              <li>Meet legal and tax obligations, including KRA eTIMS invoicing requirements once enabled for your account.</li>
            </ul>
            <p className="mt-3">
              We don&apos;t sell your data, and we don&apos;t use your business data to train models or build
              products for anyone outside your own account.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">3. Who we share it with</h2>
            <p className="mt-3">We share data only where it&apos;s needed to run the Service:</p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                <strong className="text-foreground">Safaricom (M-Pesa Daraja API)</strong> — to process M-Pesa
                payments taken at the till.
              </li>
              <li>
                <strong className="text-foreground">Cloudflare</strong> — for object storage (product images) and
                backups, and to serve the app reliably.
              </li>
              <li>
                <strong className="text-foreground">Kenya Revenue Authority (KRA)</strong> — invoice data required
                for eTIMS compliance, once that feature is enabled for your business.
              </li>
            </ul>
            <p className="mt-3">We do not sell or rent your data to advertisers or data brokers.</p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">4. Data isolation between businesses</h2>
            <p className="mt-3">
              Each business using Fundi POS has its data fully isolated from every other business on the platform.
              Within your own account, only the roles you assign — owner, manager, cashier — can see what
              they&apos;re meant to; for example, cost prices and profit margins are visible to owners only by
              default.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">5. Your rights</h2>
            <p className="mt-3">
              Under Kenya&apos;s Data Protection Act, 2019, you have the right to access, correct, or request
              deletion of personal data we hold about you, to object to certain processing, and to request a copy of
              your data in a portable format. To exercise any of these rights, contact us using the details below.
              If you believe your data has been mishandled, you may also lodge a complaint with the Office of the
              Data Protection Commissioner (ODPC), Kenya.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">6. Data retention</h2>
            <p className="mt-3">
              We keep your business data for as long as your account is active, so your sales history and reports
              stay available to you. If you close your account, you can request an export of your data, after which
              we delete it from our active systems within a reasonable period, except where we&apos;re required to
              retain records for longer (for example, tax-related records) under applicable law.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">7. Security</h2>
            <p className="mt-3">
              We use industry-standard measures to protect your data, including encrypted connections (HTTPS) between
              your devices and our servers, tenant-level data isolation, role-based access controls, and regular
              database backups. No system is completely immune to risk, but we take reasonable steps to keep your
              data safe and to respond quickly if something goes wrong.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">8. Cookies</h2>
            <p className="mt-3">
              We use only the cookies necessary to keep you signed in and to remember basic preferences like
              light/dark mode. We don&apos;t use third-party advertising or tracking cookies.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">9. Children&apos;s privacy</h2>
            <p className="mt-3">
              Fundi POS is a business tool and isn&apos;t directed at or intended for use by children.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">10. Changes to this policy</h2>
            <p className="mt-3">
              We may update this Privacy Policy from time to time. If we make material changes, we&apos;ll let you
              know before they take effect.
            </p>
          </section>

          <section>
            <h2 className="font-heading text-xl font-semibold text-foreground">11. Contact</h2>
            <p className="mt-3">
              Questions about this policy, or want to exercise your data rights? Reach us at{' '}
              <a href="mailto:kimutaiwycliff90@gmail.com" className="text-primary underline underline-offset-2">
                kimutaiwycliff90@gmail.com
              </a>{' '}
              or <a href="tel:+254716522948" className="text-primary underline underline-offset-2">+254 716 522948</a>,
              or by WhatsApp using the button on this page. Fundi POS is based in Nairobi, Kenya.
            </p>
          </section>

          <p className="border-t pt-6 text-xs text-muted-foreground/80">
            This is a template drafted to reflect how Fundi POS actually operates today. It is not a substitute for
            legal advice — if you rely on this policy for a registered business, we recommend having it reviewed by a
            lawyer familiar with Kenya&apos;s Data Protection Act, 2019, including any registration obligations with
            the ODPC.
          </p>
        </div>
      </main>
      <WhatsAppButton />
    </div>
  );
}
