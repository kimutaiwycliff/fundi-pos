import { AlertTriangle } from 'lucide-react';
import { daysUntil, type TenantAccess } from '@hardware-pos/business-logic';
import { supportWhatsAppLink } from '@/lib/support';

function formatDay(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Nairobi' });
}

// Shown across the dashboard while a tenant's trial or paid period is
// running out or has lapsed but is still inside the grace period - the
// warning before tenantAccess() locks them out (see the layout's gate).
export function BillingBanner({
  access,
  tenantName,
  paidUntil,
  billingStatus,
}: {
  access: TenantAccess;
  tenantName: string;
  paidUntil?: string | null;
  billingStatus?: string | null;
}) {
  const lockDay = access.lockAt ? formatDay(access.lockAt) : null;
  let text: string | null = null;
  switch (access.state) {
    case 'trial_ending': {
      const left = access.lockAt ? daysUntil(access.lockAt.toISOString()) : null;
      text = `Your free trial is ending soon${left != null ? ` - access pauses in ${left} days` : ''} unless you subscribe.`;
      break;
    }
    case 'trial_expired':
      text = `Your free trial has ended. Access pauses on ${lockDay} unless you subscribe.`;
      break;
    case 'due_soon':
      text = paidUntil ? `Your subscription is paid until ${formatDay(paidUntil)}. Renew to avoid interruption.` : null;
      break;
    case 'overdue':
      text = `Your subscription payment is overdue. Access pauses on ${lockDay} unless you pay.`;
      break;
    default:
      // Operator-set past_due with no date-driven lapse to explain it.
      if (billingStatus === 'past_due') text = 'Your subscription payment is past due. Please pay to avoid service interruption.';
  }
  if (!text) return null;

  const urgent = access.state === 'trial_expired' || access.state === 'overdue' || billingStatus === 'past_due';
  const href = supportWhatsAppLink(`Hi Fundi POS, I'd like to pay for ${tenantName}'s subscription.`);
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-2 text-sm ${
        urgent ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-800 dark:text-amber-300'
      }`}
    >
      <AlertTriangle className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{text}</span>
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
        Pay via WhatsApp
      </a>
    </div>
  );
}
