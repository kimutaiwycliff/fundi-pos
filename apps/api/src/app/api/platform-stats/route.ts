import config from '@payload-config';
import { getPayload } from 'payload';
import { headers as nextHeaders } from 'next/headers';
import { buildStats } from '@/lib/platformStats';
import { getCachedStats, setCachedStats } from '@/lib/platformStatsCache';

// PLATFORM-ADMIN ONLY. Everything the /platform console needs in one call:
// portfolio KPIs (MRR, overdue, trials ending...), collections by month and
// a per-tenant row with billing state, owner contact and 30-day usage. Read
// only; all heavy counting happens in SQL GROUP BYs, not per-tenant queries.
//
// Cached for a minute (lib/platformStatsCache.ts) - cleared by any write to
// tenants, payments or notes, so operator changes show up at once.

export async function GET(request?: Request) {
  const payload = await getPayload({ config });
  const { user } = await payload.auth({ headers: await nextHeaders() });
  if (user?.collection !== 'platform-admins') {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const fresh = request ? new URL(request.url).searchParams.has('fresh') : false;
  const cached = fresh ? null : getCachedStats();
  if (cached) return Response.json(cached);
  const body = await buildStats(payload);
  setCachedStats(body);
  return Response.json(body);
}

