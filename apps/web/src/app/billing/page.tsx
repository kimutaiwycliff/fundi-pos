import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Toaster } from '@/components/ui/sonner';
import { LogoutButton } from '@/components/logout-button';
import { getCurrentUser } from '@/lib/current-user';
import { payloadFetch, PayloadApiError } from '@/lib/payload-client';
import { supportWhatsAppLink } from '@/lib/support';
import { cn } from '@/lib/utils';
import { ClaimForm, TrialRequestForm } from './billing-actions';
import type { TenantBilling } from './types';

export const metadata: Metadata = { title: 'Billing', robots: { index: false, follow: false } };

const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
const CYCLE: Record<string, string> = { monthly: 'month', quarterly: 'quarter', annual: 'year' };

// The shop's own Fundi subscription. Deliberately outside /dashboard: the
// dashboard redirects a locked-out shop away, but this page must stay
// reachable so they can pay and say so.
export default async function BillingPage() {
  const me = await getCurrentUser();
  const canManage = me.role === 'owner' || me.role === 'manager';

  let data: TenantBilling | null = null;
  if (canManage) {
    try {
      data = await payloadFetch<TenantBilling>('/api/billing');
    } catch (err) {
      if (!(err instanceof PayloadApiError)) throw err;
    }
  }

  return (
    <div className="min-h-svh bg-muted/40 px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          {data?.allowed !== false ? (
            <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" aria-hidden /> Dashboard
            </Link>
          ) : (
            <span />
          )}
          <LogoutButton />
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="text-sm text-muted-foreground">{data?.tenant.name ?? 'Your Fundi POS subscription'}</p>
        </div>

        {!canManage || !data ? (
          <Card>
            <CardHeader>
              <CardTitle>Ask your shop owner</CardTitle>
              <CardDescription>Only the owner or a manager can see and pay for the Fundi POS subscription.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <BillingDetails data={data} />
        )}
      </div>
      <Toaster />
    </div>
  );
}

function BillingDetails({ data }: { data: TenantBilling }) {
  const onTrial = data.state === 'trial' || data.state === 'trial_ending' || data.state === 'trial_expired';
  const pendingRequest = data.trialRequests.find((r) => r.status === 'pending');
  const lastDecided = data.trialRequests.find((r) => r.status !== 'pending');
  const pendingClaims = data.payments.filter((p) => p.status === 'pending');

  return (
    <>
      <Card className={cn(!data.allowed && 'ring-2 ring-destructive/40')}>
        <CardHeader>
          <CardTitle>{data.allowed ? data.stateLabel : 'Paused - payment needed'}</CardTitle>
          <CardDescription>
            {data.plan.tier === 'trial' ? 'Free trial' : `${data.plan.tier[0].toUpperCase()}${data.plan.tier.slice(1)} plan`}
            {data.plan.price > 0 ? ` · ${kes(data.plan.price)} per ${CYCLE[data.plan.cycle] ?? data.plan.cycle}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          {onTrial ? <p>Trial ends {day(data.trialEndsAt)}.</p> : null}
          {data.paidUntil ? <p>Paid until {day(data.paidUntil)}.</p> : null}
          {data.lockAt && data.allowed && (data.state === 'trial_expired' || data.state === 'overdue' || data.state === 'trial_ending' || data.state === 'due_soon') ? (
            <p className="font-medium text-amber-700 dark:text-amber-300">Access pauses on {day(data.lockAt)} unless you pay.</p>
          ) : null}
          {!data.allowed ? (
            <p className="font-medium text-destructive">
              Staff can&apos;t sign in or use the tills right now. Your data is safe - pay below and everything comes back as soon as we confirm it.
            </p>
          ) : null}
          {pendingClaims.length > 0 ? (
            <p className="text-muted-foreground">
              {pendingClaims.length === 1 ? 'Your payment is' : `${pendingClaims.length} payments are`} waiting for confirmation - we&apos;ll email you.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How to pay</CardTitle>
          <CardDescription>Pay with M-Pesa, then send us the confirmation code below.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {data.payTo.kind ? (
            <dl className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <dt className="text-xs text-muted-foreground">{data.payTo.kind === 'paybill' ? 'Paybill number' : 'Till number (Buy Goods)'}</dt>
                <dd className="text-lg font-semibold tabular-nums">{data.payTo.number}</dd>
              </div>
              {data.payTo.account ? (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">Account number</dt>
                  <dd className="text-lg font-semibold">{data.payTo.account}</dd>
                </div>
              ) : null}
              {data.plan.price > 0 ? (
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <dt className="text-xs text-muted-foreground">Amount</dt>
                  <dd className="text-lg font-semibold tabular-nums">{kes(data.plan.price)}</dd>
                </div>
              ) : null}
            </dl>
          ) : (
            <p className="text-sm">
              <a className="font-medium underline underline-offset-2" href={supportWhatsAppLink(`Hi Fundi POS, how do I pay for ${data.tenant.name}?`)} target="_blank" rel="noopener noreferrer">
                Message us on WhatsApp
              </a>{' '}
              for payment details.
            </p>
          )}
          {data.plan.price <= 0 && data.plans.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Plans:{' '}
              {data.plans.map((p, i) => (
                <span key={p.tier}>
                  {i > 0 ? ' · ' : ''}
                  <span className="font-medium text-foreground capitalize">{p.tier}</span> {kes(p.monthly)}/month
                </span>
              ))}
              . Pay for the one you want and mention it below - we&apos;ll set it up when we confirm.
            </p>
          ) : null}
          <ClaimForm defaultAmount={data.plan.price} />
        </CardContent>
      </Card>

      {onTrial ? (
        <Card>
          <CardHeader>
            <CardTitle>Need more time to try it?</CardTitle>
          </CardHeader>
          <CardContent>
            {pendingRequest ? (
              <p className="text-sm text-muted-foreground">You asked for more trial time on {day(pendingRequest.createdAt)}. We&apos;ll reply by email.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {lastDecided?.status === 'declined' ? (
                  <p className="text-sm text-muted-foreground">Your last request was declined.</p>
                ) : null}
                <TrialRequestForm />
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No payments yet.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {data.payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm font-medium tabular-nums">
                      {kes(p.amount)} {p.reference ? <span className="font-mono text-xs text-muted-foreground">{p.reference}</span> : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Paid {day(p.paidAt)}
                      {p.status === 'confirmed' && p.periodEnd ? ` · covers until ${day(p.periodEnd)}` : ''}
                      {p.status === 'rejected' && p.rejectReason ? ` · ${p.rejectReason}` : ''}
                    </span>
                  </div>
                  <PaymentStatus status={p.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function PaymentStatus({ status }: { status: TenantBilling['payments'][number]['status'] }) {
  if (status === 'confirmed') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 className="size-3.5" aria-hidden /> Confirmed
      </span>
    );
  }
  if (status === 'rejected') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-destructive">
        <XCircle className="size-3.5" aria-hidden /> Not matched
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-300">
      <Clock className="size-3.5" aria-hidden /> Waiting for confirmation
    </span>
  );
}
