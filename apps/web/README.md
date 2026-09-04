# @hardware-pos/web

The always-online half of Fundi POS: Next.js (App Router), talking to `apps/api`'s Payload backend. No offline requirement here — unlike `apps/mobile`/`apps/desktop`, this app has no local database and just proxies authenticated requests straight through to the API.

Three things live in this one app:

## 1. The marketing/landing page (`/`)

Public, unauthenticated. Detects the visitor's OS client-side and promotes the matching installer (`src/components/marketing/download-buttons.tsx`) — Windows/macOS installers and the Android APK all come from a Cloudflare R2 bucket that `desktop-release.yml`/`android-release.yml` upload to on each release.

## 2. The tenant dashboard (`/dashboard/*`)

The primary surface for a tenant's owners/managers/cashiers: `sell`, `products`, `inventory`, `customers`, `staff`, `stores`, `sales`, `reports`, `audit-log`, `transfers`, `exceptions`, `settings`. Signed in via `/login` (email/password against Payload's `users` collection) or `/signup` (self-serve tenant creation); session is a single httpOnly cookie (`pos_session`), read server-side in every Server Component/layout via `src/lib/current-user.ts` — there's no middleware, each route enforces its own auth.

Server-side calls to the API go through `src/lib/payload-client.ts`'s `payloadFetch`, which either hits `apps/api` directly (server-to-server) or, for client components that need to call it themselves, through `/api/payload/[...path]` — a thin authenticated proxy that attaches the session cookie's JWT so the browser never holds it directly.

## 3. The platform admin panel (`/platform`)

A separate, hidden surface for the SaaS operator (not a tenant) to suspend/restore tenants and manage subscriptions, with every action written to `apps/api`'s `platform-audit-log` collection. Deliberately parallel to the tenant dashboard rather than sharing its code:

- Its own auth collection (`platform-admins`, provisioned only via `apps/api/src/create-platform-admin.ts`)
- Its own session cookie (`platform_session`) and proxy (`/api/platform/[...path]`), so a platform-admin session and a tenant session can never collide in the same browser
- `src/app/platform/(authenticated)/` is a route group scoping the auth-gated layout to everything except `/platform/login`, which sits outside it

Payload's own `/admin` (on `apps/api`) remains available as a fallback, but `/platform` is the intended day-to-day tool.

## Local dev

```bash
npx nx run @hardware-pos/web:dev     # http://localhost:3000
```

Needs `apps/api` running (see `apps/api/README.md`) and a `.env.local` with at least `PAYLOAD_API_URL` (server-side, reaches the API directly) and `NEXT_PUBLIC_API_URL` (client-side; only used in a few spots since most client calls go through the proxy routes above). `NEXT_PUBLIC_DOWNLOADS_BASE_URL` points the landing page's download buttons at the R2 releases bucket — like every `NEXT_PUBLIC_*` var here, it's inlined at build time, not read at runtime, so changing it always needs a rebuild (see `docker/docker-compose.yml`'s `fundi-web` build args).
