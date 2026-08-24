# Deployment

## Local (dev)

`docker compose up -d` from this directory brings up Postgres, PowerSync's
storage Postgres, and PowerSync itself. `apps/api` and `apps/web` are run
directly on the host during day-to-day development (`npm run dev` in each,
per their own `package.json`) - faster iteration than rebuilding a container
on every change. `PS_JWKS_URL` in `.env` is set to
`http://host.docker.internal:3011/api/powersync/jwks` for exactly this
reason: PowerSync (in a container) reaching out to apps/api (on the host).

## Local (full container stack)

To verify the whole stack containerized - not just for day-to-day dev, but
as the Phase 9 "does it actually deploy" check - build and run everything:

```
docker compose build
docker compose up -d
```

This builds `apps/api` and `apps/web` from their Dockerfiles (build context
is the **monorepo root**, not the app directory - both apps depend on
`@hardware-pos/business-logic`/`@hardware-pos/shared-types` via npm
workspaces, which only resolve when the whole workspace is present). If you
run this mode, override `PS_JWKS_URL` to the container-internal address
instead of `host.docker.internal`:

```
PS_JWKS_URL=http://payload-api:3000/api/powersync/jwks docker compose up -d
```

## Render (demo)

`render.yaml` at the repo root is a Render Blueprint. Connect the repo in
the Render dashboard and it provisions two Postgres databases, the API and
web services (built from the same Dockerfiles as above), and PowerSync from
its prebuilt image. **UNVERIFIED** - authored from Render's Blueprint spec,
never deployed against a real Render account from this environment.

Known demo-only limitations (see comments in `render.yaml`):
- Free-tier Postgres expires after 30 days and must be recreated.
- Free-tier web services cold-start after inactivity.
- `PS_JWKS_URL` needs a manual fix-up after the first deploy - Render
  Blueprint env var references can't append a URL path, so it must be
  edited in the dashboard to the full `.../api/powersync/jwks` URL once
  `pos-saas-api`'s real hostname is known.

## VPS (production)

```
docker compose -f docker/docker-compose.yml -f docker/docker-compose.prod.yml up -d
```

Adds, on top of the base file: `restart: unless-stopped` and resource
limits on every service, a Caddy reverse proxy that terminates TLS
automatically via Let's Encrypt (`Caddyfile` - requires real public DNS
pointed at the VPS; set `API_DOMAIN`/`WEB_DOMAIN`/`POWERSYNC_DOMAIN` in
`.env`), and a daily `pg_dump` backup cron (`backup.sh`) that gzips the dump
and, if `BACKUP_S3_BUCKET`/AWS credentials are set, uploads it to
S3-compatible object storage.

**What was actually verified**: the backup script's `pg_dump | gzip` and
14-day local rotation ran successfully against this project's own
dockerized Postgres. **What was not**: Caddy's TLS issuance (needs a real
domain), the S3 upload step (needs real credentials), and the compose file
running end-to-end on an actual VPS. Docker Swarm was considered per the
build plan and deferred - a single VPS with resource limits is simpler
operationally and was judged sufficient unless real usage proves otherwise.
