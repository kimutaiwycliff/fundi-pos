import type { Health, SetupStage, SubscriptionState } from '@hardware-pos/business-logic';

// Shapes returned by the API's GET /api/platform-stats (apps/api/src/app/
// api/platform-stats/route.ts) and the subscription-payments collection.

export type TenantStatus = 'active' | 'suspended' | 'deleted';

export interface PlatformTenantRow {
  id: number;
  name: string;
  status: TenantStatus;
  subscriptionTier: string;
  billingStatus: string;
  billingCycle: string;
  planPrice: number | null;
  cyclePrice: number;
  monthlyValue: number;
  paidUntil: string | null;
  trialEndsAt: string | null;
  daysUntilDue: number | null;
  state: SubscriptionState;
  needsAttention: boolean;
  addons: string[];
  createdAt: string;
  owner: { name: string | null; email: string | null; phone: string | null } | null;
  billingContact: { name: string | null; phone: string | null; email: string | null };
  usage: {
    stores: number;
    users: number;
    products: number;
    orders30d: number;
    gmv30d: number;
    lastOrderAt: string | null;
  };
  payments: { total: number; count: number; lastPaidAt: string | null };
  // When automatic lockout kicks in (null = not on a lapsing clock).
  lockAt: string | null;
  blocked: boolean;
  health: Health;
  setupStage: SetupStage;
  activity: {
    lastActiveAt: string | null;
    lastLoginAt: string | null;
    logins30: number;
    activeDays30: number;
    activeStaff30: number;
    staff: number;
    active7: boolean;
  };
  sales: {
    firstSaleAt: string | null;
    revenue30: number;
    revenuePrev30: number;
    profit30: number;
    stockCost: number;
    stockRetail: number;
    spark30: number[];
  };
  repeatTrial: boolean;
  pendingClaims: number;
  pendingTrialRequests: number;
  followUpOn: string | null;
  followUpDue: boolean;
  lastNoteAt: string | null;
}

export interface PlatformRecentPayment {
  id: number;
  tenant: number;
  tenantName: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
  periodEnd: string | null;
}

export interface PlatformStats {
  generatedAt: string;
  summary: {
    tenants: number;
    byStatus: Record<string, number>;
    byTier: Record<string, number>;
    byState: Record<string, number>;
    payingTenants: number;
    mrr: number;
    arr: number;
    overdue: number;
    dueSoon: number;
    trialsEnding: number;
    needsAttention: number;
    newThisMonth: number;
    activeLast30d: number;
    collectedThisMonth: number;
    collectedLastMonth: number;
    addons: Record<string, number>;
    active7: number;
    revenue30: number;
    profit30: number;
    health: Record<string, number>;
    atRisk: number;
    setupFunnel: Record<string, number>;
    followUpsDue: number;
    blocked: number;
    pendingClaims: number;
    pendingTrialRequests: number;
  };
  collectionsByMonth: { month: string; amount: number }[];
  recentPayments: PlatformRecentPayment[];
  daily: { day: string; revenue: number; activeTenants: number }[];
  tenants: PlatformTenantRow[];
}

