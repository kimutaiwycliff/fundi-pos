'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, MapPin, MessageCircle, NotebookPen, Phone, Trash2, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { apiErrorMessage, formatDay, formatDayTime } from './format';
import type { PlatformTenantNote } from './types';

type Kind = PlatformTenantNote['kind'];
const KINDS: { value: Kind; label: string; icon: LucideIcon }[] = [
  { value: 'call', label: 'Call', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'visit', label: 'Visit', icon: MapPin },
  { value: 'note', label: 'Note', icon: NotebookPen },
];
const KIND_ICON = Object.fromEntries(KINDS.map((k) => [k.value, k.icon])) as Record<Kind, LucideIcon>;

// Nairobi calendar date `days` from today, YYYY-MM-DD.
function nairobiDatePlus(days: number): string {
  return new Date(Date.now() + 3 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10);
}

const PRESETS = [
  { label: 'None', days: null },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
] as const;

function authorName(note: PlatformTenantNote): string {
  if (!note.author) return 'Platform';
  if (typeof note.author === 'object') return note.author.name || note.author.email;
  return `admin #${note.author}`;
}

// The operator's contact log for one tenant (platform-tenant-notes):
// what was said, by whom, and when to chase it up. Platform admins only.
export function FollowUpPanel({ tenantId, notes }: { tenantId: number; notes: PlatformTenantNote[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>('call');
  const [body, setBody] = useState('');
  const [followUpOn, setFollowUpOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const today = nairobiDatePlus(0);

  async function handleAdd(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    const response = await fetch('/api/platform/platform-tenant-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant: tenantId, kind, body: body.trim(), followUpOn: followUpOn || null }),
    });
    setSaving(false);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Failed to save the note'));
      return;
    }
    setBody('');
    setFollowUpOn('');
    toast.success(followUpOn ? `Saved - follow up on ${formatDay(`${followUpOn}T09:00:00Z`)}` : 'Saved');
    router.refresh();
  }

  async function handleDelete(id: number) {
    if (deleting != null) return;
    setDeleting(id);
    const response = await fetch(`/api/platform/platform-tenant-notes/${id}`, { method: 'DELETE' });
    setDeleting(null);
    if (!response.ok) {
      toast.error(await apiErrorMessage(response, 'Failed to delete the note'));
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleAdd} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="What kind of contact">
          {KINDS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={kind === value}
              onClick={() => setKind(value)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                kind === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              <Icon className="size-3.5" aria-hidden /> {label}
            </button>
          ))}
        </div>
        <Label htmlFor="follow-up-body" className="sr-only">
          What happened
        </Label>
        <Textarea
          id="follow-up-body"
          rows={3}
          maxLength={2000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="e.g. Spoke to the owner - cashier hasn't been trained on the till yet. Will pay on Friday."
        />
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Follow up</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {PRESETS.map((p) => {
              const value = p.days == null ? '' : nairobiDatePlus(p.days);
              return (
                <Button
                  key={p.label}
                  type="button"
                  size="sm"
                  variant={followUpOn === value ? 'secondary' : 'ghost'}
                  onClick={() => setFollowUpOn(value)}
                >
                  {p.label}
                </Button>
              );
            })}
            <Input
              type="date"
              aria-label="Follow-up date"
              className="h-8 w-auto"
              min={today}
              value={followUpOn}
              onChange={(e) => setFollowUpOn(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Only platform admins can see these.</span>
          <Button type="submit" size="sm" disabled={!body.trim() || saving}>
            {saving ? 'Saving…' : 'Add to log'}
          </Button>
        </div>
      </form>

      {notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contact logged yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {notes.map((note) => {
            const Icon = KIND_ICON[note.kind] ?? NotebookPen;
            const due = note.followUpOn != null && note.followUpOn <= today;
            return (
              <li key={note.id} className="flex gap-3 border-b pb-3 last:border-b-0 last:pb-0">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Icon className="size-3.5" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <p className="text-sm break-words whitespace-pre-wrap">{note.body}</p>
                  <span className="text-xs text-muted-foreground">
                    {authorName(note)} · {formatDayTime(note.createdAt)}
                    {note.followUpOn ? (
                      <span className={cn('ml-1', due && 'font-medium text-red-700 dark:text-red-300')}>
                        · follow up {due ? '(due) ' : ''}
                        {formatDay(`${note.followUpOn}T09:00:00Z`)}
                      </span>
                    ) : null}
                  </span>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7 shrink-0 text-muted-foreground"
                  aria-label="Delete note"
                  disabled={deleting === note.id}
                  onClick={() => handleDelete(note.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
