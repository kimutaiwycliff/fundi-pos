import type { Payload } from 'payload';
import {
  cyclePrice,
  daysUntil,
  HEALTH_LABELS,
  isAttentionHealth,
  subscriptionState,
  tenantAccess,
  TRIAL_DAYS,
} from '@hardware-pos/business-logic';
import { background } from './background.ts';
import { sendEmail, type SendResult } from './email.ts';
import { buildStats } from './platformStats.ts';
import { purgeTenant } from './purgeTenant.ts';
import type { PriorTrial } from './trialGrants.ts';

// Every email Fundi POS sends: billing emails to tenant owners, alerts and
// the weekly digest to the operator. Event emails (a claim came in, a
// claim was confirmed...) are started in the background so they can't
// slow down or break the request that triggered them; scheduled ones
// (reminders, digest) run from the Payload job queue (payload.config.ts).

const DAY = 24 * 60 * 60 * 1000;
export const appUrl = (path = '') => `${(process.env.APP_URL || 'https://app.fundipos.co.ke').replace(/\/$/, '')}${path}`;
const kes = (n: number) => `KES ${Math.round(n).toLocaleString('en-KE')}`;
const day = (iso: string | Date) =>
  new Date(iso).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
const dayKey = (iso: string | Date) => new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ------------------------------------------------------------------ layout

interface Section {
  heading?: string;
  lines: string[]; // plain text; rendered escaped
}

