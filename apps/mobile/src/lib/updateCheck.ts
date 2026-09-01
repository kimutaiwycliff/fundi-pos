import Constants from 'expo-constants';

// Mirrors apps/desktop/src/updateCheck.ts exactly (same manifest shape,
// same "notify + redownload" pattern rather than a silent auto-updater -
// desktop doesn't have one either). Reads this app's own version from
// app.json via expo-constants rather than a native version API, since
// there's no Tauri-equivalent getVersion() here.
const DOWNLOADS_BASE_URL = process.env.EXPO_PUBLIC_DOWNLOADS_BASE_URL ?? 'https://pub-e6776728912f415583a924395bffb6d4.r2.dev';

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

/**
 * Never throws - offline, a blocked request, or a malformed manifest all
 * just mean "no banner shown", same as desktop's identical guarantee.
 */
export async function checkForUpdate(): Promise<AvailableUpdate | null> {
  try {
    const currentVersion = Constants.expoConfig?.version ?? '0.0.0';
    const res = await fetch(`${DOWNLOADS_BASE_URL}/latest/android-version.json`);
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const latestVersion = body?.version;
    if (typeof latestVersion !== 'string' || !isNewer(latestVersion, currentVersion)) return null;
    return { currentVersion, latestVersion, downloadUrl: `${DOWNLOADS_BASE_URL}/latest/FundiTill.apk` };
  } catch {
    return null;
  }
}
