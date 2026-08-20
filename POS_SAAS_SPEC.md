# Hardware POS & Inventory Management SaaS — Build Specification

**Purpose of this document:** This is a build spec for Claude Code to implement an offline-first hardware Point-of-Sale (POS) and inventory management SaaS. It covers architecture, tech stack with rationale, data model, sync strategy, feature scope, monorepo layout, local dev setup (Docker Compose), and the deployment path (local → Render free tier → VPS Docker Compose).

**Status of research in this doc:** Stack choices below were verified against current (2026) documentation and product pages where noted. One item is flagged explicitly as **unverified / needs a spike** before committing — see "Known Risk" in the Desktop Sync section. Claude Code should treat that section as the first thing to prototype and confirm before building on top of it.

---

## 1. Product Summary

A multi-tenant SaaS for retail/hospitality businesses providing:
- A **desktop till application** (Tauri) that works **fully offline**, connects to POS hardware (receipt printer, barcode scanner, cash drawer), and syncs to the cloud when connectivity is available.
- A **web dashboard** (always-online) for inventory management, multi-store reporting, staff management, and admin/billing, used by owners/managers from a browser.
- A **shared backend** (Payload CMS + Postgres) that is the single source of truth both clients read from and write to.

Target market: retail and small hospitality businesses, starting in Kenya (M-Pesa as a primary payment rail), designed to generalize.

---

## 2. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Backend / API | **Payload CMS** (TypeScript, Node.js) | Auto-generated REST + GraphQL from schema, hooks for business logic (e.g. writing stock-movement ledger entries on every sale), built-in admin UI, first-class Postgres adapter. Chosen over NestJS per explicit preference. |
| Database | **PostgreSQL 16** | Relational integrity for financial/inventory data; required as the source DB for PowerSync's logical replication. |
| Offline sync engine | **PowerSync Open Edition** (self-hosted, source-available, free) | Bidirectional Postgres ⇄ local SQLite sync with built-in upload queue, sync rules, and conflict-resolution hooks. Ships as a Docker image, fits the Docker Compose plan directly. Confirmed free/self-hostable as of 2026 (FSL-licensed "Open Edition"; the paid tiers — Cloud and Enterprise Self-Hosted — are optional upgrades, not required). |
| Desktop shell | **Tauri v2** | ~3–20MB installers vs. Electron's 80–200MB, native Rust access to USB/serial hardware (printers, scanners, drawers), and a path to iOS/Android from the same codebase later via Tauri's mobile support. |
| Desktop frontend | **React + TypeScript + Vite**, styled with **Tailwind + shadcn/ui** | Component-based; shadcn/ui components are copied into the repo (not an npm dependency), so the same components can be reused verbatim in both the desktop app and the web app. |
| Desktop local DB | **SQLite**, managed through the **PowerSync Web SDK** running inside the Tauri webview | See Known Risk below — this is the one part of the stack to validate early. |
| Web frontend | **Next.js (App Router) + TypeScript**, **Tailwind + shadcn/ui** | Talks directly to the Payload API; no offline requirement, so no local DB needed here. |
| Hardware integration | `tauri-plugin-esc-pos` or `tauri-plugin-thermal-printer` (ESC/POS over USB/TCP) for receipts and cash-drawer kick. Barcode scanners need **no plugin** — standard USB-HID scanners act as keyboard input. |
| Payments | M-Pesa Daraja API (STK Push / C2B paybill) + card gateway integration (TBD provider) |
| Monorepo tooling | **Nx** | Consistent with existing Kejasha project; enables sharing `shared-types`, `shared-ui` (shadcn components), and `business-logic` packages across desktop and web apps. |
| Local dev orchestration | **Docker Compose** | Postgres, PowerSync service, Payload API, and (optionally) the Next.js web app all run as Compose services. |
| Early hosting | **Render** (free tier) | Fast path to a public URL for demoing the web app + API. **Note:** Render does not run a `docker-compose.yml` as a single unit — each service (Payload API, Postgres, PowerSync) is deployed as its own Render service (Web Service / Docker / managed Postgres), ideally described in one `render.yaml` Blueprint. Free-tier web services spin down after 15 minutes of inactivity (cold start on next request) and the free Postgres instance expires after 30 days — fine for demoing, not for production. |
| Production hosting | **VPS via Docker Compose**, scaling to Docker Swarm if needed | Same Compose files used in local dev, adapted with production env vars, TLS termination (Caddy or Traefik reverse proxy), and volume-backed Postgres storage. |

