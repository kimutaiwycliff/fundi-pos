'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImageIcon } from 'lucide-react';
import { normalizeShopSlug } from '@hardware-pos/business-logic';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { clientFetch, errorMessageFrom } from '@/lib/client-fetch';

export interface OnlineShopForm {
  name: string;
  whatsappNumber: string;
  shopSlug: string;
  storefrontEnabled: boolean;
  storefrontListAll: boolean;
  storefrontTagline: string;
  seoTitle: string;
  seoDescription: string;
  seoImageId: number | null;
  seoImageUrl: string | null;
  storefrontCity: string;
  storefrontIndexable: boolean;
  googleSiteVerification: string;
  deliveryZones: Array<{ name: string; fee: string; eta: string }>;
  freeDeliveryThreshold: string;
  payOnDelivery: boolean;
  sameDayCutoff: string;
  sameDayArea: string;
}

const TITLE_LIMIT = 60;
const DESCRIPTION_LIMIT = 155;

function Counter({ value, limit }: { value: string; limit: number }) {
  const over = value.length > limit;
  return (
    <span className={over ? 'text-xs text-amber-600 dark:text-amber-400' : 'text-xs text-muted-foreground'}>
      {value.length}/{limit}
      {over ? ' - Google may cut this off' : ''}
    </span>
  );
}