// GET /api/tenants/:id/insights (apps/api/src/app/api/tenants/[id]/insights).
export interface TenantInsights {
  generatedAt: string;
  health: Health;
  setupStage: SetupStage;
  rollup: {
    lastActiveAt: string | null;
    lastLoginAt: string | null;
    logins30: number;
    activeDays30: number;
    activeStaff30: number;
    firstSaleAt: string | null;
    lastSaleAt: string | null;
    sales30: number;
    revenue30: number;
    revenuePrev30: number;
    profit30: number;
    stockCost: number;
    stockRetail: number;
    products: number;
    staff: number;
  };
  daily: { day: string; revenue: number; orders: number; profit: number }[];
  busyHours: { dow: number; hour: number; count: number }[];
  paymentMix: { method: string; count: number; amount: number }[];
  topProducts: { id: number; name: string; qty: number; revenue: number; profit: number | null }[];
  stores: { id: number; name: string; orders30: number; revenue30: number; stockCost: number }[];
  stockLinesMissingCost: number;
  staff: {
    id: number;
    name: string | null;
    email: string | null;
    phone: string | null;
    role: string;
    status: string;
    lastActiveAt: string | null;
    logins30: number;
    activeDays30: number;
    sales30: number;
    revenue30: number;
  }[];
  terminals: { terminal: string; name: string | null; store: string | null; lastSaleAt: string | null; sales30: number }[];
  activityCalendar: { day: string; users: number }[];
  appShare: { source: string; count: number }[];
  features: Record<string, number>;
  milestones: { firstProduct: string | null; firstStock: string | null; firstSale: string | null; tenthSale: string | null; firstPayment: string | null };
  lifetime: { orders: number; revenue: number; paidToUs: number };
  devices: {
    id: number;
    terminalId: string;
    name: string | null;
    platform: string | null;
    firstSeenAt: string | null;
    lastSeenAt: string | null;
    revokedAt: string | null;
    revokeReason: string | null;
    lastUser: string | null;
  }[];
  priorTrials: { id: number; businessName: string; tenantId: number | null; createdAt: string | null; source: string; matchedOn: string[] }[];
}

export interface PlatformTenantNote {
  id: number;
  tenant: number | { id: number };
  author?: number | { id: number; name?: string | null; email: string } | null;
  kind: 'call' | 'whatsapp' | 'email' | 'visit' | 'note';
  body: string;
  followUpOn?: string | null;
  createdAt: string;
}

export interface SubscriptionPayment {
  id: number;
  tenant: number | { id: number; name: string };
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
  periodStart?: string | null;
  periodEnd?: string | null;
  note?: string | null;
  recordedBy?: number | { id: number; name?: string | null; email: string } | null;
  // Tenant "I've paid" claims start pending; only confirmed ones count.
  status?: 'pending' | 'confirmed' | 'rejected';
  claimedBy?: number | { id: number; name?: string | null; email: string } | null;
  rejectReason?: string | null;
  createdAt: string;
}

export interface TrialExtensionRequest {
  id: number;
  tenant: number | { id: number; name: string };
  requestedBy?: number | { id: number; name?: string | null; email: string } | null;
  message?: string | null;
  status: 'pending' | 'approved' | 'declined';
  daysGranted?: number | null;
  decidedAt?: string | null;
  newTrialEndsAt?: string | null;
  createdAt: string;
}

export interface PlatformNotification {
  id: number;
  kind: string;
  to: string;
  subject: string;
  status: 'sent' | 'logged' | 'failed';
  error?: string | null;
  createdAt: string;
}

// Minimal tenant info the Record payment dialog needs to prefill itself.
export interface PayableTenant {
  id: number;
  name: string;
  cyclePrice: number;
  billingCycle: string;
  paidUntil: string | null;
}

export const PAYMENT_METHODS = ['mpesa', 'bank', 'card', 'cash', 'other'] as const;
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  mpesa: 'M-Pesa',
  bank: 'Bank',
  card: 'Card',
  cash: 'Cash',
  other: 'Other',
};

export const SUBSCRIPTION_TIERS = ['trial', 'starter', 'growth', 'enterprise'] as const;
export const BILLING_STATUSES = ['active', 'trialing', 'past_due', 'canceled'] as const;
export const CYCLE_LABELS: Record<string, string> = { monthly: 'month', quarterly: 'quarter', annual: 'year' };

export function paymentTenantId(p: SubscriptionPayment): number {
  return typeof p.tenant === 'object' ? p.tenant.id : p.tenant;
}

export function recordedByName(p: SubscriptionPayment): string {
  if (!p.recordedBy) return '—';
  if (typeof p.recordedBy === 'object') return p.recordedBy.name || p.recordedBy.email;
  return `admin #${p.recordedBy}`;
}
