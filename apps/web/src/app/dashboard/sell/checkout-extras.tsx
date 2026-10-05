'use client';

import { useState } from 'react';
import {
  normalizePromoCode,
  SALES_CHANNEL_LABELS,
  SALES_CHANNELS,
  type PromoEvaluation,
  type PromoRule,
  type SalesChannel,
} from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { clientFetch } from '@/lib/client-fetch';

// The marketing bits of checkout: where the sale came from (every plan),
// redeeming loyalty points (every plan) and a promo code (Sell Online
// add-on). Everything here is a preview - Orders.ts re-checks and re-prices
// all of it server-side when the sale is created.
export function CheckoutExtras({
  channel,
  onChannelChange,
  promoEnabled,
  promoRule,
  promoEvaluation,
  onPromoRuleChange,
  customerPoints,
  pointValue,
  redeemPoints,
  maxRedeemablePoints,
  onRedeemPointsChange,
}: {
  channel: SalesChannel;
  onChannelChange: (channel: SalesChannel) => void;
  promoEnabled: boolean;
  promoRule: PromoRule | null;
  promoEvaluation: PromoEvaluation | null;
  onPromoRuleChange: (rule: PromoRule | null) => void;
  customerPoints: number;
  pointValue: number;
  redeemPoints: boolean;
  maxRedeemablePoints: number;
  onRedeemPointsChange: (on: boolean) => void;
}) {
  const [codeInput, setCodeInput] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  async function applyCode() {
    const code = normalizePromoCode(codeInput);
    if (!code) return;
    setLooking(true);
    setLookupError(null);
    try {
      const response = await clientFetch(
        `/api/payload/promo-codes?where[code][equals]=${encodeURIComponent(code)}&limit=1&depth=0`,
      );
      const body = (await response.json().catch(() => null)) as { docs?: PromoRule[] } | null;
      const rule = response.ok ? body?.docs?.[0] : undefined;
      if (!rule) {
        setLookupError(`Promo code ${code} doesn't exist.`);
        return;
      }
      onPromoRuleChange(rule);
      setCodeInput('');
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : String(err));
    } finally {
      setLooking(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="sale-channel" className="text-sm">
          Sale from
        </Label>
        <Select value={channel} onValueChange={(v) => onChannelChange(v as SalesChannel)}>
          <SelectTrigger id="sale-channel" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SALES_CHANNELS.map((value) => (
              <SelectItem key={value} value={value}>
                {SALES_CHANNEL_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {customerPoints > 0 && pointValue > 0 ? (
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="redeem-points" className="flex flex-col items-start gap-0.5 text-sm font-normal">
            <span className="font-medium">Redeem loyalty points</span>
            <span className="text-xs text-muted-foreground">
              {maxRedeemablePoints > 0
                ? `Use ${maxRedeemablePoints} of ${customerPoints} pts = KES ${(maxRedeemablePoints * pointValue).toFixed(2)}`
                : `${customerPoints} pts available`}
            </span>
          </Label>
          <Switch
            id="redeem-points"
            checked={redeemPoints && maxRedeemablePoints > 0}
            disabled={maxRedeemablePoints === 0}
            onCheckedChange={onRedeemPointsChange}
          />
        </div>
      ) : null}

      {promoEnabled ? (
        promoRule ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0">
              Promo <strong className="font-mono">{promoRule.code}</strong>
              {promoEvaluation?.ok ? (
                <span className="text-emerald-600 dark:text-emerald-400"> −{promoEvaluation.discount.toFixed(2)}</span>
              ) : (
                <span className="block text-xs text-destructive">{promoEvaluation?.reason}</span>
              )}
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={() => onPromoRuleChange(null)}>
              Remove
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <div className="flex gap-2">
              <Input
                placeholder="Promo code"
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value);
                  setLookupError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void applyCode();
                  }
                }}
                className="uppercase"
              />
              <Button type="button" variant="secondary" disabled={looking || !codeInput.trim()} onClick={applyCode}>
                {looking ? '…' : 'Apply'}
              </Button>
            </div>
            {lookupError ? <span className="text-xs text-destructive">{lookupError}</span> : null}
          </div>
        )
      ) : null}
    </div>
  );
}
