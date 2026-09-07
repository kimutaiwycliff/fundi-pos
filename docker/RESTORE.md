# Disaster recovery — restoring the Postgres database

This covers the two realistic failure modes: the app DB gets corrupted/data goes
bad but the VPS itself is fine, and the VPS is gone entirely and everything is
being rebuilt on a fresh box. Both end up running the same restore command —
the difference is just how much of the stack needs to come up first.

Only the **app database** (`postgres` service, database `pos_saas`) is backed
up and restored here. The second Postgres instance (`postgres-storage`) is
PowerSync's own internal bucket-storage — it's derived, rebuildable
replication state, not source-of-truth data. If it's lost, don't restore it;
just let PowerSync rebuild it (see "PowerSync storage" below).

## Scenario A — DB corrupted, VPS/containers otherwise healthy

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

## Scenario B — VPS is gone, rebuilding from scratch

1. **Provision a new box.** Install Docker + the Docker Compose plugin.
2. **Get the code onto it** — either `git clone` this repo, or re-run
   `deploy.yml` pointed at the new host (update the `DEPLOY_HOST` secret first).
3. **Recreate `docker/.env`** on the new box. This file is deliberately never
   committed or rsync'd by `deploy.yml`, so it has to be seeded again:
   - Copy `docker/.env.example`, fill in real values for `POSTGRES_PASSWORD`,
     `PAYLOAD_SECRET`, the `PS_*`/`POWERSYNC_JWT_*` vars, `R2_*` (media
     bucket), and `BACKUP_S3_*` (backup bucket) — pull the real values from
     wherever they're kept (a password manager, or re-run
     `provision-r2-env.yml`/`provision-backup-env.yml` once DNS points at
     the new box).
   - Also recreate `docker/Caddyfile`'s domain env vars (`API_DOMAIN`,
     `WEB_DOMAIN`, `POWERSYNC_DOMAIN`) if this box is the one terminating TLS
     directly (see `docker/README.md` for when that's/isn't the case, e.g.
     alongside pharmatrack's own Caddy).
4. **Bring up just the databases first**, so there's something to restore into:
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d postgres postgres-storage backup
   ```
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
7. **Verify**: `curl https://<API_DOMAIN>/admin` returns 200, log into the
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