### Known Risk — Desktop ⇄ PowerSync integration (validate first)

PowerSync's official client SDKs target web, mobile (iOS/Android/Flutter/React Native), and Node.js — there is no dedicated **Tauri-native** SDK. The workable path documented by the community is to run PowerSync's **Web SDK** inside the Tauri webview, since Tauri's frontend is a real browser environment (WASM SQLite backed by OPFS/IndexedDB), rather than using Tauri's native Rust SQLite plugin. This works but is a less-traveled path than PowerSync's mobile/web integrations.

**Before building the full desktop app, Claude Code should spike:**
1. A minimal Tauri v2 app running the PowerSync Web SDK against a local PowerSync Docker instance, confirming offline read/write + background sync actually works inside the Tauri webview on Windows and Linux (the two most likely till OSes).
2. Confirm read/write throughput and storage durability are acceptable for POS transaction volume (WASM SQLite via OPFS should be fine, but hasn't been battle-tested for this specific POS use case).

**Fallback if the spike fails:** use `tauri-plugin-sql` (native Rust SQLite) for local storage and hand-roll a delta-sync layer (transaction log + idempotent replay) against the Payload API directly, without PowerSync. This is more work but has no framework-fit risk. The data model below (append-only stock-movement ledger, UUID transaction IDs) is designed to work either way.

---

## 3. Monorepo Structure (Nx)

```
apps/
  api/              → Payload CMS backend (collections, hooks, access control)
  desktop/          → Tauri v2 + React (till application)
  web/              → Next.js (admin dashboard)
packages/
  shared-types/     → TypeScript types: Product, StockMovement, Order, Store, Tenant, etc.
  shared-ui/         → shadcn/ui components used by both desktop and web
  business-logic/    → pricing, tax, discount calculation — shared so desktop (offline) and
                        web (online) compute identical totals
docker/
  docker-compose.yml         → local dev: postgres, payload api, powersync service, web
  docker-compose.prod.yml    → production overrides for VPS deployment
  render.yaml                 → Render Blueprint for early-stage hosting
```

---

## 4. Data Model (Payload Collections)

Design principle: **stock quantity is never stored as a single mutable number for POS-driven changes.** Current stock is derived by summing an append-only ledger. This is what prevents silent overselling when two offline tills sell the same last unit before either has synced.

### `Tenants`
- `id`, `name`, `subscriptionTier`, `billingStatus`

### `Stores`
- `id`, `tenant` (relation), `name`, `address`, `timezone`

### `Users`
- `id`, `tenant` (relation), `store` (relation, nullable for org-level admins), `role` (`owner` | `manager` | `cashier`), `pinHash` (for fast till login)

### `Products`
- `id`, `tenant`, `sku`, `barcode`, `name`, `category`, `variants[]` (size/color etc.), `costPrice`, `sellPrice`, `taxRate`, `isBundle`, `bundleComponents[]` (self-relation, for composite items)

### `StoreProductOverrides`
- `id`, `store`, `product`, `priceOverride` (nullable), `isAvailable` — lets stores diverge from the tenant-wide catalog

### `StockMovements` (append-only ledger — the core of the sync model)
- `id` (UUID, client-generated for idempotency)
- `tenant`, `store`, `product`, `variant`
- `quantityDelta` (positive = restock/return, negative = sale/write-off)
- `reason` (`sale` | `restock` | `transfer_in` | `transfer_out` | `adjustment` | `write_off`)
- `relatedOrder` (relation, nullable)
- `clientTimestamp` (set on the till at time of action)
- `serverTimestamp` (set by Payload on ingest)
- `sourceTerminal` (till device ID, for audit/debug)

> Current stock for a product+store = `SUM(quantityDelta)` over its `StockMovements`. Never write directly to a "stock count" field from a client.

### `Orders`
- `id` (UUID, client-generated), `tenant`, `store`, `terminal`, `cashier`, `lineItems[]` (product, qty, unitPrice, discount), `taxTotal`, `discountTotal`, `total`, `tenderType` (`cash` | `mpesa` | `card`), `paymentStatus` (`paid` | `pending` | `failed`), `status` (`completed` | `refunded` | `voided`), `createdOffline` (bool), `syncedAt`

### `PurchaseOrders`
- `id`, `tenant`, `store`, `supplier` (relation), `lineItems[]` (product, qty, unitCost), `status` (`draft` | `sent` | `received`), `receivedAt`

### `Suppliers`
- `id`, `tenant`, `name`, `contactInfo`

### `StockTransfers`
- `id`, `tenant`, `fromStore`, `toStore`, `lineItems[]`, `status`

### `Customers`
- `id`, `tenant`, `name`, `phone`, `loyaltyPoints`, `purchaseHistory` (derived)

### `SyncLog` (debugging/audit, not business data)
- `id`, `terminal`, `lastSyncedAt`, `pendingCount`, `conflictCount`

---

## 5. Sync & Conflict Strategy

- **Transaction IDs:** every `Order` and `StockMovement` gets a client-generated UUID at creation time. All writes are idempotent — replaying an already-applied UUID is a no-op server-side.
- **Simple field conflicts** (product name, description, price): resolve **last-write-wins by timestamp**. Acceptable because these are descriptive, not transactional.
- **Stock quantity conflicts:** never resolved by overwriting a number. Every sale/adjustment is its own ledger row; the "current stock" value is always a derived sum, computed server-side (and locally, from the synced subset of the ledger, on the till). If summing the ledger produces a negative available stock after sync, flag it as a `StockMovements` record with `reason: adjustment` and surface it in the web dashboard's exception queue for manual review (backorder, apology, substitute) — never silently clamp to zero.
- **Sync direction:** PowerSync streams Postgres → local SQLite (read path) and queues local writes → Payload API (write path) via PowerSync's upload queue. Payload's `beforeChange` hooks on `Orders` and `StockMovements` are the authoritative validation point — a client cannot bypass business rules by writing to the local DB.
- **UI requirement:** desktop app must show a persistent online/offline indicator and a pending-sync count so cashiers are never confused about whether a sale has synced.

---

## 6. Feature Scope

### 6.1 Till / Checkout (Desktop, must work fully offline)
- Barcode scan and text search for products
- Cart with split tender (cash / M-Pesa / card), split bills
- Discounts and promo codes, returns/refunds/voids gated behind manager PIN
- Held/parked sales
- Shift open/close with cash-up reconciliation
- Fast cashier switching, PIN login
- Role-based permissions (`cashier` / `manager` / `owner`)
- Receipt printing (ESC/POS) and cash-drawer kick — works with zero network
- Persistent online/offline + pending-sync indicator

### 6.2 Inventory Management
- SKU & variant management (size, color)
- Barcode generation for products without one
- Multi-location stock levels, inter-store transfers
- Purchase orders and supplier management
- Cost tracking (FIFO or weighted-average — decide one and apply consistently)
- Low-stock alerts and reorder-point suggestions
- Stock adjustments/write-offs with full audit trail (every change is a `StockMovements` row)
- Cycle count / stocktake mode
- Composite/bundle items (e.g. combo meals) — optional, phase 2

### 6.3 Multi-Store / Multi-Tenant
- Tenant → Store hierarchy
- Centralized product catalog with per-store price/availability overrides
- Consolidated cross-store reporting
- Tenant-level subscription/billing state (billing provider TBD — Stripe is the default assumption; confirm before building)

### 6.4 Web Dashboard (Next.js, always-online)
- Sales and margin dashboards, top/slow movers, staff performance
- Live view of orders as tills sync in
- Customer profiles, purchase history, loyalty points
- Tax reporting — flag KRA eTIMS integration as a follow-up research item before building this section, requirements weren't verified in this spec
- Stock-conflict exception queue (see Section 5)
- Admin: manage stores, staff, roles, subscription

### 6.5 Payments
- M-Pesa STK Push / paybill — requires connectivity at time of transaction; queue as `pending` if attempted offline and confirm on reconnect
- Card payment — same connectivity requirement
- Cash — always available offline, no queuing needed

---

## 7. Local Development (Docker Compose)

`docker/docker-compose.yml` should define:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: pos_saas
      POSTGRES_USER: pos_admin
      POSTGRES_PASSWORD: <dev-only, from .env>
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  payload-api:
    build: ../apps/api
    environment:
      DATABASE_URI: postgres://pos_admin:<pwd>@postgres:5432/pos_saas
      PAYLOAD_SECRET: <dev-only>
    ports: ["3001:3001"]
    depends_on: [postgres]

  powersync:
    image: journeyapps/powersync-service   # confirm exact image tag from PowerSync's self-hosting docs at build time
    environment:
      POWERSYNC_DATABASE_URI: postgres://pos_admin:<pwd>@postgres:5432/pos_saas
    ports: ["8080:8080"]
    depends_on: [postgres]

  web:
    build: ../apps/web
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:3001
    ports: ["3000:3000"]
    depends_on: [payload-api]

volumes:
  pgdata:
```

The Tauri desktop app is **not** containerized — it runs natively during development (`npm run tauri dev`) and points at `localhost:3001` (Payload) and `localhost:8080` (PowerSync).

**Note for Claude Code:** confirm the exact PowerSync self-hosted Docker image name/tag against `https://docs.powersync.com/intro/self-hosting` at implementation time — image naming may have changed since this spec was written.

---

## 8. Deployment Path

1. **Local:** full stack via `docker compose up` as above.
2. **Early/demo stage — Render free tier:** deploy `payload-api` as a Render Web Service (Docker), a managed Postgres instance (note: free Postgres expires after 30 days — plan to upgrade or re-provision before then), and `web` as a second Web Service or static/SSR deployment. PowerSync can also run as a Render Docker service pointed at the same Postgres. Expect cold starts on the free tier — acceptable for demos, not for live tills.
3. **Production — VPS + Docker Compose:** same Compose services as local dev, with:
   - `docker-compose.prod.yml` overrides (production env vars, restart policies, resource limits)
   - A reverse proxy (Caddy or Traefik) in front of `payload-api`, `powersync`, and `web` for TLS and routing
   - Postgres on a persistent volume with a backup cron (`pg_dump` to object storage)
   - Scale to Docker Swarm only once a single VPS is genuinely resource-constrained — don't add Swarm complexity prematurely

---

## 9. Build Order (suggested phases for Claude Code)

1. **Spike:** Tauri + PowerSync Web SDK offline read/write, per the Known Risk section. Do this before anything else.
2. **Backend:** Payload collections and hooks (Section 4), Docker Compose for Postgres + Payload, seed data.
3. **Web dashboard shell:** Next.js + shadcn/ui, auth, connect to Payload API, basic product/inventory CRUD screens.
4. **PowerSync service:** stand up self-hosted PowerSync against Postgres, define sync rules (which data syncs to which store/terminal).
5. **Desktop till MVP:** Tauri + React + shadcn/ui, local SQLite via PowerSync SDK, basic checkout flow (no hardware yet), verify offline → online sync round-trip with the stock-movement ledger model.
6. **Hardware integration:** ESC/POS printer plugin, cash drawer, barcode scanner input handling.
7. **Full feature build-out:** remaining features from Section 6, in priority order: till → inventory → multi-store → dashboard reporting → payments.
8. **Deploy:** Render free tier for demo, then VPS Docker Compose for production.

---

## 10. Open Questions to Resolve Before/During Build

- Card payment gateway provider not yet chosen — confirm before building the payment module.
- Billing/subscription provider for the SaaS itself (Stripe assumed, not confirmed).
- FIFO vs. weighted-average costing — pick one.
- KRA eTIMS tax-reporting integration requirements — not researched in this spec, needs its own investigation before the tax-reporting dashboard section is built.
