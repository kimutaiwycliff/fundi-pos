#!/usr/bin/env bash
# One-off: seeds the initial blog Posts against the live database. Mirrors
# migrate.sh's exact pattern (disposable node:22-slim container, same
# network, DATABASE_URI/PAYLOAD_SECRET read off the running
# fundi-payload-api container) - see that script's own comment for why this
# shape (not prodMigrations, not run inside the live container). Safe to
# re-run: seed-posts.ts skips any post whose slug already exists.
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

docker run --rm -i --network "$NET" \
  -v "$PWD":/repo -w /repo/apps/api \
  -e DATABASE_URI="$DB_URI" \
  -e PAYLOAD_SECRET="$SECRET" \
  -e NODE_ENV=development \
  node:22-slim bash -c "cd /repo && npm ci --no-audit --no-fund >/dev/null && cd apps/api && npx payload run ./src/seed-posts.ts"
