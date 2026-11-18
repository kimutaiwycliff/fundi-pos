import config from '@payload-config';
import { getPayload } from 'payload';
import { sql } from 'drizzle-orm';
import { headers as nextHeaders } from 'next/headers';
import { HEALTH_LABELS, SETUP_STAGE_LABELS, SUBSCRIPTION_STATE_LABELS } from '@hardware-pos/business-logic';
import { csvResponse, toCsv } from '@/lib/csv';
import { buildStats } from '@/lib/platformStats';

const MAX_ROWS = 100_000;
const DAY = 86_400_000;

// Nairobi calendar date (YYYY-MM-DD) -> the UTC instant that day starts.
function nairobiStart(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}
const nairobiDateTime = (v: unknown) =>
  v ? new Date(v as string).toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', hour12: false }).replace(',', '') : '';

// PLATFORM-ADMIN ONLY. CSV downloads for the operator:
//   tenants   - one row per tenant, every number the console shows
//   sales     - one row per sale line across all shops, in a date range
//   payments  - subscription payments (confirmed) in a date range
// ?dataset=...&from=YYYY-MM-DD&to=YYYY-MM-DD (Nairobi days, inclusive;
// default the last 30 days). Capped at 100,000 rows.
export async function GET(request: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(request.url);
  const dataset = url.searchParams.get('dataset');
  const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
  const isDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const to = isDay(url.searchParams.get('to')) ?? today;
  const from = isDay(url.searchParams.get('from')) ?? new Date(nairobiStart(to).getTime() - 29 * DAY + 3 * 3600_000).toISOString().slice(0, 10);
  if (from > to) return Response.json({ error: '"from" must be on or before "to".' }, { status: 400 });
  const start = nairobiStart(from).toISOString();
  const end = new Date(nairobiStart(to).getTime() + DAY).toISOString();

  if (dataset === 'tenants') {
    const stats = await buildStats(payload);
    const csv = toCsv(
      ['ID', 'Tenant', 'Owner', 'Owner email', 'Phone', 'Account', 'Billing state', 'Locked out', 'Tier', 'Cycle', 'MRR (KES)', 'Paid until', 'Trial ends', 'Health', 'Health reasons', 'Setup stage', 'Last active', 'Active days 30d', 'Staff active 30d', 'Sales 30d (KES)', 'Sales prev 30d (KES)', 'Est. profit 30d (KES)', 'Stock at cost (KES)', 'Total paid (KES)', 'Repeat trial', 'Add-ons', 'Joined'],
      stats.tenants.map((r) => [
        r.id,
        r.name,
        r.owner?.name,
        r.owner?.email,
        r.billingContact.phone || r.owner?.phone,
        r.status,
        SUBSCRIPTION_STATE_LABELS[r.state],
        r.blocked ? 'yes' : 'no',
        r.subscriptionTier,
        r.billingCycle,
        r.monthlyValue,
        r.paidUntil?.slice(0, 10),
        r.trialEndsAt?.slice(0, 10),
        HEALTH_LABELS[r.health.level],
        r.health.reasons.join('; '),
        SETUP_STAGE_LABELS[r.setupStage],
        nairobiDateTime(r.activity.lastActiveAt),
        r.activity.activeDays30,
        `${r.activity.activeStaff30}/${r.activity.staff}`,
        Math.round(r.sales.revenue30),
        Math.round(r.sales.revenuePrev30),
        Math.round(r.sales.profit30),
        Math.round(r.sales.stockCost),
        r.payments.total,
        r.repeatTrial ? 'yes' : 'no',
        r.addons.join('; '),
        r.createdAt.slice(0, 10),
      ]),
    );
    return csvResponse(`fundi-tenants-${today}.csv`, csv);
  }

  if (dataset === 'sales') {
    const result = await payload.db.drizzle.execute(sql`
      SELECT o.tenant_id, t.name AS tenant, s.name AS store, o.id AS order_id, o.created_at, o.status, o.tender_type, o.channel,
        o.terminal_name, o.total AS order_total, p.name AS product, p.sku, li.variant, li.quantity, li.unit_price, li.discount,
        (li.quantity * li.unit_price - li.discount) AS line_total
      FROM orders o
      JOIN tenants t ON t.id = o.tenant_id
      LEFT JOIN stores s ON s.id = o.store_id
      JOIN orders_line_items li ON li._parent_id = o.id
      LEFT JOIN products p ON p.id = li.product_id
      WHERE o.created_at >= ${start} AND o.created_at < ${end}
      ORDER BY o.created_at, o.id
      LIMIT ${MAX_ROWS}`);
    const csv = toCsv(
      ['Tenant ID', 'Tenant', 'Branch', 'Order', 'Date (Nairobi)', 'Status', 'Payment', 'Channel', 'Till', 'Order total', 'Product', 'SKU', 'Variant', 'Qty', 'Unit price', 'Line discount', 'Line total'],
      (result.rows as Record<string, unknown>[]).map((r) => [
        r.tenant_id as number,
        r.tenant as string,
        r.store as string,
        r.order_id as string,
        nairobiDateTime(r.created_at),
        r.status as string,
        r.tender_type as string,
        r.channel as string,
        r.terminal_name as string,
        Number(r.order_total),
        r.product as string,
        r.sku as string,
        r.variant as string,
        Number(r.quantity),
        Number(r.unit_price),
        Number(r.discount),
        Number(r.line_total),
      ]),
    );
    return csvResponse(`fundi-sales-${from}-to-${to}.csv`, csv);
  }

  if (dataset === 'payments') {
    const found = await payload.find({
      collection: 'subscription-payments',
      where: { status: { equals: 'confirmed' }, paidAt: { greater_than_equal: start, less_than: end } },
      sort: 'paidAt',
      limit: MAX_ROWS,
      depth: 1,
      overrideAccess: true,
    });
    const csv = toCsv(
      ['Paid on', 'Tenant ID', 'Tenant', 'Amount (KES)', 'Method', 'Reference', 'Covers from', 'Covers to', 'Note'],
      found.docs.map((p) => {
        const t = p.tenant as { id: number; name: string } | number;
        return [
          String(p.paidAt).slice(0, 10),
          typeof t === 'object' ? t.id : t,
          typeof t === 'object' ? t.name : '',
          Number(p.amount),
          p.method as string,
          (p.reference as string) ?? '',
          p.periodStart ? String(p.periodStart).slice(0, 10) : '',
          p.periodEnd ? String(p.periodEnd).slice(0, 10) : '',
          (p.note as string) ?? '',
        ];
      }),
    );
    return csvResponse(`fundi-payments-${from}-to-${to}.csv`, csv);
  }

  return Response.json({ error: 'dataset must be tenants, sales or payments' }, { status: 400 });
}
