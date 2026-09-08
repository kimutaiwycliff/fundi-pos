# Fundi POS

A multi-tenant, offline-first Point-of-Sale and inventory management SaaS for retail and hardware businesses — built for markets where connectivity can't be assumed and M-Pesa is a primary payment rail, but designed to generalize beyond that.

One backend serves three clients:

- **Android till app** ("Fundi Till", `com.fundipos.till`) — the primary point of sale, fully usable offline.
- **Desktop till app** (Tauri) — a native Windows/macOS point of sale, also offline-first, for hardware setups with a receipt printer/barcode scanner/cash drawer.
- **Web dashboard** — always-online, for owners/managers: inventory, multi-store reporting, staff, billing, and a hidden platform-operator admin panel.

## Capabilities

### Core POS & inventory

Available on web, Android, and desktop (see the per-app breakdown below for exact gaps):

- **Sell/checkout** — product + variant search, barcode scan (mobile/desktop), a cart with a per-item discount cap, cash/M-Pesa/card/credit tender, customer linking, held/parked sales, shift open/close with cash reconciliation computed server-side (never trusted from the client), receipt printing.
- **Multi-store** — branch switching, per-store price/stock overrides, org-level users (owner/manager) spanning multiple stores.
- **Inventory** — an append-only stock-movement ledger (current stock is always a derived sum, never a stored counter), manual adjustments (restock/correction/write-off), reorder points, stock transfers between branches, and an "exceptions" feed for movements that drove stock negative.
- **Restocking** — purchase orders against suppliers (draft → sent → partially received → received), suggestions for what to restock (products at/below their reorder point, unioned with the store's fastest-moving products), partial receiving with a per-line checklist, draft-only delete.
  - "Fast-moving" is purely **units sold**, not revenue: the top 20 products/variants per store by quantity sold across completed orders in a trailing 30-day window (adjustable), independent of current stock level — a product can be low-stock, fast-moving, or both at once.
- **Reports** — sales summary and daily trend, payment-method mix, top sellers, category/cashier breakdown, current stock value and potential profit, realized profit for the selected period (cost/profit figures are owner-only everywhere).
- **Customers** — profiles with Kenyan phone-number normalization, loyalty points (**earn-only today — no redemption path exists yet**), credit ("pay later") sales with installment tracking and manager-authorized settlement.
- **Staff** — owner/manager/cashier roles, till PIN + password login, ban/reactivate (a soft lock, staff are never hard-deleted once they have order/shift history).
- **Audit log** — an immutable trail of price changes, voids/refunds, credit settlements, logins/blocked logins, and staff/store lifecycle events.
- **Void/refund** — always requires a manager or owner's PIN, which is **re-verified server-side** before anything commits, regardless of what a local/offline PIN check said.

### Web-dashboard-only

- Full back-office: staff, stores, tenant settings (receipt header/footer), the audit log, stock transfers, and the stock-exceptions review screen.
- A separate **platform-admin panel** (its own login, unrelated to tenant roles) for the SaaS operator: suspend/reactivate/soft-delete tenants, manage subscription tier and billing status, and a cross-tenant audit trail — every action logged.
- The public site: marketing landing page, an SEO blog, Terms/Privacy pages, self-serve tenant signup, and a WhatsApp contact button.

### What works offline vs. what needs connectivity (mobile & desktop)

Both till apps sync a local SQLite database against Postgres via PowerSync, so a sale can be rung up with zero connectivity and reconciles automatically once back online.

**Fully offline, indefinitely, once synced at least once:**
- Selling end-to-end — product search, cart, checkout, receipt printing
- Held/parked sales
- Cashier PIN switching, for any staff member already synced to that device
- Customer/order lookup and reprinting a past receipt
- Session resume via local PIN — up to **30 days** without ever reconnecting (extended from 24h; a till that's regularly online refreshes this window automatically in the background, so a device rarely actually hits the cap)
- Manual stock adjustments — **mobile only** (see the desktop gap below)

**Always requires connectivity:**
- The very first login on a device
- Committing a void or refund — the PIN is checked locally for instant feedback, but the server always re-verifies and has final say
- Credit settlement and recording a credit payment
- Shift open/close (expected-cash reconciliation is computed server-side from the real order ledger)
- Creating a new customer
- Restocking (purchase orders/suppliers) — deliberately excluded from offline sync as a back-office planning task, not a mid-sale need
- Staff/store/settings management, the audit log

**Desktop-specific gap:** its local database doesn't yet mirror product variants or images, so — unlike mobile — its Reports/Inventory/Restock screens and manual stock adjustments are online-only for now. Closing this is a known, scoped follow-up, not a design decision.

**Web dashboard:** always online, no offline mode — it talks directly to the API.

### Known limitations

- **KRA eTIMS tax compliance is schema-ready but not live.** Orders already carry the right fields (`kraInvoiceNumber`, `kraQrCode`, etc.), but invoice submission is currently a deterministic stub, not a certified integration — don't rely on it for real VAT compliance yet.
- **M-Pesa (Daraja) and Pesapal are code-complete and unit-tested but unverified against a real sandbox** — both were built strictly from published API docs; neither has actually round-tripped against live payment-provider credentials. Test thoroughly before depending on them for real transactions.
- **Loyalty points can be earned but never redeemed** — there's no spend/redeem path anywhere in the app yet.

## Architecture

```
apps/
  api/       Payload CMS (Node/TypeScript) + Postgres — the single source of truth every client reads/writes through
  web/       Next.js (App Router) — tenant dashboard, marketing/landing page, platform admin panel
  mobile/    Expo / React Native (Android) — the offline-first till app, synced via PowerSync
  desktop/   Tauri v2 + React + Vite — the offline-first desktop till app, synced via PowerSync
packages/
  business-logic/   Pricing, tax, and discount calculation — shared by every client so totals compute identically online or offline
  shared-types/     Cross-app TypeScript types (Product, Order, StockMovement, Tenant, ...)
  shared-ui/        shadcn/ui components, copied into the repo (not an npm dep) and reused by web + desktop
docker/
  Postgres, PowerSync, and both server apps as Compose services — local dev, a full-container smoke test, and the production VPS deploy all use the same Compose files with different overlays
```

Offline sync is the architectural spine: `apps/mobile` and `apps/desktop` each keep a local SQLite database synced against Postgres through [PowerSync](https://www.powersync.com) (self-hosted, open edition), so a sale can be rung up with no connectivity and reconciles automatically once the till is back online. `apps/web` has no offline requirement and talks to the Payload API directly. Sync rules (`docker/powersync/sync-config.yaml`) scope what each till receives — tenant- or store-scoped, and prioritized so a till can start selling as soon as its catalog/staff data has synced, without waiting for its full historical order ledger.

## Tech stack

| Layer | Choice |
|---|---|
| Backend / API | [Payload CMS](https://payloadcms.com) 3.x on Node.js — collections + hooks for business logic, auto-generated REST, built-in admin UI |
| Database | PostgreSQL 16 |
| Offline sync | [PowerSync](https://www.powersync.com) Open Edition, self-hosted |
| Web | Next.js 16 (App Router), Tailwind, shadcn/ui |
| Mobile | Expo / React Native (SDK 56, RN 0.85), NativeWind, Reanimated |
| Desktop | Tauri v2, React 19, Vite, `@powersync/tauri-plugin` |
| Monorepo tooling | Nx (npm workspaces) |
| Payments | M-Pesa Daraja (STK Push / C2B), Pesapal |
| Local dev / self-hosted prod | Docker Compose, Caddy (automatic TLS), Cloudflare R2 (backups + release artifacts) |

## Getting started

```bash
npm install

# Bring up Postgres + PowerSync (apps/api and apps/web run directly on the
# host for faster iteration - see docker/README.md for the full-container
# alternative)
cd docker && docker compose up -d && cd ..

# In separate terminals:
npx nx run @hardware-pos/api:dev     # http://localhost:3011
npx nx run @hardware-pos/web:dev     # http://localhost:3000

# Mobile (Expo)
npx nx run mobile:start

# Desktop (Tauri)
npx nx run @hardware-pos/desktop:tauri -- dev
```

Each app's own env file (`apps/*/.env`) holds its local configuration — see `docker/README.md` for the full local/full-container/production setup, including the env vars PowerSync and Caddy need.

## What each app does

**apps/api** — Payload collections for Tenants, Users, Stores, Products (with variants and per-store price/stock overrides), Orders, Customers, StockMovements, Shifts, PurchaseOrders/Suppliers, StockTransfers, PlatformAdmins, and audit logs, plus REST routes for phone+PIN login and a 30-day background session refresh, PowerSync JWT auth, M-Pesa/Pesapal payment webhooks (unverified against a live sandbox), sales reports, and bulk product import/export (Excel). KRA eTIMS fields exist on Orders but submission is a stub, not a certified integration yet.

**apps/web** — a full point of sale in its own right (`/dashboard/sell`) alongside the back-office: products, inventory + stock adjustments, purchase orders/restocking, stock transfers between stores, a stock-exceptions review feed, customers, staff, stores, tenant settings, reports, and the audit log. Plus the public marketing/landing page (blog, Terms/Privacy, WhatsApp contact, OS-aware app downloads) and `/platform`: a separate, platform-admin-only surface (its own auth collection and session cookie) to suspend/restore tenants and manage subscriptions, with every action audit-logged.

**apps/mobile** — phone-number + PIN login (offline resume for up to 30 days, with optional fingerprint unlock), a Sell screen with barcode-scan and fuzzy product search, held sales, shift management, a Products catalog, Sales history with thermal-receipt printing and A4 PDF invoices shareable via WhatsApp, Reports, restocking (purchase orders/suppliers, online-only), and back-office screens (staff, stores, inventory + offline stock adjustments, settings, audit log) under a More tab. Ships as a signed release APK, self-distributed (not via Play Store) through a Cloudflare R2 bucket the landing page and an in-app update check both read from.

**apps/desktop** — sell/checkout, shift open/close, branch and cashier switching, a customer picker for credit sales, held sales, void/refund, find-past-sale + reprint, ESC/POS receipt printer + cash-drawer control over TCP, plus (behind a nav shell added alongside the till) Reports, Inventory, and Restocking — all three online-only for now, since desktop's local database doesn't yet mirror product variants/images the way mobile's does. Staff/settings/transfers/exceptions/full customer management stay web/mobile-only.

## CI/CD

GitHub Actions (`.github/workflows/`):

- **ci.yml** — lint, test, build, typecheck, and e2e across every affected Nx project on each push.
- **deploy.yml** — on CI success on `main`, syncs the workspace to the production VPS over SSH, rebuilds and restarts the API/web containers, restarts PowerSync (to pick up sync-rule changes), applies pending Payload migrations, and verifies both this app and the unrelated app sharing the same VPS stay healthy.
- **android-release.yml** — on an `android-v*` tag, builds and signs the Android APK (`eas build --local`, using the same keystore as local builds) and uploads it to R2 as both `latest/` and a versioned copy, updating the manifest the landing page and in-app update check read.
- **desktop-release.yml** — the equivalent release pipeline for Windows/macOS desktop installers.
- **provision-r2-env.yml** / **provision-backup-env.yml** / **provision-full-env.yml** — one-off, manually-triggered workflows that seed the production server's env: media-storage R2 credentials, the Postgres backup bucket's credentials, and (last resort) a full `docker/.env` snapshot for standing up a genuinely fresh VPS.
- **check-backup-status.yml** — read-only, confirms the daily Postgres backup cron is actually uploading to R2.

Production runs on a self-hosted VPS via `docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml`, with Caddy (or, on the current shared box, another app's Caddy) terminating TLS and a daily Postgres backup cron to Cloudflare R2. Disaster recovery — restoring a corrupted DB, or standing up a brand-new VPS end to end from a single command — is documented in `docker/RESTORE.md` and driven by the root `Makefile` (`make restore`, `make new-vps`). See `docker/README.md` for the full deployment story, including the free-tier Render path used for early demos.

## Useful Nx commands

```bash
npx nx graph                              # interactive project dependency graph
npx nx show project @hardware-pos/api     # a project's targets/config
npx nx run-many -t lint test build typecheck  # run everything (what CI runs)
npx nx affected -t test                   # only what changed
npx nx run mobile:lint                    # a single project's target
```
