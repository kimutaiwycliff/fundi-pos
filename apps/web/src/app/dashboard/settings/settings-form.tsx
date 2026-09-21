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

interface Tenant {
  id: number;
  name: string;
  receiptHeader: string | null;
  receiptFooter: string | null;
  shiftsRequired: boolean | null;
  enforceDiscountCaps: boolean | null;
}

export function SettingsForm({ tenant }: { tenant: Tenant }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: tenant.name,
    receiptHeader: tenant.receiptHeader ?? '',
    receiptFooter: tenant.receiptFooter ?? '',
    shiftsRequired: tenant.shiftsRequired !== false,
    enforceDiscountCaps: tenant.enforceDiscountCaps !== false,
  });
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

      <Button type="submit" disabled={loading} className="w-fit">
        {loading ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
