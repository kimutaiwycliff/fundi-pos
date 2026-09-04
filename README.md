# Fundi POS

A multi-tenant, offline-first Point-of-Sale and inventory management SaaS for retail and hardware businesses — built for markets where connectivity can't be assumed and M-Pesa is a primary payment rail, but designed to generalize beyond that.

One backend serves three clients:

- **Android till app** ("Fundi Till", `com.fundipos.till`) — the primary point of sale, fully usable offline.
- **Desktop till app** (Tauri) — a native Windows/macOS point of sale, also offline-first, for hardware setups with a receipt printer/barcode scanner/cash drawer.
- **Web dashboard** — always-online, for owners/managers: inventory, multi-store reporting, staff, billing, and a hidden platform-operator admin panel.

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

**apps/api** — Payload collections for Tenants, Users, Stores, Products (with variants and per-store price/stock overrides), Orders, Customers, StockMovements, Shifts, StockTransfers, PlatformAdmins, and audit logs, plus REST routes for phone+PIN login, PowerSync JWT auth, M-Pesa/Pesapal payment webhooks, KRA eTIMS, sales reports, and bulk product import/export (Excel).

**apps/web** — the tenant dashboard (sell, products, inventory, customers, staff, stores, reports, audit log, stock transfers), the public marketing/landing page with OS-aware app downloads, and `/platform`: a separate, platform-admin-only surface (its own auth collection and session cookie) to suspend/restore tenants and manage subscriptions, with every action audit-logged.

**apps/mobile** — phone-number + PIN login (with an offline resume path and optional fingerprint unlock), a Sell screen with barcode-scan and fuzzy product search, held sales, shift management, a Products catalog, Sales history with thermal-receipt printing and A4 PDF invoices shareable via WhatsApp, Reports, and back-office screens (staff, stores, inventory, settings, audit log) under a More tab. Ships as a signed release APK, self-distributed (not via Play Store) through a Cloudflare R2 bucket the landing page and an in-app update check both read from.

**apps/desktop** — a focused, single-screen till: sell/checkout, shift open/close, branch and cashier switching, a customer picker for credit sales, held sales, void/refund, find-past-sale + reprint, and ESC/POS receipt printer + cash-drawer control over TCP. No inventory or staff management here by design — those stay on web/mobile.

## CI/CD

GitHub Actions (`.github/workflows/`):

- **ci.yml** — lint, test, build, typecheck, and e2e across every affected Nx project on each push.
- **deploy.yml** — on CI success on `main`, syncs the workspace to the production VPS over SSH, rebuilds and restarts the API/web containers, restarts PowerSync (to pick up sync-rule changes), applies pending Payload migrations, and verifies both this app and the unrelated app sharing the same VPS stay healthy.
- **android-release.yml** — on an `android-v*` tag, builds and signs the Android APK (`eas build --local`, using the same keystore as local builds) and uploads it to R2 as both `latest/` and a versioned copy, updating the manifest the landing page and in-app update check read.
- **desktop-release.yml** — the equivalent release pipeline for Windows/macOS desktop installers.
- **provision-r2-env.yml** — one-off, manually-triggered seeding of R2 credentials into the production server's env.

Production runs on a self-hosted VPS via `docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml`, with Caddy terminating TLS and a daily Postgres backup cron. See `docker/README.md` for the full deployment story, including the free-tier Render path used for early demos.

## Useful Nx commands

```bash
npx nx graph                              # interactive project dependency graph
npx nx show project @hardware-pos/api     # a project's targets/config
npx nx run-many -t lint test build typecheck  # run everything (what CI runs)
npx nx affected -t test                   # only what changed
npx nx run mobile:lint                    # a single project's target
```
