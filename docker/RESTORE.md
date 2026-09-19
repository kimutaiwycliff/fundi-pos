# Disaster recovery — restoring the Postgres database

This covers the two realistic failure modes: the app DB gets corrupted/data goes
bad but the VPS itself is fine, and the VPS is gone entirely and everything is
being rebuilt on a fresh box. Both end up running the same restore command —
the difference is just how much of the stack needs to come up first.

**The short version**: everything below is wrapped in `make` targets at the
repo root (`Makefile`) — run `make help` for the full list.

- DB corrupted, box is fine: `make restore` (or `make restore-from DUMP=...`
  for a specific dump instead of the latest).
- VPS is gone entirely: `make new-vps DEPLOY_HOST=<new-ip>` does the whole
  of Scenario B below in one command — installs Docker, clones the repo,
  seeds `docker/.env`, brings the stack up, restores the latest backup, and
  applies migrations.

The rest of this doc is the narrative version, for when you want to run a
step by hand or understand what a `make` target is actually doing.

Only the **app database** (`postgres` service, database `pos_saas`) is backed
up and restored here. The second Postgres instance (`postgres-storage`) is
PowerSync's own internal bucket-storage — it's derived, rebuildable
replication state, not source-of-truth data. If it's lost, don't restore it;
just let PowerSync rebuild it (see "PowerSync storage" below).

## Scenario A — DB corrupted, VPS/containers otherwise healthy

One command: `make restore` (from the repo root, on your own machine — it
SSHes in for you). Everything below is what that target actually runs.

```sh
cd <DEPLOY_PATH>/docker

# Optional but recommended: stop the app so nothing writes while you restore.
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop fundi-payload-api fundi-web fundi-powersync

# Restore the latest backup (pulls from R2 if BACKUP_S3_BUCKET is set in
# docker/.env, otherwise falls back to the newest dump still on this box's
# pgbackups volume).
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backup sh /restore.sh --latest --yes

# Bring everything back up.
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

To restore a *specific* dump instead of the latest (e.g. rolling back further
than the most recent nightly backup):

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backup \
  sh /restore.sh s3://<BACKUP_S3_BUCKET>/pos_saas-20260901-020000.sql.gz --yes
```

Or: `make restore-from DUMP=s3://<BACKUP_S3_BUCKET>/pos_saas-20260901-020000.sql.gz`

## Scenario B — VPS is gone, rebuilding from scratch

