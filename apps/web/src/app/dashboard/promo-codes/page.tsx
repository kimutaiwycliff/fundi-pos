import { notFound } from 'next/navigation';
import { TicketPercent } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/empty-state';
import { payloadFetch } from '@/lib/payload-client';
import { getCurrentUser } from '@/lib/current-user';
import { hasAddon } from '@hardware-pos/business-logic';
import { PromoCodeDialog } from './promo-code-dialog';
import { CopyShareTextButton, PromoActiveSwitch } from './promo-row-actions';
import {
  describeConditions,
  describeDiscount,
  promoStatus,
  referrerName,
  shareText,
  type CustomerOption,
  type PromoCode,
  type PromoStatus,
} from './promo-format';

const STATUS_VARIANT: Record<PromoStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  Active: 'default',
  Scheduled: 'outline',
  Expired: 'secondary',
  'Used up': 'secondary',
  Inactive: 'destructive',
};

export default async function PromoCodesPage() {
  const me = await getCurrentUser();
  const canManage = me.role === 'owner' || me.role === 'manager';
  const shopName = typeof me.tenant === 'object' ? me.tenant.name : null;

  // Without the add-on this page doesn't exist as far as the shop can tell -
  // a plain 404, no upsell. Existing codes are kept untouched for if it's
  // switched back on.
  if (typeof me.tenant !== 'object' || !hasAddon(me.tenant, 'sell_online')) notFound();

  const [{ docs: promos }, customers] = await Promise.all([
    payloadFetch<{ docs: PromoCode[] }>('/api/promo-codes?limit=200&sort=-createdAt&depth=1'),
    // Only the manager/owner form needs the referrer picker.
    canManage
      ? payloadFetch<{ docs: CustomerOption[] }>('/api/customers?limit=2000&sort=name&depth=0').then((r) =>
          r.docs.map((c) => ({ id: c.id, name: c.name, phone: c.phone ?? null })),
        )
      : Promise.resolve([] as CustomerOption[]),
  ]);

  const now = new Date();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">Promo codes</h1>
          <p className="text-sm text-muted-foreground">
            Codes are applied at checkout on every till. The discount is checked and calculated by the server, so it
            can&apos;t be tampered with.
          </p>
        </div>
        {canManage ? <PromoCodeDialog customers={customers} /> : null}
      </div>

      {promos.length === 0 ? (
        <div className="rounded-md border">
          <EmptyState
            icon={TicketPercent}
            title="No promo codes yet"
            description={
              canManage
                ? 'Create a code for a campaign (BLACKFRIDAY), an influencer (JANE10) or a loyal customer to share with friends - they earn points every time it is used.'
                : 'Your manager can create codes for campaigns, influencers and referrals. They will show up here.'
            }
          />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead className="hidden md:table-cell">Label</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="hidden lg:table-cell">Conditions</TableHead>
                <TableHead className="text-right">Uses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Referrer</TableHead>
                {canManage ? <TableHead>On</TableHead> : null}
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {promos.map((promo) => {
                const status = promoStatus(promo, now);
                const conditions = describeConditions(promo);
                const referrer = referrerName(promo);
                const uses = promo.usesCount ?? 0;
                return (
                  <TableRow key={promo.id}>
                    <TableCell className="font-mono font-medium">{promo.code}</TableCell>
                    <TableCell className="hidden md:table-cell">{promo.label || '—'}</TableCell>
                    <TableCell>{describeDiscount(promo)}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                      {conditions.length > 0 ? conditions.map((c) => <div key={c}>{c}</div>) : 'None'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {promo.maxUses && promo.maxUses > 0 ? `${uses} / ${promo.maxUses}` : uses}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {referrer ? (
                        <span>
                          {referrer}
                          {promo.referrerRewardPoints ? (
                            <span className="text-xs text-muted-foreground"> · {promo.referrerRewardPoints} pts/use</span>
                          ) : null}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    {canManage ? (
                      <TableCell>
                        <PromoActiveSwitch id={promo.id} code={promo.code} active={promo.active !== false} />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <CopyShareTextButton text={shareText(promo, shopName)} />
                        {canManage ? <PromoCodeDialog promo={promo} customers={customers} /> : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
