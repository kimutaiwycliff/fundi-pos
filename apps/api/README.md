# @hardware-pos/api

The backend for Fundi POS — [Payload CMS](https://payloadcms.com) 3.x on Next.js/Node, backed by Postgres. Every client (`apps/web`, `apps/mobile`, `apps/desktop`) reads and writes through this app, either directly over REST or indirectly through PowerSync's replication of the same database.

## Collections

`src/collections/`:

| Collection | What it holds |
|---|---|
| `Tenants` | One row per business — name, subscription/billing status, suspend/soft-delete status, receipt letterhead |
| `Users` | Tenant staff (owner/manager/cashier), phone + PIN hash for till login, email + password for the web dashboard |
| `Stores` | A tenant's branches |
| `Products`, `StoreProductOverrides` | Catalog (with variants) and per-store price/stock overrides |
| `Orders`, `CreditPayments` | Sales, and installment payments against pay-later ("credit") orders |
| `StockMovements`, `StockTransfers` | The append-only stock ledger, and inter-store transfers |
| `Customers` | Per-tenant customer records and loyalty points |
| `Shifts` | Cashier till sessions (open/close, expected vs. counted cash) |
| `Suppliers`, `PurchaseOrders` | Restocking |
| `Media` | Uploaded images (product photos), backed by S3-compatible object storage |
| `AuditLog` | Tenant-visible activity log (logins, void/refund, staff changes, ...) |
| `PlatformAdmins`, `PlatformAuditLog` | A separate, tenant-independent operator identity and audit trail for the platform admin panel (`apps/web`'s `/platform`) — provisioned only via `src/create-platform-admin.ts`, never through the public API |
| `SyncLog` | PowerSync replication bookkeeping |

The `/admin` route is Payload's own generated admin UI — usable directly, but `apps/web`'s `/platform` is the intended day-to-day surface for platform-operator work (tenant suspend/restore, subscriptions), since it's purpose-built and fully audit-logged.

## Custom API routes

Beyond Payload's auto-generated per-collection REST API, `src/app/api/`:

- `auth/pin-login`, `auth/signup` — phone+PIN till login and self-serve tenant signup (email/password login is Payload's built-in `POST /api/users/login`)
- `powersync/token`, `powersync/jwks` — mints/verifies the JWTs PowerSync uses to authenticate and scope each till's sync session
- `orders/[id]/{settle,record-payment,authorize-status}` — credit-sale settlement flow
- `payments/mpesa/{initiate,callback}`, `payments/pesapal/{initiate,callback}` — M-Pesa Daraja and Pesapal payment integrations
- `products/bulk-upload`, `products/bulk-upload/template` — Excel import/export for the product catalog (`src/lib/inventoryImport.ts` defines the shared column schema both directions use)
- `reports/sales-summary`, `reports/sales-daily`, `reports/stock-levels` — the aggregations `apps/web`'s Reports page and `apps/mobile`'s Reports screen both call
- `sync/orders`, `sync/stock-movements` — write-path endpoints for data that flows up through Payload rather than PowerSync's own upload queue

## Local dev

```bash
npx nx run @hardware-pos/api:dev     # http://localhost:3011
```

Needs a running Postgres (`docker compose up -d postgres` from `docker/`, or point `DATABASE_URI` elsewhere) and a `.env` — see `docker/README.md` for the full local setup. Key variables: `DATABASE_URI`, `PAYLOAD_SECRET`, `POWERSYNC_JWT_KID`/`POWERSYNC_JWT_PRIVATE_KEY`/`POWERSYNC_JWT_PUBLIC_KEY`, `ALLOWED_ORIGINS`, `R2_*` (media storage), `DARAJA_*`/`PESAPAL_*` (payments, optional for most local work).

Provision the first platform admin (needed for `/platform` on `apps/web`) with:

```bash
PLATFORM_ADMIN_EMAIL=you@example.com PLATFORM_ADMIN_PASSWORD=... PLATFORM_ADMIN_NAME="Your Name" \
  npx payload run ./src/create-platform-admin.ts
```

## Migrations

```bash
npx payload migrate          # apply pending migrations
npx payload migrate:create   # generate a new one after a collection change
```

## Testing

```bash
npx nx run @hardware-pos/api:test
```

Vitest, largely integration tests that run against a real local Postgres (see `src/__tests__/`) rather than mocks — collections, PowerSync auth, the M-Pesa/Pesapal/eTIMS integrations, and the bulk-import parser are all covered this way.