export function render({
  heading,
  intro,
  sections = [],
  cta,
  footer,
}: {
  heading: string;
  intro: string[];
  sections?: Section[];
  cta?: { label: string; href: string };
  // Extra small print, e.g. an unsubscribe link (campaigns).
  footer?: { text: string; href?: string };
}): { html: string; text: string } {
  const p = (t: string) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;color:#1f2937">${esc(t)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;padding:28px">
<tr><td>
<div style="font-weight:700;font-size:14px;color:#ea580c;margin-bottom:16px">Fundi POS</div>
<h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827">${esc(heading)}</h1>
${intro.map(p).join('')}
${sections
  .map(
    (s) =>
      `${s.heading ? `<h2 style="margin:20px 0 8px;font-size:15px;color:#111827">${esc(s.heading)}</h2>` : ''}<ul style="margin:0 0 12px;padding-left:18px">${s.lines
        .map((l) => `<li style="margin:0 0 6px;font-size:14px;line-height:1.45;color:#374151">${esc(l)}</li>`)
        .join('')}</ul>`,
  )
  .join('')}
${cta ? `<p style="margin:20px 0 0"><a href="${esc(cta.href)}" style="display:inline-block;background:#ea580c;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${esc(cta.label)}</a></p>` : ''}
</td></tr></table>
<p style="font-size:12px;color:#6b7280;margin:16px 0 0">Fundi POS · point of sale for Kenyan hardware shops${
    footer ? `<br>${footer.href ? `<a href="${esc(footer.href)}" style="color:#6b7280">${esc(footer.text)}</a>` : esc(footer.text)}` : ''
  }</p>
</td></tr></table></body></html>`;
  const text = [
    heading,
    '',
    ...intro,
    ...sections.flatMap((s) => ['', ...(s.heading ? [s.heading] : []), ...s.lines.map((l) => `- ${l}`)]),
    ...(cta ? ['', `${cta.label}: ${cta.href}`] : []),
    ...(footer ? ['', footer.href ? `${footer.text}: ${footer.href}` : footer.text] : []),
  ].join('\n');
  return { html, text };
}

// -------------------------------------------------------------- recipients

export async function operatorRecipients(payload: Payload): Promise<string[]> {
  const configured = (process.env.PLATFORM_NOTIFY_EMAIL || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (configured.length > 0) return configured;
  const admins = await payload.find({ collection: 'platform-admins', pagination: false, depth: 0, overrideAccess: true });
  return admins.docs.map((a) => String(a.email));
}

async function tenantContacts(payload: Payload, tenantId: number | string) {
  const tenant = await payload.findByID({ collection: 'tenants', id: tenantId, depth: 0, overrideAccess: true });
  const owners = await payload.find({
    collection: 'users',
    where: { tenant: { equals: tenantId }, role: { equals: 'owner' }, status: { equals: 'active' } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const to = [tenant.billingContactEmail as string | null, ...owners.docs.map((o) => o.email as string)].filter(Boolean) as string[];
  const ownerName = (owners.docs[0]?.name as string | null) ?? null;
  return { tenant, to, ownerName };
}

// How a tenant pays Fundi (configured per deployment, first one set wins).
// Shown in emails and on the tenant's billing page. Like PharmaTrack, the
// simplest is M-Pesa Send Money to a phone number: the shop then enters the
// confirmation code ("I've paid") and the operator is emailed to confirm.
//   PLATFORM_MPESA_PAYBILL  paybill, account FUNDI<tenantId>
//   PLATFORM_MPESA_TILL     Buy Goods till
//   PLATFORM_MPESA_PHONE    Send Money to this number
//   PLATFORM_MPESA_NAME     optional: the name M-Pesa shows for it, so shops
//                           can check they're paying the right person
export function platformPaymentDetails(tenantId: number | string) {
  const paybill = process.env.PLATFORM_MPESA_PAYBILL || '';
  const till = process.env.PLATFORM_MPESA_TILL || '';
  const phone = process.env.PLATFORM_MPESA_PHONE || '';
  const name = process.env.PLATFORM_MPESA_NAME || null;
  const account = `FUNDI${tenantId}`;
  if (paybill) return { kind: 'paybill' as const, number: paybill, account, name, line: `M-Pesa Paybill ${paybill}, account number ${account}` };
  if (till) return { kind: 'till' as const, number: till, account: null, name, line: `M-Pesa Buy Goods till ${till}` };
  if (phone) {
    return { kind: 'phone' as const, number: phone, account: null, name, line: `M-Pesa Send Money to ${phone}${name ? ` (${name})` : ''}` };
  }
  return { kind: null, number: null, account: null, name: null, line: 'Reply to this email and we will send you payment details' };
}

const greeting = (name: string | null) => (name ? `Hi ${name.split(' ')[0]},` : 'Hello,');

// ------------------------------------------------------ operator: events

export function notifyNewSignup(payload: Payload, tenantId: number | string, priorTrials: PriorTrial[] = []): void {
  background('notify:signup', async () => {
    const { tenant, to: ownerEmails } = await tenantContacts(payload, tenantId);
    const strong = priorTrials.filter((p) => p.matchedOn.includes('email') || p.matchedOn.includes('phone'));
    const { html, text } = render({
      heading: `${strong.length ? 'Repeat trial? ' : ''}New sign-up: ${tenant.name}`,
      intro: [
        `${tenant.name} just signed up and started a ${TRIAL_DAYS}-day free trial.`,
        `Owner: ${ownerEmails[0] ?? 'no email on file'}.`,
        ...(priorTrials.length
          ? [
              `Heads up: this looks like ${strong.length ? 'a repeat trial' : 'it may be a repeat trial (same network only)'} - earlier trial(s): ${priorTrials
                .map((p) => `${p.businessName} (${day(p.createdAt)}, matched on ${p.matchedOn.join(' + ')})`)
                .join('; ')}.`,
            ]
          : []),
        'A welcome call in the first few days is the best predictor of a shop that sticks.',
      ],
      cta: { label: 'Open in the console', href: appUrl(`/platform/tenants/${tenant.id}`) },
    });
    await sendEmail(payload, { key: `signup:${tenant.id}`, kind: 'operator_signup', tenantId: tenant.id, to: await operatorRecipients(payload), subject: `${strong.length ? 'Repeat trial? ' : ''}New sign-up: ${tenant.name}`, html, text });
  });
}

export function notifyPaymentClaim(payload: Payload, paymentId: number | string): void {
  background('notify:claim', async () => {
    const payment = await payload.findByID({ collection: 'subscription-payments', id: paymentId, depth: 1, overrideAccess: true });
    const tenant = payment.tenant as { id: number; name: string };
    const { html, text } = render({
      heading: `Payment to confirm: ${tenant.name}`,
      intro: [
        `${tenant.name} says they paid ${kes(Number(payment.amount))}${payment.reference ? ` (M-Pesa code ${payment.reference})` : ''} on ${day(payment.paidAt as string)}.`,
        'Check it against your M-Pesa statement, then confirm or reject it on their Billing tab. Confirming extends their subscription and restores access if they were locked out.',
      ],
      cta: { label: 'Review the claim', href: appUrl(`/platform/tenants/${tenant.id}?tab=billing`) },
    });
    await sendEmail(payload, { key: `payment_claim:${payment.id}`, kind: 'operator_payment_claim', tenantId: tenant.id, to: await operatorRecipients(payload), subject: `Payment to confirm: ${tenant.name} - ${kes(Number(payment.amount))}`, html, text });
  });
}

export function notifyTrialExtensionRequest(payload: Payload, requestId: number | string): void {
  background('notify:trial_request', async () => {
    const request = await payload.findByID({ collection: 'trial-extension-requests', id: requestId, depth: 1, overrideAccess: true });
    const tenant = request.tenant as { id: number; name: string };
    const { html, text } = render({
      heading: `Trial extension request: ${tenant.name}`,
      intro: [
        `${tenant.name} asked for more trial time.`,
        ...(request.message ? [`Their message: "${request.message}"`] : []),
        'Approve with a number of days, or decline, on their Billing tab.',
      ],
      cta: { label: 'Review the request', href: appUrl(`/platform/tenants/${tenant.id}?tab=billing`) },
    });
    await sendEmail(payload, { key: `trial_request:${request.id}`, kind: 'operator_trial_request', tenantId: tenant.id, to: await operatorRecipients(payload), subject: `Trial extension request: ${tenant.name}`, html, text });
  });
}

// -------------------------------------------------------- owner: events

export function notifyPaymentDecision(payload: Payload, { paymentId, tenantId }: { paymentId: number | string; tenantId: number | string }): void {
  background('notify:payment_decision', async () => {
    const payment = await payload.findByID({ collection: 'subscription-payments', id: paymentId, depth: 0, overrideAccess: true });
    const { tenant, to, ownerName } = await tenantContacts(payload, tenantId);
    const confirmed = payment.status === 'confirmed';
    const amount = kes(Number(payment.amount));
    const { html, text } = confirmed
      ? render({
          heading: 'Payment received - thank you',
          intro: [
            greeting(ownerName),
            `We've confirmed your payment of ${amount}${payment.reference ? ` (${payment.reference})` : ''} for ${tenant.name}.`,
            payment.periodEnd ? `Your subscription is now paid until ${day(payment.periodEnd as string)}.` : 'Your subscription has been extended.',
          ],
          cta: { label: 'Open Fundi POS', href: appUrl('/dashboard') },
        })
      : render({
          heading: "We couldn't confirm your payment",
          intro: [
            greeting(ownerName),
            `We couldn't match your payment of ${amount}${payment.reference ? ` (${payment.reference})` : ''} for ${tenant.name} to one we received.`,
            ...(payment.rejectReason ? [`Reason: ${payment.rejectReason}`] : []),
            'Please check the M-Pesa code and send it again from your billing page, or reply to this email and we will sort it out.',
          ],
          cta: { label: 'Go to billing', href: appUrl('/billing') },
        });
    await sendEmail(payload, {
      key: `payment_decision:${payment.id}`,
      kind: confirmed ? 'owner_payment_confirmed' : 'owner_payment_rejected',
      tenantId: tenant.id,
      to,
      subject: confirmed ? `Payment received - ${tenant.name}` : `Please check your payment - ${tenant.name}`,
      html,
      text,
    });
  });
}

