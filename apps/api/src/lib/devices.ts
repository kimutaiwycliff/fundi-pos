import type { Payload } from 'payload';
import { sql } from 'drizzle-orm';
import { background } from './background.ts';

// Till registry (collections/Devices.ts). Tills identify themselves with
// X-Fundi-Terminal / X-Fundi-Terminal-Name headers (apps/desktop and
// apps/mobile apiFetch); synced orders carry the terminal too.

export interface DeviceSighting {
  tenantId: number | string;
  terminalId: string | null | undefined;
  name?: string | null;
  platform?: 'desktop' | 'mobile' | 'web' | null;
  userId?: number | string | null;
}

export function terminalFromHeaders(headers: Headers | null | undefined) {
  const terminalId = headers?.get('x-fundi-terminal')?.trim().slice(0, 100) || null;
  const raw = headers?.get('x-fundi-terminal-name');
  let name: string | null = null;
  try {
    name = raw ? decodeURIComponent(raw).trim().slice(0, 80) || null : null;
  } catch {
    name = raw?.trim().slice(0, 80) || null;
  }
  return { terminalId, name };
}

// Upsert, fire-and-forget (same reasoning as lib/activity.ts: never block or
// deadlock the request that noticed the till).
export function touchDevice(payload: Payload, s: DeviceSighting): void {
  if (!s.terminalId) return;
  background('device', async () => {
    await payload.db.drizzle.execute(sql`
      INSERT INTO devices (tenant_id, terminal_id, name, platform, last_user_id, first_seen_at, last_seen_at, updated_at, created_at)
      VALUES (${Number(s.tenantId)}, ${s.terminalId}, ${s.name ?? null}, ${s.platform ?? null}, ${s.userId != null ? Number(s.userId) : null}, now(), now(), now(), now())
      ON CONFLICT (tenant_id, terminal_id) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, devices.name),
        platform = COALESCE(EXCLUDED.platform, devices.platform),
        last_user_id = COALESCE(EXCLUDED.last_user_id, devices.last_user_id),
        last_seen_at = now(),
        updated_at = now()
    `);
  });
}

export async function isDeviceRevoked(payload: Payload, tenantId: number | string, terminalId: string | null | undefined): Promise<boolean> {
  if (!terminalId) return false;
  const found = await payload.find({
    collection: 'devices',
    where: { tenant: { equals: tenantId }, terminalId: { equals: terminalId }, revokedAt: { exists: true } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return found.docs.some((d) => d.revokedAt);
}

export const DEVICE_REVOKED_MESSAGE = 'This till has been removed from your shop. Ask the owner or Fundi POS support to restore it.';
