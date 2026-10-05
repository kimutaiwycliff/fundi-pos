import type { SubscriptionState } from '@hardware-pos/business-logic';

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
  };
  collectionsByMonth: { month: string; amount: number }[];
  recentPayments: PlatformRecentPayment[];
  tenants: PlatformTenantRow[];
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
