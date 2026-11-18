import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { background } from '@/lib/background';
import { CAMPAIGN_MAX_RECIPIENTS, fillPlaceholders, inSegment, isSegment, SEGMENTS, unsubscribeToken } from '@/lib/campaigns';
import { sendEmail } from '@/lib/email';
import { appUrl, operatorRecipients, render } from '@/lib/notifications';
import { buildStats } from '@/lib/platformStats';

type Row = Awaited<ReturnType<typeof buildStats>>['tenants'][number];

function compose(payload: Parameters<typeof unsubscribeToken>[0], row: Row, subject: string, body: string) {
  const paragraphs = fillPlaceholders(body, row)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
  const rendered = render({
    heading: fillPlaceholders(subject, row),
    intro: paragraphs,
    cta: { label: 'Open Fundi POS', href: appUrl('/dashboard') },
    footer: { text: "Don't want updates like this? Unsubscribe", href: appUrl(`/unsubscribe?t=${encodeURIComponent(unsubscribeToken(payload, row.id))}`) },
  });
  return { subject: fillPlaceholders(subject, row), ...rendered };
}

// GET: past campaigns. POST {action: preview|test|send, segment, subject, body}:
//   preview - who it would reach + a rendered sample
//   test    - sends the sample to the operator's own inbox
//   send    - records the campaign and emails every shop in the group once
//             (needs confirmCount = the previewed count, so a group that grew
//             since the preview isn't emailed by surprise). {{shop}} and
//             {{owner}} are filled in per shop. Unsubscribed shops are skipped.
export async function GET() {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const past = await payload.find({ collection: 'platform-campaigns', sort: '-createdAt', limit: 50, depth: 1, overrideAccess: true });
  return Response.json({ segments: SEGMENTS, max: CAMPAIGN_MAX_RECIPIENTS, campaigns: past.docs });
}

export async function POST(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action;
  const segment = body.segment;
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 150) : '';
  const text = typeof body.body === 'string' ? body.body.trim().slice(0, 5000) : '';
  if (!isSegment(segment)) return Response.json({ error: 'Pick who to send it to.' }, { status: 400 });
  if (!subject || !text) return Response.json({ error: 'Write a subject and a message.' }, { status: 400 });

  const stats = await buildStats(payload);
  const inGroup = stats.tenants.filter((r) => inSegment(r, segment));
  const optedOut = inGroup.filter((r) => r.marketingOptOut);
  const noEmail = inGroup.filter((r) => !r.marketingOptOut && !(r.billingContact.email || r.owner?.email));
  const recipients = inGroup.filter((r) => !r.marketingOptOut && (r.billingContact.email || r.owner?.email));
  const sampleRow = recipients[0] ?? inGroup[0];

  if (action === 'preview') {
    return Response.json({
      count: recipients.length,
      optedOut: optedOut.length,
      noEmail: noEmail.length,
      max: CAMPAIGN_MAX_RECIPIENTS,
      names: recipients.slice(0, 50).map((r) => r.name),
      sample: sampleRow ? { to: sampleRow.billingContact.email || sampleRow.owner?.email, ...compose(payload, sampleRow, subject, text) } : null,
    });
  }

  if (action === 'test') {
    const row = sampleRow ?? ({ id: 0, name: 'Sample Hardware', owner: { name: 'Wanjiku' } } as unknown as Row);
    const msg = compose(payload, row, subject, text);
    const result = await sendEmail(payload, {
      key: `campaign_test:${Date.now()}`,
      kind: 'operator_campaign_test',
      to: await operatorRecipients(payload),
      subject: `[Test] ${msg.subject}`,
      html: msg.html,
      text: msg.text,
    });
    return Response.json({ result });
  }

  if (action === 'send') {
    if (recipients.length === 0) return Response.json({ error: 'Nobody in this group can be emailed.' }, { status: 400 });
    if (Number(body.confirmCount) !== recipients.length) {
      return Response.json({ error: `The group changed to ${recipients.length} shops since the preview - preview again.`, count: recipients.length }, { status: 409 });
    }
    if (recipients.length > CAMPAIGN_MAX_RECIPIENTS) {
      return Response.json({ error: `That's ${recipients.length} shops - the limit per campaign is ${CAMPAIGN_MAX_RECIPIENTS}. Pick a smaller group.` }, { status: 400 });
    }
    const campaign = await payload.create({
      collection: 'platform-campaigns',
      overrideAccess: true,
      data: { subject, body: text, segment, recipients: recipients.length, skippedOptedOut: optedOut.length, sentBy: user.id },
    });
    background('campaign', async () => {
      for (const r of recipients) {
        const msg = compose(payload, r, subject, text);
        await sendEmail(payload, {
          key: `campaign:${campaign.id}:${r.id}`,
          kind: 'campaign',
          tenantId: r.id,
          to: [String(r.billingContact.email || r.owner?.email)],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
        });
      }
    });
    return Response.json({ campaignId: campaign.id, queued: recipients.length }, { status: 201 });
  }

  return Response.json({ error: 'action must be preview, test or send' }, { status: 400 });
}
