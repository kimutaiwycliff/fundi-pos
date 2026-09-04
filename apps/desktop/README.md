# @hardware-pos/desktop

The Windows/macOS till app for Fundi POS — Tauri v2 + React + Vite, offline-first via [PowerSync](https://www.powersync.com)'s Tauri plugin (`@powersync/tauri-plugin`) syncing a local SQLite database against `apps/api`'s Postgres.

Deliberately a single-screen app (`src/Till.tsx` orchestrates everything below), not a multi-page dashboard — this is a checkout terminal, not a back-office tool:

- **Sell/checkout** — cart building, tax/discount computation via `@hardware-pos/business-logic` (shared with every other client, so totals compute identically online or offline)
- **Shifts** (`ShiftPanel.tsx`) — open/close, expected vs. counted cash
- **Branch and cashier switching** (`BranchSwitcher.tsx`, `CashierSwitcher.tsx`) — an offline-capable PIN check (`src-tauri/src/pin.rs`) for the common case of handing the till to a different cashier without a full re-login
- **Customer picker** (`CustomerPicker.tsx`) — for credit (pay-later) sales
- **Held sales** — park a cart and resume it later
- **Void/refund** (`VoidOrderPanel.tsx`)
- **Find past sale + reprint** (`FindSalePanel.tsx`)
- **Hardware**: ESC/POS receipt printing and cash-drawer kick over TCP (`PrinterSettings.tsx`/`Drawer.tsx` on the frontend, `src-tauri/src/escpos.rs` on the Rust side) — targets a network-attached receipt printer, not USB

No inventory or staff management here — those stay on `apps/web`/`apps/mobile`; this app is scoped to the checkout counter.

## Local dev

```bash
npx nx run @hardware-pos/desktop:tauri -- dev
```

Needs `apps/api` (and PowerSync) reachable — see the root README/`docker/README.md` for bringing those up. `src/connector.ts` is this app's PowerSync `BackendConnector` implementation, mirrored conceptually by `apps/mobile/src/db/connector.ts`.

## Build

```bash
npx nx run @hardware-pos/desktop:build   # tsc + vite build (web bundle only)
npx nx run @hardware-pos/desktop:tauri -- build   # real signed installers (.msi/.dmg etc)
```

Release installers are built and published by `.github/workflows/desktop-release.yml` on a `desktop-v*` tag, uploaded to the same Cloudflare R2 bucket the landing page's download buttons read from.
