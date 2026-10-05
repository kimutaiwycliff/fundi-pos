import { platformFetch } from '@/lib/platform-client';
import { toPayable } from '@/components/platform/billing';
import { formatKES } from '@/components/platform/format';
import { PaymentsLedger } from '@/components/platform/payments-ledger';
import type { PlatformStats, SubscriptionPayment } from '@/components/platform/types';

export const metadata = { title: 'Payments · Platform' };

export default async function PlatformPaymentsPage() {
  const [{ docs: payments }, stats] = await Promise.all([
    // depth=1 populates the tenant (so payments of deleted tenants still
    // show a name) and recordedBy.
    platformFetch<{ docs: SubscriptionPayment[] }>('/api/subscription-payments?sort=-paidAt&depth=1&limit=2000'),
    platformFetch<PlatformStats>('/api/platform-stats'),
  ]);
  const tenantNames = Object.fromEntries(stats.tenants.map((t) => [t.id, t.name]));
  const payable = [...stats.tenants].sort((a, b) => a.name.localeCompare(b.name)).map(toPayable);
  const thisMonth = stats.summary.collectedThisMonth;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Payments</h1>
        <p className="text-sm text-muted-foreground">
          Every subscription payment recorded · {payments.length} total
          {thisMonth > 0 ? ` · ${formatKES(thisMonth)} this month` : ''}
        </p>
      </div>
      <PaymentsLedger payments={payments} tenantNames={tenantNames} payable={payable} />
    </div>
  );
}