One command: `make new-vps DEPLOY_HOST=<new-ip>` (add `WITH_CADDY=1
API_DOMAIN=... WEB_DOMAIN=... POWERSYNC_DOMAIN=...` if this box terminates
its own TLS rather than sitting behind another, co-located app's Caddy).
It runs steps 1–6 below in order, then verifies. What it
does, and how it seeds `docker/.env` (step 3) without a password manager:

1. **Provision a new box.** Install Docker + the Docker Compose plugin.
   (`make vps-install-docker`)
2. **Get the code onto it** — clone the repo, then repoint
   `DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_PATH` so every future `deploy.yml`/
   `provision-*.yml` run targets this box instead of the old one.
   (`make vps-clone`, `make point-vps`)
3. **Recreate `docker/.env`** on the new box. This file is deliberately never
   committed or rsync'd by `deploy.yml`, so it has to be seeded again. Two
   ways (`make vps-env` picks automatically):
   - **Old box still reachable** (e.g. migrating providers): scp it straight
     across — `make vps-env SRC_HOST=<old-ip>`.
   - **Old box is genuinely gone**: pulled from the `DEPLOY_ENV_FILE_BASE64`
     GitHub secret — a base64 snapshot of the *entire* `docker/.env`
     (`POSTGRES_PASSWORD`, `PAYLOAD_SECRET`, the `PS_*`/`POWERSYNC_JWT_*`
     vars, `R2_*`, `BACKUP_S3_*` — everything, not just the R2/backup subset
     `provision-r2-env.yml`/`provision-backup-env.yml` cover) via the
     `provision-full-env.yml` workflow. **Keep this secret current**: run
     `make snapshot-env` any time `docker/.env` actually changes on the live
     server, or this snapshot silently goes stale.
   - Also recreate `docker/Caddyfile`'s domain env vars (`API_DOMAIN`,
     `WEB_DOMAIN`, `POWERSYNC_DOMAIN`) if this box is the one terminating TLS
     directly (see `docker/README.md` for when that's/isn't the case, e.g.
     alongside a co-located app's own Caddy) — `make vps-set-domains API_DOMAIN=...
     WEB_DOMAIN=... POWERSYNC_DOMAIN=...`. If instead this box joins a
     co-located app's existing network (see `docker-compose.yml`'s
     `colocated_net`), also set `COLOCATED_NETWORK_NAME` in `docker/.env`
     (see `docker/.env.example`).
4. **Bring up just the databases first**, so there's something to restore into:
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres postgres-storage backup
   ```
   (`make vps-up-db`)
5. **Restore the app DB**:
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backup sh /restore.sh --latest --yes
   ```
6. **Bring up the rest of the stack** and apply any migrations newer than the
   restored dump (mirrors `deploy.yml`'s own "Apply pending Payload migrations"
   step):
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   bash migrate.sh
   ```
   (`make vps-up-app`, `make vps-migrate`)
7. **Verify** (`make vps-verify` checks container status + an internal health
   hit; still manually confirm): `curl https://<API_DOMAIN>/admin` returns
   200, log into the
   dashboard, spot-check that recent orders/products look right.

## PowerSync storage (`postgres-storage`)

Not backed up, and that's intentional — it's PowerSync's own replicated
bucket state, entirely derivable from the main `postgres` database via
logical replication. If it's lost or corrupted:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml stop fundi-powersync
docker volume rm docker_pgdata_storage   # confirm the actual volume name first: docker volume ls
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres-storage fundi-powersync
```

PowerSync re-establishes its replication slot against `postgres` and rebuilds
its bucket storage from there. Existing mobile clients will do a fresh full
sync the next time they connect (same as a brand-new install) — expected and
harmless, not a data-loss event, since `postgres` remains the single source
of truth throughout.

## Provisioning the backup credentials (one-time, manual)

`docker/backup.sh`/`restore.sh` need a dedicated Cloudflare R2 bucket — kept
separate from the existing media and release buckets on purpose (a backup job
has no reason to be able to touch product images or release artifacts, and
vice versa):

1. Cloudflare dashboard → R2 → **Create bucket** (e.g. `fundi-backups`).
2. **Manage R2 API Tokens** → create a token scoped to only that bucket,
   read+write.
3. Add four new GitHub repo secrets: `BACKUP_S3_BUCKET` (the bucket name),
   `BACKUP_S3_ENDPOINT` (`https://<account-id>.r2.cloudflarestorage.com`),
   `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY` (from the token).
4. Run the `Provision backup env on production` workflow once
   (`workflow_dispatch`, from the Actions tab) — it writes these into the
   server's `docker/.env` and restarts the `backup` service.
5. Confirm: `docker compose -f docker-compose.yml -f docker-compose.prod.yml logs backup` after the
   next scheduled run (or trigger one manually — see below) should show
   `Uploaded to s3://fundi-backups/...` instead of "not uploaded."

To run a backup immediately instead of waiting for the daily loop:

```sh
docker compose -f docker-compose.yml -f docker-compose.prod.yml exec backup sh /backup.sh
```

Or: `make backup-now`.

## Keeping the full-env disaster-recovery snapshot current

Separately from `BACKUP_S3_*` above (the DB dumps themselves), the
`DEPLOY_ENV_FILE_BASE64` GitHub secret is a base64 snapshot of the entire
`docker/.env` file — the thing that makes `make new-vps` work without an old
box to scp from. It's only ever *used* by `provision-full-env.yml`, and only
ever *updated* by `make snapshot-env`, which you should re-run any time
`docker/.env` on the live server actually changes (a rotated
`POSTGRES_PASSWORD`, a new R2 credential, etc.) — otherwise a future disaster
recovery would restore stale values. Nothing in this secret is ever printed
by any of these commands.
