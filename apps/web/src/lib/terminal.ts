// This browser's till identity, persisted per-browser (mirrors
// apps/desktop/src/terminal.ts's id/name split): `id` is stable and opaque,
// keying shift lookups (findOpenShift) so renaming can never orphan an
// already-open shift; `name` is a display label stamped onto orders/shifts
// as a point-in-time fact and never retroactively changes past records.
const ID_KEY = 'hardware-pos-web-terminal-id';
const NAME_KEY = 'hardware-pos-web-terminal-name';

export function getTerminalId(): string {
  let id = localStorage.getItem(ID_KEY);
  if (!id) {
    id = `web-${crypto.randomUUID().slice(0, 8)}`;
    localStorage.setItem(ID_KEY, id);
  }
  return id;
}

export function getTerminalName(): string | null {
  return localStorage.getItem(NAME_KEY);
}
