#!/bin/sh
# Companion to backup.sh - restores a pg_dump produced by that script back
# into a target Postgres. Destructive to the target DB by design (a restore
# is meant to replace whatever's there), so it refuses to run without an
# explicit --yes unless stdin is a terminal it can prompt on.
#
# Usage:
#   sh restore.sh --latest [--yes]            # pull the newest dump from
#                                              # BACKUP_S3_BUCKET, or fall
#                                              # back to the newest local
#                                              # /backups/*.sql.gz if the
#                                              # bucket isn't reachable/set
#   sh restore.sh /backups/pos_saas-....sql.gz [--yes]
#   sh restore.sh s3://bucket/pos_saas-....sql.gz [--yes]
#
# Requires the same env as backup.sh: DATABASE_URI (the TARGET to restore
# into), plus BACKUP_S3_* / AWS_* only if pulling from object storage.
set -eu

SOURCE=""
ASSUME_YES=0
for arg in "$@"; do
  case "$arg" in
    --yes) ASSUME_YES=1 ;;
    --latest) SOURCE="--latest" ;;
    *) SOURCE="$arg" ;;
  esac
done

if [ -z "$SOURCE" ]; then
  echo "Usage: sh restore.sh (--latest | /path/to/dump.sql.gz | s3://bucket/key) [--yes]" >&2
  exit 1
fi

WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT
LOCAL_DUMP="$WORKDIR/restore.sql.gz"

if [ "$SOURCE" = "--latest" ]; then
  if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
    LATEST_KEY=$(aws s3 ls "s3://${BACKUP_S3_BUCKET}/" --endpoint-url "${BACKUP_S3_ENDPOINT:-}" \
      | awk '{print $4}' | grep '\.sql\.gz$' | sort | tail -n1 || true)
    if [ -n "$LATEST_KEY" ]; then
      echo "Fetching s3://${BACKUP_S3_BUCKET}/${LATEST_KEY}"
      aws s3 cp "s3://${BACKUP_S3_BUCKET}/${LATEST_KEY}" "$LOCAL_DUMP" --endpoint-url "${BACKUP_S3_ENDPOINT:-}"
    fi
  fi
  if [ ! -s "$LOCAL_DUMP" ]; then
    LATEST_LOCAL=$(find /backups -name '*.sql.gz' 2>/dev/null | sort | tail -n1 || true)
    if [ -z "$LATEST_LOCAL" ]; then
      echo "No dump found in s3://${BACKUP_S3_BUCKET:-<unset>}/ or /backups - nothing to restore from." >&2
      exit 1
    fi
    echo "Using local dump ${LATEST_LOCAL}"
    cp "$LATEST_LOCAL" "$LOCAL_DUMP"
  fi
elif [ "${SOURCE#s3://}" != "$SOURCE" ]; then
  echo "Fetching ${SOURCE}"
  aws s3 cp "$SOURCE" "$LOCAL_DUMP" --endpoint-url "${BACKUP_S3_ENDPOINT:-}"
else
  [ -f "$SOURCE" ] || { echo "No such file: ${SOURCE}" >&2; exit 1; }
  cp "$SOURCE" "$LOCAL_DUMP"
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'This will DROP and recreate every table currently in the target database, then load %s\n' "$LOCAL_DUMP"
  printf 'Target: %s\n' "${DATABASE_URI}"
  printf 'Type "yes" to continue: '
  read -r CONFIRM
  [ "$CONFIRM" = "yes" ] || { echo "Aborted."; exit 1; }
fi

gunzip -c "$LOCAL_DUMP" | psql "${DATABASE_URI}" -v ON_ERROR_STOP=1
echo "Restore complete."
