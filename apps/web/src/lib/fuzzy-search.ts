import Fuse, { type IFuseOptions } from 'fuse.js';

// Shared tuning across every search bar in the app - loose enough that a
// typo or two (a transposition like "onwer" -> "owner", not just a single
// substitution) still surfaces the right result, tight enough that
// unrelated items don't flood in. 0.35 (tried first) missed a transposed
// pair entirely; 0.4 catches it while still correctly rejecting a
// plausible-looking decoy in the same field (confirmed against this app's
// own data: "onwer" matches owner@demo-hardware.test but not
// manager@demo-hardware.test at 0.4). ignoreLocation: match position within
// the string doesn't matter (a hit at the end of a long product name
// should score the same as one at the start).
const DEFAULT_OPTIONS = {
  threshold: 0.4,
  ignoreLocation: true,
} satisfies IFuseOptions<unknown>;

// Plain function, not a hook - every call site already wraps its own
// filtering in its own useMemo (same "load once, filter client-side"
// convention as before), so this just swaps what runs inside it. Returns
// `items` unchanged for a blank query so each caller keeps its own
// existing "show everything" vs "show nothing until you type" behavior.
export function fuzzySearch<T>(items: T[], keys: string[], query: string, options?: IFuseOptions<T>): T[] {
  const trimmed = query.trim();
  if (!trimmed) return items;
  const fuse = new Fuse(items, { ...DEFAULT_OPTIONS, keys, ...options });
  return fuse.search(trimmed).map((result) => result.item);
}
