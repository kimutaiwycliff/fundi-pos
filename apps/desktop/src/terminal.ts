// This till's identity. Two distinct concepts, deliberately not conflated:
//   - id: a stable, opaque, auto-generated value, persisted per-installation.
//     Every functional lookup (shift status via findOpenShift, sync scoping)
//     keys off THIS, so it can never change - renaming the till must not be
//     able to make an already-open shift invisible to itself.
//   - name: a human label the owner sets after installing, purely for
//     display and for stamping onto orders/shifts as a point-in-time fact
//     ("terminalName" - see Orders.ts) so an auditor can tell which physical
//     machine rang up a sale. Renaming later never touches past orders.
const ID_KEY = 'hardware-pos-terminal-id';
const NAME_KEY = 'hardware-pos-terminal-name';

export function getTerminalId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = `till-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getTerminalName(): string | null {
  return localStorage.getItem(NAME_KEY);
}

export function setTerminalName(name: string): void {
  localStorage.setItem(NAME_KEY, name.trim());
}
