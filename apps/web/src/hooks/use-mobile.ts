import * as React from "react"

const MOBILE_BREAKPOINT = 768

function subscribe(breakpoint: number, callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

function getSnapshot(breakpoint: number) {
  return window.innerWidth < breakpoint
}

function getServerSnapshot() {
  return false
}

// Accepts an optional breakpoint (defaults to the original 768px "phone"
// threshold) so a caller can align this with a different Tailwind
// breakpoint it's already using in JSX (e.g. `useIsMobile(1024)` to match
// an `lg:` class), without disturbing existing call sites that rely on the
// default.
export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT) {
  return React.useSyncExternalStore(
    (callback) => subscribe(breakpoint, callback),
    () => getSnapshot(breakpoint),
    getServerSnapshot,
  )
}