export function notifyTrialExtensionDecision(
  payload: Payload,
  args: { tenantId: number | string; approved: boolean; days: number | null; newTrialEndsAt: string | null; requestId: number | string },
): void {
  background('notify:trial_decision', async () => {
    const { tenant, to, ownerName } = await tenantContacts(payload, args.tenantId);
    const { html, text } = args.approved
      ? render({
          heading: 'Your trial has been extended',
          intro: [
            greeting(ownerName),
            `Good news - we've added ${args.days} day${args.days === 1 ? '' : 's'} to ${tenant.name}'s free trial.`,
            args.newTrialEndsAt ? `It now runs until ${day(args.newTrialEndsAt)}.` : '',
          ].filter(Boolean),
          cta: { label: 'Open Fundi POS', href: appUrl('/dashboard') },
        })
      : render({
          heading: 'About your trial extension request',
          intro: [
            greeting(ownerName),
            `We weren't able to extend ${tenant.name}'s trial this time.`,
            `To keep using Fundi POS, subscribe from your billing page - ${platformPaymentDetails(tenant.id).line}.`,
          ],
          cta: { label: 'Go to billing', href: appUrl('/billing') },
        });
    await sendEmail(payload, {
      key: `trial_decision:${args.requestId}`,
      kind: args.approved ? 'owner_trial_extended' : 'owner_trial_declined',
      tenantId: tenant.id,
      to,
      subject: args.approved ? `Your Fundi POS trial has been extended` : `About your Fundi POS trial`,
      html,
      text,
    });
  });
}

