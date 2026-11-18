// GET /api/billing (apps/api/src/app/api/billing/route.ts).
export interface TenantBilling {
  tenant: { id: number; name: string };
  plan: { tier: string; cycle: string; price: number };
  state: string;
  stateLabel: string;
  allowed: boolean;
  lockAt: string | null;
  trialEndsAt: string;
  paidUntil: string | null;
  plans: { tier: string; monthly: number }[];
  payTo: { kind: 'paybill' | 'till' | 'phone' | null; number: string | null; account: string | null; name: string | null; line: string };
  payments: {
    id: number;
    amount: number;
    method: string;
    reference: string | null;
    paidAt: string;
    periodEnd: string | null;
    status: 'pending' | 'confirmed' | 'rejected';
    rejectReason: string | null;
  }[];
  trialRequests: { id: number; status: 'pending' | 'approved' | 'declined'; message: string | null; daysGranted: number | null; createdAt: string }[];
}
