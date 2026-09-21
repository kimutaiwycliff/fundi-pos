'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Same `?status=` URL-driven pattern as dashboard/products/status-filter.tsx -
// a soft-deleted tenant previously stayed in the default list forever
// despite the delete dialog's own copy claiming otherwise. Suspended
// tenants still show by default (locked out, not gone - an admin still
// needs to see/reactivate them); only "deleted" is hidden by default.
export function TenantStatusFilter() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get('status') ?? 'active';

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === 'active') {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <Select value={current} onValueChange={handleChange}>
      <SelectTrigger className="w-44">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active &amp; suspended</SelectItem>
        <SelectItem value="deleted">Deleted</SelectItem>
      </SelectContent>
    </Select>
  );
}