// ---------------------------------------------------- scheduled: reminders

// Runs hourly. Each reminder has a key tied to the date it's about, so it
// goes out once per trial end / renewal date / lockout - and a changed date
// (extension, new payment) re-arms it. Long-dead lapses (locked more than
// 3 days ago) are left alone so a first deploy doesn't email old test shops.
export async function runBillingReminders(payload: Payload, now = new Date()): Promise<Record<string, number>> {
  const tenants = await payload.find({
    collection: 'tenants',
    where: { status: { equals: 'active' }, billingStatus: { not_equals: 'canceled' } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  const counts: Record<string, number> = {};
  const bump = (k: string, r: SendResult) => {
    if (r === 'sent' || r === 'logged') counts[k] = (counts[k] ?? 0) + 1;
  };

  for (const t of tenants.docs) {
    const state = subscriptionState(t as never, now);
    const access = tenantAccess(t as never, now);
    const id = t.id;
    const price = cyclePrice(t.planPrice as number | null, t.billingCycle as string | null, t.subscriptionTier as string);
    const pay = platformPaymentDetails(id);
    const payLine = price > 0 ? `Pay ${kes(price)} via ${pay.line}, then tap "I've paid" on your billing page.` : `Pay via ${pay.line}, then tap "I've paid" on your billing page.`;

    let reminder: { kind: string; key: string; subject: string; heading: string; lines: string[] } | null = null;

    if (state === 'trial' || state === 'trial_ending') {
      const end = t.trialEndsAt ? new Date(t.trialEndsAt as string) : new Date(new Date(t.createdAt as string).getTime() + TRIAL_DAYS * DAY);
      const left = daysUntil(end.toISOString(), now) ?? 99;
      if (left >= 0 && left <= 3) {
        const stage = left <= 1 ? '1d' : '3d';
        reminder = {
          kind: 'owner_trial_ending',
          key: `trial_ending:${id}:${dayKey(end)}:${stage}`,
          subject: left <= 1 ? 'Your Fundi POS trial ends tomorrow' : `Your Fundi POS trial ends in ${left} days`,
          heading: left <= 1 ? 'Your free trial ends tomorrow' : `Your free trial ends in ${left} days`,
          lines: [`${t.name}'s free trial ends on ${day(end)}.`, payLine, 'Everything you have set up stays exactly as it is.'],
        };
      }
    } else if ((state === 'paid' || state === 'due_soon') && t.paidUntil) {
      const left = daysUntil(t.paidUntil as string, now) ?? 99;
      if (left >= 0 && left <= 7) {
        const stage = left <= 1 ? '1d' : '7d';
        reminder = {
          kind: 'owner_renewal_due',
          key: `renewal:${id}:${dayKey(t.paidUntil as string)}:${stage}`,
          subject: left <= 1 ? 'Your Fundi POS subscription renews tomorrow' : `Your Fundi POS subscription renews in ${left} days`,
          heading: 'Time to renew',
          lines: [`${t.name} is paid until ${day(t.paidUntil as string)}.`, payLine],
        };
      }
    } else if (access.allowed && access.lockAt && (state === 'trial_expired' || state === 'overdue')) {
      reminder = {
        kind: 'owner_grace',
        key: `grace:${id}:${dayKey(access.lockAt)}`,
        subject: `Action needed: Fundi POS pauses on ${day(access.lockAt)}`,
        heading: state === 'trial_expired' ? 'Your free trial has ended' : 'Your subscription payment is overdue',
        lines: [
          `${t.name} will be paused on ${day(access.lockAt)} - staff won't be able to sign in or use the tills.`,
          payLine,
          'Your data is safe either way.',
        ],
      };
    } else if (!access.allowed && access.lockAt && (access.reason === 'trial_ended' || access.reason === 'payment_overdue')) {
      if (now.getTime() - access.lockAt.getTime() <= 3 * DAY) {
        reminder = {
          kind: 'owner_paused',
          key: `paused:${id}:${dayKey(access.lockAt)}`,
          subject: 'Fundi POS has been paused',
          heading: 'Your Fundi POS account is paused',
          lines: [
            `${t.name} has been paused because the ${access.reason === 'trial_ended' ? 'free trial ended' : 'subscription payment is overdue'}.`,
            payLine,
            'As soon as your payment is confirmed everything comes back - products, stock and sales history are all safe.',
          ],
        };
      }
    }

    if (!reminder) continue;
    const { to, ownerName } = await tenantContacts(payload, id);
    const { html, text } = render({
      heading: reminder.heading,
      intro: [greeting(ownerName), ...reminder.lines],
      cta: { label: 'Go to billing', href: appUrl('/billing') },
    });
    bump(reminder.kind, await sendEmail(payload, { key: reminder.key, kind: reminder.kind, tenantId: id, to, subject: reminder.subject, html, text }));
  }
  return counts;
}

// ----------------------------------------------------- scheduled: digest

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// The operator's Monday-morning email: who to call, what's waiting on you,
// and the week's numbers. Sent from 07:00 Nairobi on Mondays, once per
// ISO week (catches up on the next hourly run if the server was down).
export async function runPlatformDigest(payload: Payload, now = new Date(), { force = false } = {}): Promise<SendResult | 'not_due'> {
  const nairobi = new Date(now.getTime() + 3 * 3600_000);
  if (!force && (nairobi.getUTCDay() !== 1 || nairobi.getUTCHours() < 7)) return 'not_due';

  const stats = await buildStats(payload);
  const s = stats.summary;
  const inWeek = new Date(now.getTime() + 7 * DAY).toISOString();
  const weekAhead = dayKey(inWeek);
  const toCall = stats.tenants
    .filter((r) => isAttentionHealth(r.health.level))
    .sort((a, b) => b.health.urgency - a.health.urgency || b.sales.revenuePrev30 - a.sales.revenuePrev30)
    .slice(0, 15);
  const waiting = stats.tenants.filter((r) => r.pendingClaims > 0 || r.pendingTrialRequests > 0);
  const trialsEnding = stats.tenants.filter((r) => (r.state === 'trial' || r.state === 'trial_ending') && r.lockAt && r.lockAt <= inWeek);
  const locked = stats.tenants.filter((r) => r.blocked && r.status === 'active');
  const followUps = stats.tenants.filter((r) => r.followUpOn && r.followUpOn <= weekAhead);

  const sections = [
    waiting.length && {
      heading: `Waiting on you (${waiting.length})`,
      lines: waiting.map((r) => `${r.name}: ${[r.pendingClaims && `${r.pendingClaims} payment claim(s)`, r.pendingTrialRequests && 'trial extension request'].filter(Boolean).join(', ')}`),
    },
    toCall.length && {
      heading: `Call these (${toCall.length})`,
      lines: toCall.map((r) => `${r.name} - ${HEALTH_LABELS[r.health.level]}${r.health.reasons[0] ? `: ${r.health.reasons[0]}` : ''}`),
    },
    followUps.length && { heading: 'Follow-ups you planned', lines: followUps.map((r) => `${r.name} - ${r.followUpOn}`) },
    trialsEnding.length && { heading: 'Trials ending this week', lines: trialsEnding.map((r) => `${r.name} - pauses ${day(r.lockAt as string)}`) },
    locked.length && { heading: `Locked out (${locked.length})`, lines: locked.slice(0, 15).map((r) => `${r.name} - ${r.health.reasons[0] ?? r.state}`) },
  ].filter(Boolean) as Section[];

  const subject = waiting.length
    ? `${waiting.length} waiting on you · ${toCall.length} to call`
    : toCall.length
      ? `${toCall.length} shop${toCall.length === 1 ? '' : 's'} need a call`
      : 'All shops active this week';
  const { html, text } = render({
    heading: `Your week: ${subject}`,
    intro: [
      `${s.active7} of ${s.tenants} shops active this week · MRR ${kes(s.mrr)} · collected this month ${kes(s.collectedThisMonth)}.`,
      `Sales through Fundi in the last 30 days: ${kes(s.revenue30)}.`,
    ],
    sections,
    cta: { label: 'Open the console', href: appUrl('/platform') },
  });
  return sendEmail(payload, {
    key: force ? `digest:preview:${now.getTime()}` : `digest:${isoWeekKey(nairobi)}`,
    kind: 'operator_digest',
    to: await operatorRecipients(payload),
    subject: `${force ? '[Preview] ' : ''}Fundi POS weekly: ${subject}`,
    html,
    text,
  });
}

// ------------------------------------------- owner: added by the operator

// A shop the operator set up from the console: the owner gets a link to
// choose their own password (valid 72h - Users.ts auth.forgotPassword).
export async function sendOwnerWelcome(
  payload: Payload,
  args: { tenantId: number | string; ownerEmail: string; ownerName: string | null; link: string; trialDays: number; resend?: boolean },
): Promise<SendResult> {
  const tenant = await payload.findByID({ collection: 'tenants', id: args.tenantId, depth: 0, overrideAccess: true });
  const { html, text } = render({
    heading: args.resend ? 'Set your Fundi POS password' : `Welcome to Fundi POS, ${tenant.name}`,
    intro: [
      greeting(args.ownerName),
      args.resend
        ? `Here's a new link to set your password for ${tenant.name}.`
        : `Your shop ${tenant.name} is ready${args.trialDays > 0 ? `, with a ${args.trialDays}-day free trial` : ''}. Choose a password to sign in.`,
      'The link works for 72 hours. Your email address is your username.',
    ],
    cta: { label: 'Set my password', href: args.link },
  });
  return sendEmail(payload, {
    key: `owner_welcome:${tenant.id}:${Date.now()}`,
    kind: args.resend ? 'owner_set_password' : 'owner_welcome',
    tenantId: tenant.id,
    to: [args.ownerEmail],
    subject: args.resend ? 'Set your Fundi POS password' : `Welcome to Fundi POS - set your password`,
    html,
    text,
  });
}

// --------------------------------------------- scheduled: 30-day purges

// Daily. Soft-deleted tenants whose 30-day grace (Tenants.scheduledPurgeAt)
// has passed are deleted for good. One failure doesn't stop the rest.
export async function runScheduledPurges(payload: Payload, now = new Date()): Promise<{ purged: number; failed: number }> {
  const due = await payload.find({
    collection: 'tenants',
    where: { status: { equals: 'deleted' }, scheduledPurgeAt: { less_than_equal: now.toISOString() } },
    pagination: false,
    depth: 0,
    overrideAccess: true,
  });
  let purged = 0;
  let failed = 0;
  for (const t of due.docs) {
    try {
      await purgeTenant(payload, Number(t.id), { reason: '30 days after it was soft-deleted' });
      purged++;
    } catch (err) {
      failed++;
      console.warn(`[purge] tenant ${t.id} (${t.name}) failed`, err);
    }
  }
  return { purged, failed };
}
