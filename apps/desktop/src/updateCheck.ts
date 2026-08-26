// There's no in-app auto-updater - installers are manually downloaded from
// the marketing site (see apps/web's download-buttons.tsx) and this app has
// no update-check of its own, so a till that installed once and never went
// back to the site silently stays on that exact build forever, however many
// fixes ship afterward. That's a real, confirmed failure mode: multiple
// fixes shipped this session (offline stock sync, phone/PIN login, today's-
// sales stats) never reached a till still running an old install, which
// looked like "still broken" / "trouble logging in" from that till's side
// even though the fixes were live in every new download. This is what
// finally tells that till a newer build exists.
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getVersion } from '@tauri-apps/api/app';

const DOWNLOADS_BASE_URL =
  import.meta.env.VITE_DOWNLOADS_BASE_URL ?? 'https://pub-e6776728912f415583a924395bffb6d4.r2.dev';

export interface AvailableUpdate {
  currentVersion: string;
  latestVersion: string;
  downloadUrl: string;
}

function isNewer(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number);
  const c = current.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((l[i] ?? 0) !== (c[i] ?? 0)) return (l[i] ?? 0) > (c[i] ?? 0);
  }
  return false;
}

function installerFilename(): string {
  return /mac/i.test(navigator.userAgent) ? 'FundiTill.dmg' : 'FundiTill-Setup.exe';
}

/**
 * Never throws - offline, a blocked request, or a malformed manifest all
 * just mean "no banner shown", not an error surfaced to whoever's trying to
 * sign in.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  try {
    const currentVersion = await getVersion();
    const res = await tauriFetch(`${DOWNLOADS_BASE_URL}/latest/version.json`, { method: 'GET' });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const latestVersion = body?.version;
    if (typeof latestVersion !== 'string' || !isNewer(latestVersion, currentVersion)) return null;
    return { currentVersion, latestVersion, downloadUrl: `${DOWNLOADS_BASE_URL}/latest/${installerFilename()}` };
  } catch {
    return null;
  }
}
