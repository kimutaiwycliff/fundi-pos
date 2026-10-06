'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';
import { receiptFooterWithMarketing } from '@hardware-pos/business-logic';
import { OnlineShopSettings } from './online-shop-settings';

interface Tenant {
  id: number;
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  shiftsRequired: boolean | null;
  enforceDiscountCaps: boolean | null;
  whatsappNumber?: string | null;
  socialHandles?: string | null;
  googleReviewUrl?: string | null;
  loyaltyPointValue?: number | null;
  shopSlug?: string | null;
  storefrontEnabled?: boolean | null;
  storefrontListAll?: boolean | null;
  storefrontTagline?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  // Populated media doc (default depth) or a bare id.
  seoImage?: { id: number; url?: string | null } | number | null;
  storefrontCity?: string | null;
  storefrontIndexable?: boolean | null;
  googleSiteVerification?: string | null;
  deliveryZones?: Array<{ name: string; fee: number; eta?: string | null }> | null;
  freeDeliveryThreshold?: number | null;
  payOnDelivery?: boolean | null;
  sameDayCutoff?: string | null;
  sameDayArea?: string | null;
}

export function SettingsForm({ tenant, sellOnline, siteUrl }: { tenant: Tenant; sellOnline: boolean; siteUrl: string }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: tenant.name,
    receiptHeader: tenant.receiptHeader ?? '',
    receiptFooter: tenant.receiptFooter ?? '',
    shiftsRequired: tenant.shiftsRequired !== false,
    enforceDiscountCaps: tenant.enforceDiscountCaps !== false,
    whatsappNumber: tenant.whatsappNumber ?? '',
    socialHandles: tenant.socialHandles ?? '',
    googleReviewUrl: tenant.googleReviewUrl ?? '',
    loyaltyPointValue: String(tenant.loyaltyPointValue ?? 1),
    shopSlug: tenant.shopSlug ?? '',
    storefrontEnabled: tenant.storefrontEnabled === true,
    storefrontListAll: tenant.storefrontListAll === true,
    storefrontTagline: tenant.storefrontTagline ?? '',
    seoTitle: tenant.seoTitle ?? '',
    seoDescription: tenant.seoDescription ?? '',
    seoImageId: typeof tenant.seoImage === 'object' && tenant.seoImage ? tenant.seoImage.id : (tenant.seoImage ?? null),
    seoImageUrl: typeof tenant.seoImage === 'object' && tenant.seoImage ? (tenant.seoImage.url ?? null) : null,
    storefrontCity: tenant.storefrontCity ?? '',
    storefrontIndexable: tenant.storefrontIndexable !== false,
    googleSiteVerification: tenant.googleSiteVerification ?? '',
    deliveryZones: (tenant.deliveryZones ?? []).map((z) => ({ name: z.name, fee: String(z.fee ?? ''), eta: z.eta ?? '' })),
    freeDeliveryThreshold: tenant.freeDeliveryThreshold ? String(tenant.freeDeliveryThreshold) : '',
    payOnDelivery: tenant.payOnDelivery === true,
    sameDayCutoff: tenant.sameDayCutoff ?? '',
    sameDayArea: tenant.sameDayArea ?? '',
  });
  const footerPreview = receiptFooterWithMarketing(form.receiptFooter, form);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await clientFetch(`/api/payload/tenants/${tenant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          receiptHeader: form.receiptHeader || null,
          receiptFooter: form.receiptFooter || null,
          shiftsRequired: form.shiftsRequired,
          enforceDiscountCaps: form.enforceDiscountCaps,
          whatsappNumber: form.whatsappNumber.trim() || null,
          socialHandles: form.socialHandles.trim() || null,
          googleReviewUrl: form.googleReviewUrl.trim() || null,
          loyaltyPointValue: Math.max(0, Number(form.loyaltyPointValue) || 0),
          // Storefront fields only travel when the add-on is on, so an owner
          // without it can't half-configure a shop they can't publish.
          ...(sellOnline
            ? {
                shopSlug: form.shopSlug.trim() || null,
                storefrontEnabled: form.storefrontEnabled,
                storefrontListAll: form.storefrontListAll,
                storefrontTagline: form.storefrontTagline.trim() || null,
                seoTitle: form.seoTitle.trim() || null,
                seoDescription: form.seoDescription.trim() || null,
                seoImage: form.seoImageId,
                storefrontCity: form.storefrontCity.trim() || null,
                storefrontIndexable: form.storefrontIndexable,
                googleSiteVerification: form.googleSiteVerification.trim(),
                // Rows without a name are treated as unfinished and dropped.
                deliveryZones: form.deliveryZones
                  .filter((z) => z.name.trim())
                  .map((z) => ({ name: z.name.trim(), fee: Math.max(0, Number(z.fee) || 0), eta: z.eta.trim() || null })),
                freeDeliveryThreshold: Number(form.freeDeliveryThreshold) > 0 ? Number(form.freeDeliveryThreshold) : null,
                payOnDelivery: form.payOnDelivery,
                sameDayCutoff: form.sameDayCutoff.trim(),
                sameDayArea: form.sameDayArea.trim() || null,
              }
            : {}),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        toast.error(errorMessageFrom(body, 'Failed to save settings'));
        return;
      }

      toast.success('Settings saved');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardDescription>Business identity</CardDescription>
          <CardTitle className="text-base font-medium">Shown across the dashboard and the till</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="name">Business name</Label>
            <Input id="name" required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Receipt</CardDescription>
          <CardTitle className="text-base font-medium">Printed on every till receipt, once synced to the device</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receiptHeader">Header (below the business name)</Label>
            <Textarea
              id="receiptHeader"
              placeholder="e.g. Westlands, Nairobi &#10;0700 000 000"
              rows={2}
              value={form.receiptHeader}
              onChange={(e) => setForm((f) => ({ ...f, receiptHeader: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="receiptFooter">Footer (bottom of the receipt)</Label>
            <Textarea
              id="receiptFooter"
              placeholder="e.g. Thank you for your business!"
              rows={2}
              value={form.receiptFooter}
              onChange={(e) => setForm((f) => ({ ...f, receiptFooter: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Sales</CardDescription>
          <CardTitle className="text-base font-medium">Shift requirement</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="shiftsRequired" className="flex flex-col items-start gap-1 font-normal">
              <span className="font-medium">Require an open shift before selling</span>
              <span className="text-sm text-muted-foreground">
                When off, staff on web, Android, and desktop can complete a sale without opening a shift first.
              </span>
            </Label>
            <Switch
              id="shiftsRequired"
              checked={form.shiftsRequired}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, shiftsRequired: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Sales</CardDescription>
          <CardTitle className="text-base font-medium">Discount limit</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="enforceDiscountCaps" className="flex flex-col items-start gap-1 font-normal">
              <span className="font-medium">Limit staff to each product&apos;s max discount</span>
              <span className="text-sm text-muted-foreground">
                Owners are never limited by this. When off, staff can discount freely too - a sale still can never
                go below a product&apos;s cost.
              </span>
            </Label>
            <Switch
              id="enforceDiscountCaps"
              checked={form.enforceDiscountCaps}
              onCheckedChange={(checked) => setForm((f) => ({ ...f, enforceDiscountCaps: checked }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardDescription>Marketing</CardDescription>
          <CardTitle className="text-base font-medium">Turn every receipt into a little advert</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="whatsappNumber">WhatsApp number customers order on</Label>
              <Input
                id="whatsappNumber"
                inputMode="tel"
                placeholder="0712 345 678"
                value={form.whatsappNumber}
                onChange={(e) => setForm((f) => ({ ...f, whatsappNumber: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="socialHandles">Social handles</Label>
              <Input
                id="socialHandles"
                placeholder="IG/TikTok @yourshop.ke"
                value={form.socialHandles}
                onChange={(e) => setForm((f) => ({ ...f, socialHandles: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="googleReviewUrl">Google review link</Label>
              <Input
                id="googleReviewUrl"
                placeholder="https://g.page/r/…/review"
                value={form.googleReviewUrl}
                onChange={(e) => setForm((f) => ({ ...f, googleReviewUrl: e.target.value }))}
              />
            </div>
          </div>
          {footerPreview ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm text-muted-foreground">Receipt footer preview</span>
              <pre className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-center font-mono text-xs">{footerPreview}</pre>
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="loyaltyPointValue">Loyalty point value (KES)</Label>
            <Input
              id="loyaltyPointValue"
              type="number"
              min={0}
              step={0.5}
              value={form.loyaltyPointValue}
              onChange={(e) => setForm((f) => ({ ...f, loyaltyPointValue: e.target.value }))}
            />
            <span className="text-sm text-muted-foreground">
              Customers earn 1 point per KES 100 and can spend points at the till. 1 = 1% back. Set 0 to turn
              redemption off.
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Sell Online add-on only - without it this section simply isn't there. */}
      {sellOnline ? (
        <OnlineShopSettings
          form={form}
          setForm={setForm}
          siteUrl={siteUrl}
          savedSlug={tenant.shopSlug ?? null}
          savedEnabled={tenant.storefrontEnabled === true}
        />
      ) : null}

      <Button type="submit" disabled={loading} className="w-fit">
        {loading ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
