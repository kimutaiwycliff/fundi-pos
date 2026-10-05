import { Mail, MessageCircle, Phone } from 'lucide-react';
import { buildWhatsAppLink, SUBSCRIPTION_STATE_LABELS } from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { trialEnd } from './billing';
import { formatDay, formatKES } from './format';
import type { PlatformTenantRow } from './types';

// Who to chase for money: the billing contact if one is set, else the owner.
export function billingPhone(row: Pick<PlatformTenantRow, 'billingContact' | 'owner'>): string | null {
  return row.billingContact.phone || row.owner?.phone || null;
}

export function billingEmail(row: Pick<PlatformTenantRow, 'billingContact' | 'owner'>): string | null {
  return row.billingContact.email || row.owner?.email || null;
}

function contactName(row: Pick<PlatformTenantRow, 'billingContact' | 'owner'>): string | null {
  const name = row.billingContact.name || row.owner?.name;
  return name ? name.split(' ')[0] : null;
}

// A polite, specific reminder - mentions the shop, what's due and when, so
// the tenant doesn't have to ask "for what?".
export function reminderMessage(row: PlatformTenantRow): string {
  const hello = contactName(row) ? `Hello ${contactName(row)},` : 'Hello,';
  const amount = row.cyclePrice > 0 ? ` (${formatKES(row.cyclePrice)})` : '';
  const trialEndsOn = formatDay(trialEnd(row));
  let body: string;
  switch (row.state) {
    case 'overdue':
      body = `a friendly reminder that the Fundi POS subscription for ${row.name} was due on ${formatDay(row.paidUntil)}${amount}. Kindly make the payment at your earliest convenience so there's no interruption.`;
      break;
    case 'due_soon':
      body = `a quick heads-up that the Fundi POS subscription for ${row.name} renews on ${formatDay(row.paidUntil)}${amount}.`;
      break;
    case 'trial_ending':
    case 'trial_expired':
    case 'trial':
      body = `thank you for trying Fundi POS at ${row.name}! Your free trial ${row.state === 'trial_expired' ? 'ended' : 'ends'} on ${trialEndsOn}. We'd love to keep you on board - reply here and we'll help you pick a plan.`;
      break;
    case 'never_paid':
      body = `thank you for using Fundi POS at ${row.name}. We haven't received the first subscription payment yet${amount}. Reply here and we'll share the payment details.`;
      break;
    default:
      body = `this is Fundi POS checking in about the ${row.name} account (${SUBSCRIPTION_STATE_LABELS[row.state].toLowerCase()}).`;
  }
  return `${hello} ${body} Thank you! - Fundi POS`;
}

export function ContactButtons({ row, size = 'sm' }: { row: PlatformTenantRow; size?: 'sm' | 'xs' }) {
  const phone = billingPhone(row);
  const email = billingEmail(row);
  const whatsapp = phone ? buildWhatsAppLink(phone, reminderMessage(row)) : null;
  const iconSize = size === 'xs' ? 'icon-xs' : 'icon-sm';

  if (!phone && !email) return <span className="text-xs text-muted-foreground">No contact on file</span>;

  return (
    <div className="flex items-center gap-1">
      {phone ? (
        <Button asChild variant="outline" size={iconSize}>
          <a href={`tel:${phone.replace(/\s+/g, '')}`} aria-label={`Call ${row.name} on ${phone}`} title={`Call ${phone}`}>
            <Phone />
          </a>
        </Button>
      ) : null}
      {whatsapp ? (
        <Button asChild variant="outline" size={iconSize}>
          <a href={whatsapp} target="_blank" rel="noreferrer" aria-label={`Send ${row.name} a WhatsApp reminder`} title="WhatsApp reminder">
            <MessageCircle />
          </a>
        </Button>
      ) : null}
      {email ? (
        <Button asChild variant="outline" size={iconSize}>
          <a href={`mailto:${email}`} aria-label={`Email ${row.name} at ${email}`} title={email}>
            <Mail />
          </a>
        </Button>
      ) : null}
    </div>
  );
}
