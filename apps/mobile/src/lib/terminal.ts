import * as SecureStore from 'expo-secure-store';

// This till's identity. Two distinct concepts, deliberately not conflated
// (ported from apps/desktop/src/terminal.ts):
//   - id: a stable, opaque, auto-generated value, persisted per-installation.
//     Every functional lookup (shift status, sync scoping) keys off THIS, so
//     it can never change - renaming the till must not be able to make an
//     already-open shift invisible to itself.
//   - name: a human label the owner sets after installing, purely for
//     display and for stamping onto orders/shifts as a point-in-time fact
//     ("terminalName" - see Orders.ts) so an auditor can tell which physical
//     device rang up a sale. Renaming later never touches past orders.
const ID_KEY = 'hardware-pos-terminal-id';
const NAME_KEY = 'hardware-pos-terminal-name';

function randomId(): string {
  // crypto.randomUUID() is not available in RN's JS engine (no Web Crypto
  // API) - random hex is sufficient here since this is an opaque local
  // identifier, not a security-sensitive value.
  return Array.from({ length: 8 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export async function getTerminalId(): Promise<string> {
  let id = await SecureStore.getItemAsync(ID_KEY);
  if (!id) {
    id = `till-${randomId()}`;
    await SecureStore.setItemAsync(ID_KEY, id);
  }
  return id;
}

export async function getTerminalName(): Promise<string | null> {
  return SecureStore.getItemAsync(NAME_KEY);
}

export async function setTerminalName(name: string): Promise<void> {
  await SecureStore.setItemAsync(NAME_KEY, name.trim());
}
