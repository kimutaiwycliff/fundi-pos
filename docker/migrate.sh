#!/usr/bin/env bash
# Applies any pending Payload migrations against the live database.
# Run by .github/workflows/deploy.yml, on the server, from the repo root
# (invoked as `bash docker/migrate.sh` after the workspace sync + build +
# health check steps).
#
# Deliberately NOT wired into payload.config.ts's prodMigrations
# (auto-run-on-boot) - see that file's own comment. This database's
# payload_migrations table carries a batch:-1 "dev push was used here"
# marker from however it was originally bootstrapped (before migrations
# became the strategy), and @payloadcms/drizzle's migrate() interactively
# confirms before proceeding whenever that row exists. The production
# container has no TTY to answer that prompt - wiring prodMigrations
# in-process hung the API entirely on boot (2026-08-31 incident: health
# check timed out, api.fundipos.co.ke stopped responding). Running it here
# instead, from CI, where a real answer can be piped in, sidesteps that
# permanently without needing to touch the marker itself.
#
# Runs in a disposable node:22-slim container with the repo bind-mounted
# (not built from apps/api's Dockerfile - targeting its builder stage would
# run the full Next.js production build, ~90s+, just for npm ci's side
# effect of installing the payload CLI; a plain `npm ci` here is simpler,
# predictable, and doesn't depend on the Dockerfile's stage structure),
# attached to the same Docker network as the live services. Never touches
# the running fundi-payload-api container itself.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=docker-fundi-payload-api-1

env_var() {
  docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep "^$1=" | cut -d= -f2-
}

DB_URI=$(env_var DATABASE_URI)
SECRET=$(env_var PAYLOAD_SECRET)
NET=$(docker inspect "$CONTAINER" --format '{{range $k, $v := .NetworkSettings.Networks}}{{println $k}}{{end}}' | head -1)

if [ -z "$DB_URI" ] || [ -z "$SECRET" ] || [ -z "$NET" ]; then
  echo "::error::Could not read DATABASE_URI/PAYLOAD_SECRET/network from $CONTAINER - is it running?"
  exit 1
fi

echo y | docker run --rm -i --network "$NET" \
  -v "$PWD":/repo -w /repo/apps/api \
  -e DATABASE_URI="$DB_URI" \
  -e PAYLOAD_SECRET="$SECRET" \
  -e NODE_ENV=development \
  node:22-slim bash -c "cd /repo && npm ci --no-audit --no-fund >/dev/null && cd apps/api && npx payload migrate"
