import { nairobiDateToUTC } from '@/lib/format-date';

// Formatting for the /platform console. Locale + timeZone are always pinned
// (see lib/format-date.ts for why) so server and client render identically.
const TIME_ZONE = 'Africa/Nairobi';
const NAIROBI_OFFSET_MS = 3 * 60 * 60 * 1000; // EAT is UTC+3 all year, no DST
const DAY = 24 * 60 * 60 * 1000;

export function formatKES(amount: number | null | undefined, { compact = false }: { compact?: boolean } = {}): string {
  const value = Number(amount ?? 0);
  if (compact && Math.abs(value) >= 1000) {
    return `KES ${value.toLocaleString('en-KE', { notation: 'compact', maximumFractionDigits: 1 })}`;
  }
  return `KES ${value.toLocaleString('en-KE', { maximumFractionDigits: 0 })}`;
}

// "5 Oct 2026"
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TIME_ZONE });
}

// "5 Oct 2026, 14:03"
export function formatDayTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TIME_ZONE,
  });
}

// "2026-10" -> "Oct 2026" (or "Oct" when short)
export function formatMonthKey(key: string, short = false): string {
  const [year, month] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 15));
  return date.toLocaleDateString('en-GB', { month: 'short', year: short ? undefined : 'numeric', timeZone: 'UTC' });
}

// The Nairobi calendar month an instant falls in, as "YYYY-MM".
export function nairobiMonthKey(iso: string): string {
  return new Date(new Date(iso).getTime() + NAIROBI_OFFSET_MS).toISOString().slice(0, 7);
}

// ISO instant -> the Nairobi calendar date, as an <input type="date"> value.
export function toDateInput(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const time = typeof iso === 'string' ? new Date(iso).getTime() : iso.getTime();
  return new Date(time + NAIROBI_OFFSET_MS).toISOString().slice(0, 10);
}

function parts(value: string): [number, number, number] {
  const [y, m, d] = value.split('-').map(Number);
  return [y, m, d];
}

// <input type="date"> value -> the start of that Nairobi day.
export function dateInputToStartISO(value: string): string {
  return nairobiDateToUTC(...parts(value)).toISOString();
}

// <input type="date"> value -> the very end of that Nairobi day (so "paid
// until 10 Oct" means through the whole of 10 Oct).
export function dateInputToEndISO(value: string): string {
  return new Date(nairobiDateToUTC(...parts(value)).getTime() + DAY - 1).toISOString();
}

// Whole days from `now` until `iso` (negative = in the past), same rounding
// as business-logic's daysUntil.
export function daysFrom(iso: string | null | undefined, now: string | Date): number | null {
  if (!iso) return null;
  const base = typeof now === 'string' ? new Date(now).getTime() : now.getTime();
  return Math.ceil((new Date(iso).getTime() - base) / DAY);
}

// "in 5 days" / "today" / "3 days overdue" (or "3 days ago" when not a due date)
export function relativeDays(days: number | null, { overdueWord = 'overdue' }: { overdueWord?: string } = {}): string {
  if (days == null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days > 0) return `in ${days} days`;
  const n = Math.abs(days);
  return `${n} day${n === 1 ? '' : 's'} ${overdueWord}`;
}

// "3 days ago" / "today" for past activity.
export function timeAgo(iso: string | null | undefined, now: string | Date): string {
  const days = daysFrom(iso, now);
  if (days == null) return 'Never';
  const ago = -days;
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  if (ago < 30) return `${ago} days ago`;
  const months = Math.floor(ago / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

export function titleCase(value: string | null | undefined): string {
  if (!value) return '—';
  return value.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

// Client-side CSV download (RFC 4180 quoting). Prefixed with a BOM so Excel
// opens UTF-8 names correctly.
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (cell: string | number | null | undefined) => {
    const text = cell == null ? '' : String(cell);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// The response body's first readable error message (Payload REST or our own routes).
export async function apiErrorMessage(response: Response, fallback: string): Promise<string> {
  const body = await response.json().catch(() => null);
  return body?.errors?.[0]?.data?.errors?.[0]?.message ?? body?.errors?.[0]?.message ?? body?.error ?? fallback;
}