// Sell Online add-on only - settings-form.tsx doesn't render this at all
// without it, so a shop without the add-on never sees any of it.
export function OnlineShopSettings<T extends OnlineShopForm>({
  form,
  setForm,
  siteUrl,
  savedSlug,
  savedEnabled,
}: {
  form: T;
  setForm: React.Dispatch<React.SetStateAction<T>>;
  siteUrl: string;
  savedSlug: string | null;
  savedEnabled: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shopUrl = savedSlug ? `${siteUrl}/shop/${savedSlug}` : null;
  const previewSlug = normalizeShopSlug(form.shopSlug);
  // Mirrors the fallbacks in components/storefront/storefront-data.ts.
  const where = form.storefrontCity.trim() ? ` in ${form.storefrontCity.trim()}` : '';
  const previewTitle =
    form.seoTitle.trim() || `${form.name}${where} — ${form.storefrontTagline.trim() || 'Shop online'}`;
  const previewDescription =
    form.seoDescription.trim() ||
    `${form.storefrontTagline.trim() ? `${form.storefrontTagline.trim()}. ` : ''}Shop ${form.name}${where} online — order on WhatsApp in a tap.`;

  function update<K extends keyof OnlineShopForm>(key: K, value: OnlineShopForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateZone(index: number, patch: Partial<OnlineShopForm['deliveryZones'][number]>) {
    setForm((f) => ({ ...f, deliveryZones: f.deliveryZones.map((z, i) => (i === index ? { ...z, ...patch } : z)) }));
  }

  async function uploadShareImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await clientFetch('/api/media', { method: 'POST', body: formData });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        toast.error(errorMessageFrom(body, 'Failed to upload image'));
        return;
      }
      setForm((f) => ({ ...f, seoImageId: body.doc.id, seoImageUrl: body.doc.url }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function copy(text: string, message: string) {
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(message))
      .catch(() => toast.error('Could not copy'));
  }

  return (
    <Card>
      <CardHeader>
        <CardDescription>Online shop</CardDescription>
        <CardTitle className="text-base font-medium">Your public catalog with &quot;Order on WhatsApp&quot; buttons</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="storefrontEnabled" className="flex flex-col items-start gap-1 font-normal">
              <span className="font-medium">Shop is open</span>
              <span className="text-sm text-muted-foreground">
                Only products you tick &quot;Show in online shop&quot; appear. Prices only - never cost or stock counts.
              </span>
            </Label>
            <Switch
              id="storefrontEnabled"
              checked={form.storefrontEnabled}
              onCheckedChange={(checked) => update('storefrontEnabled', checked)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="storefrontListAll" className="flex flex-col items-start gap-1 font-normal">
              <span className="font-medium">List all products automatically</span>
              <span className="text-sm text-muted-foreground">
                Every active product appears online, including new ones. Hide any you want to keep offline from the
                Products page. When off, only products you switch on appear.
              </span>
            </Label>
            <Switch
              id="storefrontListAll"
              checked={form.storefrontListAll}
              onCheckedChange={(checked) => update('storefrontListAll', checked)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="shopSlug">Shop address</Label>
              <Input
                id="shopSlug"
                placeholder="mama-baby-boutique"
                value={form.shopSlug}
                onChange={(e) => update('shopSlug', e.target.value)}
              />
              <span className="text-xs break-all text-muted-foreground">
                {siteUrl}/shop/{previewSlug ?? '…'}
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="storefrontTagline">Tagline</Label>
              <Input
                id="storefrontTagline"
                placeholder="Beautiful baby outfits · Countrywide delivery"
                value={form.storefrontTagline}
                onChange={(e) => update('storefrontTagline', e.target.value)}
              />
            </div>
          </div>
          {shopUrl && savedEnabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={shopUrl} target="_blank" rel="noreferrer">
                  Open shop
                </a>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => copy(shopUrl, 'Shop link copied - paste it in your bios and WhatsApp Status')}
              >
                Copy link
              </Button>
            </div>
          ) : null}
          {!form.whatsappNumber ? (
            <p className="text-sm text-amber-600 dark:text-amber-400">
              Add your WhatsApp number above so the shop&apos;s order buttons work.
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 border-t pt-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">Delivery &amp; payment</h3>
            <p className="text-sm text-muted-foreground">
              Shown to shoppers before they message you, and added to their WhatsApp order. Leave anything blank to hide
              it.
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Delivery areas and fees</Label>
            {form.deliveryZones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No delivery areas yet - orders show &quot;total before delivery&quot;.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {form.deliveryZones.map((zone, index) => (
                  <div key={index} className="grid grid-cols-[1fr_6rem_auto] gap-2 sm:grid-cols-[1fr_7rem_9rem_auto]">
                    <Input
                      aria-label={`Area ${index + 1} name`}
                      placeholder="e.g. Nairobi CBD"
                      value={zone.name}
                      onChange={(e) => updateZone(index, { name: e.target.value })}
                    />
                    <Input
                      aria-label={`Area ${index + 1} fee (KES)`}
                      type="number"
                      min={0}
                      placeholder="KES"
                      value={zone.fee}
                      onChange={(e) => updateZone(index, { fee: e.target.value })}
                    />
                    <Input
                      aria-label={`Area ${index + 1} delivery time`}
                      placeholder="e.g. Same day"
                      value={zone.eta}
                      onChange={(e) => updateZone(index, { eta: e.target.value })}
                      className="col-span-2 sm:col-span-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((f) => ({ ...f, deliveryZones: f.deliveryZones.filter((_, i) => i !== index) }))}
                      className="row-start-1 col-start-3 sm:col-start-4"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={form.deliveryZones.length >= 20}
              onClick={() => setForm((f) => ({ ...f, deliveryZones: [...f.deliveryZones, { name: '', fee: '', eta: '' }] }))}
            >
              Add delivery area
            </Button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="freeDeliveryThreshold">Free delivery over (KES)</Label>
              <Input
                id="freeDeliveryThreshold"
                type="number"
                min={0}
                placeholder="e.g. 5000"
                value={form.freeDeliveryThreshold}
                onChange={(e) => update('freeDeliveryThreshold', e.target.value)}
              />
              <span className="text-xs text-muted-foreground">Shoppers see a progress bar towards it in their bag.</span>
            </div>
            <div className="flex items-center justify-between gap-4 sm:pt-6">
              <Label htmlFor="payOnDelivery" className="flex flex-col items-start gap-1 font-normal">
                <span className="font-medium">Pay on delivery available</span>
                <span className="text-sm text-muted-foreground">Shoppers can choose it in the bag.</span>
              </Label>
              <Switch id="payOnDelivery" checked={form.payOnDelivery} onCheckedChange={(checked) => update('payOnDelivery', checked)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sameDayCutoff">Same-day delivery order cutoff</Label>
              <Input id="sameDayCutoff" type="time" value={form.sameDayCutoff} onChange={(e) => update('sameDayCutoff', e.target.value)} />
              <span className="text-xs text-muted-foreground">e.g. 16:00 shows &quot;Order by 4pm for same-day delivery&quot;.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sameDayArea">Same-day delivery area</Label>
              <Input
                id="sameDayArea"
                placeholder="e.g. Nairobi"
                value={form.sameDayArea}
                onChange={(e) => update('sameDayArea', e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t pt-5">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold">Search engines (SEO)</h3>
            <p className="text-sm text-muted-foreground">
              How your shop appears on Google and when the link is shared. Leave blank to use your shop name, town and
              tagline.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label htmlFor="storefrontIndexable" className="flex flex-col items-start gap-1 font-normal">
              <span className="font-medium">Show my shop on Google</span>
              <span className="text-sm text-muted-foreground">
                Turn off to keep the shop link-only (customers with the link can still order).
              </span>
            </Label>
            <Switch
              id="storefrontIndexable"
              checked={form.storefrontIndexable}
              onCheckedChange={(checked) => update('storefrontIndexable', checked)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="seoTitle">Search title</Label>
              <Counter value={form.seoTitle} limit={TITLE_LIMIT} />
            </div>
            <Input
              id="seoTitle"
              placeholder="e.g. Baby Clothes & Newborn Gifts in Westlands, Nairobi"
              value={form.seoTitle}
              onChange={(e) => update('seoTitle', e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="seoDescription">Search description</Label>
              <Counter value={form.seoDescription} limit={DESCRIPTION_LIMIT} />
            </div>
            <Textarea
              id="seoDescription"
              rows={3}
              placeholder="e.g. Shop newborn sets, baby shower hampers and kids' outfits from KES 800. Countrywide delivery, pay with M-Pesa. Order on WhatsApp."
              value={form.seoDescription}
              onChange={(e) => update('seoDescription', e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="storefrontCity">Town / area</Label>
              <Input
                id="storefrontCity"
                placeholder="Westlands, Nairobi"
                value={form.storefrontCity}
                onChange={(e) => update('storefrontCity', e.target.value)}
              />
              <span className="text-xs text-muted-foreground">Helps you show up for &quot;baby shop near me&quot; searches.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Share image</Label>
              <div className="flex items-center gap-3">
                {form.seoImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.seoImageUrl} alt="" className="size-12 shrink-0 rounded-md border object-cover" />
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground">
                    <ImageIcon className="size-5" />
                  </div>
                )}
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={uploadShareImage} />
                <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? 'Uploading…' : form.seoImageUrl ? 'Change' : 'Upload'}
                </Button>
                {form.seoImageUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setForm((f) => ({ ...f, seoImageId: null, seoImageUrl: null }))}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <span className="text-xs text-muted-foreground">
                Shown on WhatsApp/Facebook link previews. 1200×630 works best. Defaults to your first product photo.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm text-muted-foreground">Google preview</span>
            <div className="rounded-md border bg-background p-3">
              <p className="truncate text-xs text-muted-foreground">
                {siteUrl.replace(/^https?:\/\//, '')} › shop › {previewSlug ?? '…'}
              </p>
              <p className="truncate text-base text-blue-700 dark:text-blue-400">{previewTitle}</p>
              <p className="line-clamp-2 text-sm text-muted-foreground">{previewDescription}</p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="googleSiteVerification">Google Search Console verification</Label>
            <Input
              id="googleSiteVerification"
              placeholder='Paste the code or the whole <meta name="google-site-verification" ...> tag'
              value={form.googleSiteVerification}
              onChange={(e) => update('googleSiteVerification', e.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              In Search Console, add a <strong>URL prefix</strong> property for your shop address, choose{' '}
              <strong>HTML tag</strong>, paste it here, save, then click Verify.
            </span>
            {shopUrl && savedEnabled ? (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <code className="rounded bg-muted px-2 py-1 text-xs break-all">{shopUrl}/sitemap.xml</code>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => copy(`${shopUrl}/sitemap.xml`, 'Sitemap link copied - submit it in Search Console → Sitemaps')}
                >
                  Copy sitemap link
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
