// How healthy a tenant's use of Fundi POS is, for the /platform console.
// Pure: the caller passes what the database knows. Ported from PharmaTrack's
// operator console (lib/insights/health.ts) and adapted to Fundi's own
// subscription states.
//
//   new            signed up < 7 days ago, no sale yet ("Getting started")
//   never_started  signed up >= 7 days ago and has never made a sale
//   inactive       nobody used it for more than 14 days
//   at_risk        last used 8-14 days ago
//   slipping       last used 4-7 days ago, or sales halved vs the previous 30 days
//   healthy        used in the last 3 days and sales holding up
//
// "Used" = the latest of a sign-in / dashboard visit / till ping, or a sale.
import type { SubscriptionState } from './subscription.ts';

export const HEALTH_LEVELS = ['healthy', 'new', 'slipping', 'at_risk', 'never_started', 'inactive'] as const;
export type HealthLevel = (typeof HEALTH_LEVELS)[number];

export const HEALTH_LABELS: Record<HealthLevel, string> = {
  healthy: 'Healthy',
  new: 'Getting started',
  slipping: 'Slipping',
  at_risk: 'At risk',
  never_started: 'Never started',
  inactive: 'Inactive',
};

// Higher = needs a call sooner.
const URGENCY: Record<HealthLevel, number> = { healthy: 0, new: 1, slipping: 2, at_risk: 3, never_started: 4, inactive: 5 };

export interface HealthInput {
  now: Date;
  createdAt: string;
  lastActiveAt: string | null;
  firstSaleAt: string | null;
  revenue30: number;
  revenuePrev30: number;
  activeStaff30: number;
  staffCount: number;
  state: SubscriptionState;
  // Days left on the trial / paid period, for the "ends in N days" reason.
  daysLeft?: number | null;
}

export interface Health {
  level: HealthLevel;
  label: string;
  // Most urgent first; plain sentences for the operator.
  reasons: string[];
  urgency: number;
  daysSinceActive: number | null;
}

const DAY = 24 * 60 * 60 * 1000;
const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

export function computeHealth(i: HealthInput): Health {
  const now = i.now.getTime();
  const age = Math.floor((now - new Date(i.createdAt).getTime()) / DAY);
  const idle = i.lastActiveAt == null ? null : Math.max(0, Math.floor((now - new Date(i.lastActiveAt).getTime()) / DAY));
  const reasons: string[] = [];

  let level: HealthLevel;
  if (i.firstSaleAt == null && age < 7) level = 'new';
  else if (i.firstSaleAt == null) level = 'never_started';
  else if (idle == null || idle > 14) level = 'inactive';
  else if (idle >= 8) level = 'at_risk';
  else if (idle >= 4) level = 'slipping';
  else level = 'healthy';

  // Sales falling hard while people still sign in counts as slipping too.
  const drop = i.revenuePrev30 > 0 ? 1 - i.revenue30 / i.revenuePrev30 : 0;
  if (level === 'healthy' && drop >= 0.5) level = 'slipping';

  if (level === 'never_started' || level === 'new') {
    reasons.push(i.lastActiveAt == null ? `Signed up ${days(age)} ago and hasn't used it yet` : `No sale yet - signed up ${days(age)} ago`);
  } else if (idle == null) {
    reasons.push('No recorded activity');
  } else if (idle >= 1) {
    reasons.push(`No activity in ${days(idle)}`);
  }
  if (drop >= 0.25) reasons.push(`Sales down ${Math.round(drop * 100)}% vs the previous 30 days`);
  if (i.staffCount > 1 && i.activeStaff30 < i.staffCount) reasons.push(`${i.activeStaff30} of ${i.staffCount} staff active this month`);

  const left = i.daysLeft ?? null;
  if (i.state === 'overdue') reasons.push('Subscription payment overdue');
  else if (i.state === 'trial_expired') reasons.push('Trial has ended');
  else if (i.state === 'trial_ending' && left != null) reasons.push(left <= 0 ? 'Trial ends today' : `Trial ends in ${days(left)}`);
  else if (i.state === 'suspended') reasons.push('Account suspended');

  return { level, label: HEALTH_LABELS[level], reasons, urgency: URGENCY[level], daysSinceActive: idle };
}

export function isAttentionHealth(level: HealthLevel): boolean {
  return level === 'slipping' || level === 'at_risk' || level === 'never_started' || level === 'inactive';
}

// Setup funnel: the first thing standing between a new shop and real use.
export const SETUP_STAGES = ['no_products', 'no_prices', 'no_stock', 'no_sale', 'selling'] as const;
export type SetupStage = (typeof SETUP_STAGES)[number];

export const SETUP_STAGE_LABELS: Record<SetupStage, string> = {
  no_products: 'No products',
  no_prices: 'No prices',
  no_stock: 'No stock',
  no_sale: 'No sale yet',
  selling: 'Selling',
};

export function setupStage(i: { products: number; pricedProducts: number; stockedProducts: number; firstSaleAt: string | null }): SetupStage {
  if (i.firstSaleAt) return 'selling';
  if (i.products === 0) return 'no_products';
  if (i.pricedProducts === 0) return 'no_prices';
  if (i.stockedProducts === 0) return 'no_stock';
  return 'no_sale';
}
