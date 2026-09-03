import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const ENABLED_KEY_PREFIX = 'biometric-login-enabled:';

export interface BiometricDiagnostics {
  hasHardware: boolean;
  isEnrolled: boolean;
  error: string | null;
}

/**
 * Same two-step capability check as isBiometricAvailable(), but reporting
 * each half individually plus any thrown error - added specifically to
 * debug a real device (a sideloaded, non-Play-Store install) reporting the
 * toggle as unavailable despite the phone having a fingerprint enrolled.
 * MIUI in particular is known to restrict biometric API access for
 * sideloaded apps in ways that don't necessarily throw a catchable error,
 * so this surfaces the raw hasHardware/isEnrolled booleans rather than
 * only the swallowed final boolean isBiometricAvailable() returns.
 */
export async function getBiometricDiagnostics(): Promise<BiometricDiagnostics> {
  try {
    // Some OEM Android builds (MIUI in particular - see this file's own
    // note above) have been seen to leave hasHardwareAsync()/
    // isEnrolledAsync() neither resolving nor rejecting at all, which is
    // NOT catchable by the try/catch below - without a hard cap the More
    // screen's Security section would show "Checking device
    // capabilities..." forever instead of ever settling on an answer.
    const diagnostics = await Promise.race([
      Promise.all([LocalAuthentication.hasHardwareAsync(), LocalAuthentication.isEnrolledAsync()]),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5000)),
    ]);
    if (diagnostics === 'timeout') {
      return { hasHardware: false, isEnrolled: false, error: 'Detection timed out' };
    }
    const [hasHardware, isEnrolled] = diagnostics;
    return { hasHardware, isEnrolled, error: null };
  } catch (err) {
    return { hasHardware: false, isEnrolled: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * True only when the device both has a sensor AND has something enrolled on
 * it - matches expo-local-authentication's own two-step capability check.
 * Swallows any throw (e.g. this native module not yet linked into an older
 * installed build than the JS bundle it's running) rather than surfacing an
 * error for what is purely an optional convenience feature - the PIN pad is
 * always the real fallback regardless of what this resolves to.
 */
export async function isBiometricAvailable(): Promise<boolean> {
  const diagnostics = await getBiometricDiagnostics();
  return diagnostics.hasHardware && diagnostics.isEnrolled;
}

// Keyed by user id, not a single app-wide flag - a shared till shouldn't let
// enabling this for one cashier silently biometric-unlock whoever logs in
// as a different person next. Just a boolean toggle, not a secret, so a
// plain SecureStore item (rather than requireAuthentication-gated) is fine -
// see session.ts's own PersistedSession for the actual credential this
// gates access to.
export async function isBiometricEnabledFor(userId: number): Promise<boolean> {
  const value = await SecureStore.getItemAsync(`${ENABLED_KEY_PREFIX}${userId}`);
  return value === 'true';
}

export async function setBiometricEnabledFor(userId: number, enabled: boolean): Promise<void> {
  if (enabled) {
    await SecureStore.setItemAsync(`${ENABLED_KEY_PREFIX}${userId}`, 'true');
  } else {
    await SecureStore.deleteItemAsync(`${ENABLED_KEY_PREFIX}${userId}`);
  }
}

/**
 * Prompts Face/Touch ID or fingerprint (falling back to the device's own
 * PIN/pattern/password if biometrics fail, same as unlocking the phone
 * itself). Returns whether the device owner was confirmed present -
 * authenticateAsync never returns a secret, so this is purely a gate in
 * front of the already-resident session (resumeCandidate in App.tsx), not a
 * credential exchange of its own.
 */
export async function authenticateWithBiometrics(promptMessage: string): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({ promptMessage });
    return result.success;
  } catch {
    return false;
  }
}
