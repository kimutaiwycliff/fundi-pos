import type { Payload } from 'payload';
import { sql, type SQL } from 'drizzle-orm';

// Cross-tenant usage numbers for the /platform console (platform-stats and
// the per-tenant insights route). Every query is a single GROUP BY across
// all tenants (or one tenant) - never a query per tenant. Read-only.
//
// Conventions:
//   - "sale" = a completed order; refunded/voided ones don't count.
//   - Days are Nairobi calendar days (YYYY-MM-DD).
//   - Profit = line net (qty x unit price - line discount) minus qty x cost,
//     cost from the variant, else the product. Lines whose cost is unknown
//     (0/empty) are left out of profit rather than counted as pure margin.
//     Order-level promo/loyalty discounts aren't apportioned, so it's an
//     estimate and labelled as one in the UI.
//   - Stock on hand = the running total of stock_movements.

const DAY_MS = 24 * 60 * 60 * 1000;
const NAIROBI_DAY = (col: SQL) => sql`to_char(${col} AT TIME ZONE 'Africa/Nairobi', 'YYYY-MM-DD')`;

export function nairobiDay(date: Date): string {
  return new Date(date.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function lastNDays(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(nairobiDay(new Date(now.getTime() - i * DAY_MS)));
  return out;
}

async function rows(payload: Payload, query: SQL): Promise<Record<string, unknown>[]> {
  const result = await payload.db.drizzle.execute(query);
  return result.rows as Record<string, unknown>[];
}

const num = (v: unknown) => (v == null ? 0 : Number(v));
const iso = (v: unknown) => (v == null ? null : new Date(v as string).toISOString());

// Cost of one line item - variant cost, else product cost; NULL if unknown.
const LINE_COST = sql`NULLIF(COALESCE(NULLIF(pv.cost_price, 0), p.cost_price), 0)`;
const LINE_NET = sql`(li.quantity * li.unit_price - li.discount)`;

export interface TenantRollup {
  lastActiveAt: string | null;
  lastLoginAt: string | null;
  logins30: number;
  activeDays30: number;
  activeStaff30: number;
  active7: boolean;
  firstSaleAt: string | null;
  lastSaleAt: string | null;
  sales30: number;
  revenue30: number;
  revenuePrev30: number;
  profit30: number;
  stockCost: number;
  stockRetail: number;
  products: number;
  pricedProducts: number;
  stockedProducts: number;
  staff: number;
  spark30: number[];
  followUpOn: string | null;
  lastNoteAt: string | null;
}

export const emptyRollup = (): TenantRollup => ({
  lastActiveAt: null,
  lastLoginAt: null,
  logins30: 0,
  activeDays30: 0,
  activeStaff30: 0,
  active7: false,
  firstSaleAt: null,
  lastSaleAt: null,
  sales30: 0,
  revenue30: 0,
  revenuePrev30: 0,
  profit30: 0,
  stockCost: 0,
  stockRetail: 0,
  products: 0,
  pricedProducts: 0,
  stockedProducts: 0,
  staff: 0,
  spark30: Array(30).fill(0),
  followUpOn: null,
  lastNoteAt: null,
});

// Per-tenant activity, sales, stock and follow-up numbers for every tenant
// (or just `tenantId`).
export async function tenantRollups(payload: Payload, now: Date, tenantId?: number): Promise<Map<number, TenantRollup>> {
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const since60 = new Date(now.getTime() - 60 * DAY_MS).toISOString();
  const since7 = new Date(now.getTime() - 7 * DAY_MS).toISOString();
  const day30 = nairobiDay(new Date(now.getTime() - 29 * DAY_MS));
  // Follow-ups more than a week overdue stop nagging.
  const overdueLimit = nairobiDay(new Date(now.getTime() - 7 * DAY_MS));
  const only = (col: SQL) => (tenantId == null ? sql`TRUE` : sql`${col} = ${tenantId}`);

  const [activity, sales, daily, profit, products, stock, staff, notes] = await Promise.all([
    rows(payload, sql`
      SELECT tenant_id,
        MAX(last_seen_at) AS last_seen,
        MAX(last_seen_at) FILTER (WHERE logins > 0) AS last_login,
        COALESCE(SUM(logins) FILTER (WHERE day >= ${day30}), 0) AS logins30,
        COUNT(DISTINCT day) FILTER (WHERE day >= ${day30}) AS active_days30,
        COUNT(DISTINCT user_id) FILTER (WHERE day >= ${day30}) AS active_staff30,
        BOOL_OR(last_seen_at >= ${since7}) AS active7
      FROM tenant_activity_days WHERE ${only(sql`tenant_id`)} GROUP BY tenant_id`),
    rows(payload, sql`
      SELECT tenant_id,
        MIN(created_at) AS first_sale, MAX(created_at) AS last_sale,
        COUNT(*) FILTER (WHERE created_at >= ${since30}) AS sales30,
        COALESCE(SUM(total) FILTER (WHERE created_at >= ${since30}), 0) AS revenue30,
        COALESCE(SUM(total) FILTER (WHERE created_at >= ${since60} AND created_at < ${since30}), 0) AS revenue_prev30
      FROM orders WHERE status = 'completed' AND ${only(sql`tenant_id`)} GROUP BY tenant_id`),
    rows(payload, sql`
      SELECT tenant_id, ${NAIROBI_DAY(sql`created_at`)} AS day, COALESCE(SUM(total), 0) AS revenue
      FROM orders WHERE status = 'completed' AND created_at >= ${since30} AND ${only(sql`tenant_id`)}
      GROUP BY tenant_id, day`),
    rows(payload, sql`
      SELECT o.tenant_id, COALESCE(SUM(${LINE_NET} - li.quantity * ${LINE_COST}), 0) AS profit
      FROM orders o
      JOIN orders_line_items li ON li._parent_id = o.id
      JOIN products p ON p.id = li.product_id
      LEFT JOIN products_variants pv ON pv.id = li.variant
      WHERE o.status = 'completed' AND o.created_at >= ${since30} AND ${LINE_COST} IS NOT NULL AND ${only(sql`o.tenant_id`)}
      GROUP BY o.tenant_id`),
    rows(payload, sql`
      SELECT tenant_id, COUNT(*) AS products, COUNT(*) FILTER (WHERE sell_price > 0) AS priced
      FROM products WHERE is_active AND ${only(sql`tenant_id`)} GROUP BY tenant_id`),
    rows(payload, sql`
      SELECT s.tenant_id,
        COUNT(DISTINCT s.product_id) AS stocked,
        COALESCE(SUM(s.on_hand * COALESCE(NULLIF(pv.cost_price, 0), p.cost_price, 0)), 0) AS stock_cost,
        COALESCE(SUM(s.on_hand * COALESCE(NULLIF(pv.sell_price, 0), p.sell_price, 0)), 0) AS stock_retail
      FROM (
        SELECT tenant_id, product_id, variant, SUM(quantity_delta) AS on_hand
        FROM stock_movements WHERE ${only(sql`tenant_id`)}
        GROUP BY tenant_id, product_id, variant
        HAVING SUM(quantity_delta) > 0
      ) s
      JOIN products p ON p.id = s.product_id
      LEFT JOIN products_variants pv ON pv.id = s.variant
      GROUP BY s.tenant_id`),
    rows(payload, sql`
      SELECT tenant_id, COUNT(*) AS n FROM users WHERE status = 'active' AND ${only(sql`tenant_id`)} GROUP BY tenant_id`),
    rows(payload, sql`
      SELECT tenant_id,
        MIN(follow_up_on) FILTER (WHERE follow_up_on >= ${overdueLimit}) AS follow_up_on,
        MAX(created_at) AS last_note
      FROM platform_tenant_notes WHERE ${only(sql`tenant_id`)} GROUP BY tenant_id`),
  ]);

  const out = new Map<number, TenantRollup>();
  const get = (id: unknown) => {
    const key = Number(id);
    let r = out.get(key);
    if (!r) out.set(key, (r = emptyRollup()));
    return r;
  };
  for (const a of activity) {
    const r = get(a.tenant_id);
    r.lastActiveAt = iso(a.last_seen);
    r.lastLoginAt = iso(a.last_login);
    r.logins30 = num(a.logins30);
    r.activeDays30 = num(a.active_days30);
    r.activeStaff30 = num(a.active_staff30);
    r.active7 = Boolean(a.active7);
  }
  for (const s of sales) {
    const r = get(s.tenant_id);
    r.firstSaleAt = iso(s.first_sale);
    r.lastSaleAt = iso(s.last_sale);
    r.sales30 = num(s.sales30);
    r.revenue30 = num(s.revenue30);
    r.revenuePrev30 = num(s.revenue_prev30);
    // A sale is activity too (covers tills that sync but rarely sign in).
    if (r.lastSaleAt && (!r.lastActiveAt || r.lastSaleAt > r.lastActiveAt)) r.lastActiveAt = r.lastSaleAt;
    if (r.lastSaleAt && r.lastSaleAt >= since7) r.active7 = true;
  }
  const dayIndex = new Map(lastNDays(now, 30).map((d, i) => [d, i]));
  for (const d of daily) {
    const i = dayIndex.get(String(d.day));
    if (i != null) get(d.tenant_id).spark30[i] = num(d.revenue);
  }
  for (const p of profit) get(p.tenant_id).profit30 = num(p.profit);
  for (const p of products) {
    const r = get(p.tenant_id);
    r.products = num(p.products);
    r.pricedProducts = num(p.priced);
  }
  for (const s of stock) {
    const r = get(s.tenant_id);
    r.stockedProducts = num(s.stocked);
    r.stockCost = num(s.stock_cost);
    r.stockRetail = num(s.stock_retail);
  }
  for (const s of staff) get(s.tenant_id).staff = num(s.n);
  for (const n of notes) {
    const r = get(n.tenant_id);
    r.followUpOn = (n.follow_up_on as string | null) ?? null;
    r.lastNoteAt = iso(n.last_note);
  }
  return out;
}

// Portfolio-wide daily series for the overview chart: sales through Fundi
// and how many shops were in use each day.
export async function platformDaily(payload: Payload, now: Date): Promise<{ day: string; revenue: number; activeTenants: number }[]> {
  const days = lastNDays(now, 30);
  const since = new Date(now.getTime() - 31 * DAY_MS).toISOString();
  const [revenue, active] = await Promise.all([
    rows(payload, sql`
      SELECT ${NAIROBI_DAY(sql`created_at`)} AS day, COALESCE(SUM(total), 0) AS revenue
      FROM orders WHERE status = 'completed' AND created_at >= ${since} GROUP BY day`),
    rows(payload, sql`
      SELECT day, COUNT(DISTINCT tenant_id) AS n FROM (
        SELECT day, tenant_id FROM tenant_activity_days WHERE day >= ${days[0]}
        UNION
        SELECT ${NAIROBI_DAY(sql`created_at`)} AS day, tenant_id FROM orders WHERE status = 'completed' AND created_at >= ${since}
      ) x GROUP BY day`),
  ]);
  const rev = new Map(revenue.map((r) => [String(r.day), num(r.revenue)]));
  const act = new Map(active.map((r) => [String(r.day), num(r.n)]));
  return days.map((day) => ({ day, revenue: rev.get(day) ?? 0, activeTenants: act.get(day) ?? 0 }));
}

// Everything the tenant detail page's Overview / Usage / Team tabs show
// beyond the rollup.
export async function tenantDetail(payload: Payload, tenantId: number, now: Date) {
  const days90 = lastNDays(now, 90);
  const since90 = new Date(now.getTime() - 91 * DAY_MS).toISOString();
  const since30 = new Date(now.getTime() - 30 * DAY_MS).toISOString();
  const day30 = nairobiDay(new Date(now.getTime() - 29 * DAY_MS));
  const t = tenantId;

  const [daily, dailyProfit, busy, mix, top, perStore, storeStock, staffRows, terminals, calendar, sources, features, milestones, lifetime] =
    await Promise.all([
      rows(payload, sql`
        SELECT ${NAIROBI_DAY(sql`created_at`)} AS day, COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue
        FROM orders WHERE tenant_id = ${t} AND status = 'completed' AND created_at >= ${since90} GROUP BY day`),
      rows(payload, sql`
        SELECT ${NAIROBI_DAY(sql`o.created_at`)} AS day, COALESCE(SUM(${LINE_NET} - li.quantity * ${LINE_COST}), 0) AS profit
        FROM orders o
        JOIN orders_line_items li ON li._parent_id = o.id
        JOIN products p ON p.id = li.product_id
        LEFT JOIN products_variants pv ON pv.id = li.variant
        WHERE o.tenant_id = ${t} AND o.status = 'completed' AND o.created_at >= ${since90} AND ${LINE_COST} IS NOT NULL
        GROUP BY day`),
      rows(payload, sql`
        SELECT EXTRACT(ISODOW FROM created_at AT TIME ZONE 'Africa/Nairobi')::int AS dow,
          EXTRACT(HOUR FROM created_at AT TIME ZONE 'Africa/Nairobi')::int AS hour, COUNT(*) AS n
        FROM orders WHERE tenant_id = ${t} AND status = 'completed' AND created_at >= ${since90} GROUP BY dow, hour`),
      rows(payload, sql`
        SELECT tender_type AS method, COUNT(*) AS n, COALESCE(SUM(total), 0) AS amount
        FROM orders WHERE tenant_id = ${t} AND status = 'completed' AND created_at >= ${since30}
        GROUP BY tender_type ORDER BY amount DESC`),
      rows(payload, sql`
        SELECT p.id, p.name, COALESCE(SUM(li.quantity), 0) AS qty, COALESCE(SUM(${LINE_NET}), 0) AS revenue,
          SUM(${LINE_NET} - li.quantity * ${LINE_COST}) AS profit
        FROM orders o
        JOIN orders_line_items li ON li._parent_id = o.id
        JOIN products p ON p.id = li.product_id
        LEFT JOIN products_variants pv ON pv.id = li.variant
        WHERE o.tenant_id = ${t} AND o.status = 'completed' AND o.created_at >= ${since30}
        GROUP BY p.id, p.name ORDER BY revenue DESC LIMIT 8`),
      rows(payload, sql`
        SELECT s.id, s.name, COUNT(o.id) AS orders, COALESCE(SUM(o.total), 0) AS revenue
        FROM stores s
        LEFT JOIN orders o ON o.store_id = s.id AND o.status = 'completed' AND o.created_at >= ${since30}
        WHERE s.tenant_id = ${t} GROUP BY s.id, s.name ORDER BY revenue DESC`),
      rows(payload, sql`
        SELECT s.store_id,
          COALESCE(SUM(s.on_hand * COALESCE(NULLIF(pv.cost_price, 0), p.cost_price, 0)), 0) AS stock_cost,
          COUNT(*) FILTER (WHERE COALESCE(NULLIF(pv.cost_price, 0), p.cost_price, 0) = 0) AS missing_cost
        FROM (
          SELECT store_id, product_id, variant, SUM(quantity_delta) AS on_hand
          FROM stock_movements WHERE tenant_id = ${t}
          GROUP BY store_id, product_id, variant HAVING SUM(quantity_delta) > 0
        ) s
        JOIN products p ON p.id = s.product_id
        LEFT JOIN products_variants pv ON pv.id = s.variant
        GROUP BY s.store_id`),
      rows(payload, sql`
        SELECT u.id, u.name, u.email, u.phone, u.role, u.status,
          a.last_seen, a.logins30, a.active_days30, COALESCE(o.sales30, 0) AS sales30, COALESCE(o.revenue30, 0) AS revenue30
        FROM users u
        LEFT JOIN (
          SELECT user_id, MAX(last_seen_at) AS last_seen,
            COALESCE(SUM(logins) FILTER (WHERE day >= ${day30}), 0) AS logins30,
            COUNT(*) FILTER (WHERE day >= ${day30}) AS active_days30
          FROM tenant_activity_days WHERE tenant_id = ${t} GROUP BY user_id
        ) a ON a.user_id = u.id
        LEFT JOIN (
          SELECT cashier_id, COUNT(*) AS sales30, SUM(total) AS revenue30
          FROM orders WHERE tenant_id = ${t} AND status = 'completed' AND created_at >= ${since30} GROUP BY cashier_id
        ) o ON o.cashier_id = u.id
        WHERE u.tenant_id = ${t}
        ORDER BY a.last_seen DESC NULLS LAST`),
      rows(payload, sql`
        SELECT o.terminal, MAX(o.terminal_name) AS name, MAX(s.name) AS store, MAX(o.created_at) AS last_sale,
          COUNT(*) FILTER (WHERE o.created_at >= ${since30}) AS sales30
        FROM orders o LEFT JOIN stores s ON s.id = o.store_id
        WHERE o.tenant_id = ${t} GROUP BY o.terminal ORDER BY last_sale DESC LIMIT 50`),
      rows(payload, sql`
        SELECT day, COUNT(DISTINCT user_id) AS users FROM tenant_activity_days
        WHERE tenant_id = ${t} AND day >= ${days90[0]} GROUP BY day`),
      rows(payload, sql`
        SELECT src AS source, SUM(pings + logins) AS n
        FROM tenant_activity_days, jsonb_array_elements_text(COALESCE(sources, '[]'::jsonb)) AS src
        WHERE tenant_id = ${t} AND day >= ${day30} GROUP BY src`),
      rows(payload, sql`
        SELECT
          (SELECT COUNT(*) FROM stores WHERE tenant_id = ${t}) AS stores,
          (SELECT COUNT(*) FROM customers WHERE tenant_id = ${t}) AS customers,
          (SELECT COUNT(*) FROM suppliers WHERE tenant_id = ${t}) AS suppliers,
          (SELECT COUNT(*) FROM quotations WHERE tenant_id = ${t} AND created_at >= ${since30}) AS quotations30,
          (SELECT COUNT(*) FROM purchase_orders WHERE tenant_id = ${t}) AS purchase_orders,
          (SELECT COUNT(*) FROM stock_transfers WHERE tenant_id = ${t}) AS stock_transfers,
          (SELECT COUNT(*) FROM shifts WHERE tenant_id = ${t} AND opened_at >= ${since30}) AS shifts30,
          (SELECT COUNT(*) FROM orders WHERE tenant_id = ${t} AND status = 'completed' AND tender_type = 'credit' AND created_at >= ${since30}) AS credit_sales30,
          (SELECT COUNT(*) FROM orders WHERE tenant_id = ${t} AND status = 'completed' AND tender_type = 'mpesa' AND created_at >= ${since30}) AS mpesa_sales30,
          (SELECT COUNT(*) FROM orders WHERE tenant_id = ${t} AND status = 'completed' AND channel <> 'walk_in' AND created_at >= ${since30}) AS non_walk_in30,
          (SELECT COUNT(*) FROM promo_codes WHERE tenant_id = ${t}) AS promo_codes,
          (SELECT COUNT(*) FROM products WHERE tenant_id = ${t} AND is_active AND cost_price > 0) AS costed_products,
          (SELECT COUNT(*) FROM products WHERE tenant_id = ${t} AND is_active) AS products`),
      rows(payload, sql`
        SELECT
          (SELECT MIN(created_at) FROM products WHERE tenant_id = ${t}) AS first_product,
          (SELECT MIN(created_at) FROM stock_movements WHERE tenant_id = ${t} AND quantity_delta > 0) AS first_stock,
          (SELECT MIN(created_at) FROM orders WHERE tenant_id = ${t} AND status = 'completed') AS first_sale,
          (SELECT created_at FROM orders WHERE tenant_id = ${t} AND status = 'completed' ORDER BY created_at OFFSET 9 LIMIT 1) AS tenth_sale,
          (SELECT MIN(paid_at) FROM subscription_payments WHERE tenant_id = ${t}) AS first_payment`),
      rows(payload, sql`
        SELECT COUNT(*) AS orders, COALESCE(SUM(total), 0) AS revenue,
          (SELECT COALESCE(SUM(amount), 0) FROM subscription_payments WHERE tenant_id = ${t}) AS paid_to_us
        FROM orders WHERE tenant_id = ${t} AND status = 'completed'`),
    ]);

  const dailyMap = new Map(daily.map((d) => [String(d.day), d]));
  const profitMap = new Map(dailyProfit.map((d) => [String(d.day), num(d.profit)]));
  const calendarMap = new Map(calendar.map((c) => [String(c.day), num(c.users)]));
  const stockByStore = new Map(storeStock.map((s) => [Number(s.store_id), s]));
  const f = features[0] ?? {};
  const m = milestones[0] ?? {};
  const l = lifetime[0] ?? {};

  return {
    daily: days90.map((day) => ({
      day,
      revenue: num(dailyMap.get(day)?.revenue),
      orders: num(dailyMap.get(day)?.orders),
      profit: profitMap.get(day) ?? 0,
    })),
    busyHours: busy.map((b) => ({ dow: num(b.dow), hour: num(b.hour), count: num(b.n) })),
    paymentMix: mix.map((p) => ({ method: String(p.method), count: num(p.n), amount: num(p.amount) })),
    topProducts: top.map((p) => ({
      id: Number(p.id),
      name: String(p.name),
      qty: num(p.qty),
      revenue: num(p.revenue),
      profit: p.profit == null ? null : num(p.profit),
    })),
    stores: perStore.map((s) => ({
      id: Number(s.id),
      name: String(s.name),
      orders30: num(s.orders),
      revenue30: num(s.revenue),
      stockCost: num(stockByStore.get(Number(s.id))?.stock_cost),
    })),
    stockLinesMissingCost: storeStock.reduce((sum, s) => sum + num(s.missing_cost), 0),
    staff: staffRows.map((s) => ({
      id: Number(s.id),
      name: (s.name as string | null) ?? null,
      email: (s.email as string | null) ?? null,
      phone: (s.phone as string | null) ?? null,
      role: String(s.role),
      status: String(s.status),
      lastActiveAt: iso(s.last_seen),
      logins30: num(s.logins30),
      activeDays30: num(s.active_days30),
      sales30: num(s.sales30),
      revenue30: num(s.revenue30),
    })),
    terminals: terminals.map((r) => ({
      terminal: String(r.terminal),
      name: (r.name as string | null) ?? null,
      store: (r.store as string | null) ?? null,
      lastSaleAt: iso(r.last_sale),
      sales30: num(r.sales30),
    })),
    activityCalendar: days90.map((day) => ({ day, users: calendarMap.get(day) ?? 0 })),
    appShare: sources.map((s) => ({ source: String(s.source), count: num(s.n) })),
    features: {
      stores: num(f.stores),
      customers: num(f.customers),
      suppliers: num(f.suppliers),
      quotations30: num(f.quotations30),
      purchaseOrders: num(f.purchase_orders),
      stockTransfers: num(f.stock_transfers),
      shifts30: num(f.shifts30),
      creditSales30: num(f.credit_sales30),
      mpesaSales30: num(f.mpesa_sales30),
      nonWalkIn30: num(f.non_walk_in30),
      promoCodes: num(f.promo_codes),
      costedProducts: num(f.costed_products),
      products: num(f.products),
    },
    milestones: {
      firstProduct: iso(m.first_product),
      firstStock: iso(m.first_stock),
      firstSale: iso(m.first_sale),
      tenthSale: iso(m.tenth_sale),
      firstPayment: iso(m.first_payment),
    },
    lifetime: { orders: num(l.orders), revenue: num(l.revenue), paidToUs: num(l.paid_to_us) },
  };
}

export type TenantDetail = Awaited<ReturnType<typeof tenantDetail>>;
