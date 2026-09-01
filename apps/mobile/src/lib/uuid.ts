// RN's JS engine has no Web Crypto API, so `crypto.randomUUID()` (used by
// apps/desktop's Rust-backed environment) isn't available here - same gap
// terminal.ts already worked around with plain Math.random() hex instead of
// pulling in a native crypto dependency. This generates a full RFC4122 v4
// UUID string the same way, since order/line-item ids need that exact shape
// to satisfy Postgres's `uuid` column type once synced up.
export function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
