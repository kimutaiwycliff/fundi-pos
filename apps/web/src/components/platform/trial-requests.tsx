'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiErrorMessage, formatDay } from './format';
import type { TrialExtensionRequest } from './types';

function requesterName(r: TrialExtensionRequest): string {
  if (!r.requestedBy) return 'the shop';
  if (typeof r.requestedBy === 'object') return r.requestedBy.name || r.requestedBy.email;
  return `user #${r.requestedBy}`;
}

// The shop's "can I have more time?" requests. Approving moves the trial
// end (from today or the current end, whichever is later) and lifts an
// automatic lockout; both outcomes email the owner.
export function TrialRequests({ requests }: { requests: TrialExtensionRequest[] }) {
  return (
    <ul className="flex flex-col divide-y">
      {requests.map((r) => (
        <TrialRequestRow key={r.id} request={r} />
      ))}
    </ul>
  );
}

function TrialRequestRow({ request }: { request: TrialExtensionRequest }) {
  const router = useRouter();
  const [days, setDays] = useState('7');
  const [busy, setBusy] = useState(false);

  async function decide(status: 'approved' | 'declined') {
    setBusy(true);
    const response = await fetch(`/api/platform/trial-extension-requests/${request.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(status === 'approved' ? { status, daysGranted: Number(days) } : { status }),
    });
    setBusy(false);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Could not update the request'));
      return;
    }
    toast.success(status === 'approved' ? `Trial extended by ${days} days - the shop has been emailed` : 'Request declined - the shop has been emailed');
    router.refresh();
  }

  const pending = request.status === 'pending';
  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm">
          {requesterName(request)} asked on {formatDay(request.createdAt)}
        </span>
        {!pending ? (
          <span className="text-xs text-muted-foreground">
            {request.status === 'approved'
              ? `Approved +${request.daysGranted} days${request.newTrialEndsAt ? ` (to ${formatDay(request.newTrialEndsAt)})` : ''}`
              : 'Declined'}
            {request.decidedAt ? ` · ${formatDay(request.decidedAt)}` : ''}
          </span>
        ) : null}
      </div>
      {request.message ? <p className="text-sm text-muted-foreground italic">&ldquo;{request.message}&rdquo;</p> : null}
      {pending ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={90}
            aria-label="Days to add"
            className="h-8 w-20"
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <span className="text-sm text-muted-foreground">days</span>
          <Button size="sm" disabled={busy || !(Number(days) >= 1 && Number(days) <= 90)} onClick={() => decide('approved')}>
            Approve
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('declined')}>
            Decline
          </Button>
        </div>
      ) : null}
    </li>
  );
}
