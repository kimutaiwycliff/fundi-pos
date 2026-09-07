#!/bin/sh
# pg_dump-to-object-storage backup cron (build plan Phase 9, target 3).
# The pg_dump/gzip/rotation steps AND a full restore (via restore.sh) have
# been verified end-to-end against a real copy of this project's schema and
# data - see docker/RESTORE.md. The one piece still unverified in this
# environment is the actual R2 network round-trip (upload here, download in
# restore.sh --latest), since that needs real object-storage credentials
# this environment doesn't have. Requires `aws-cli` in the running container
# (see the backup service's image in docker-compose.prod.yml) and an
# S3-compatible bucket (AWS S3, or any provider speaking the S3 API, e.g.
# a Kenyan/regional provider) configured via the BACKUP_S3_*/AWS_* env vars
# below (see docker-compose.prod.yml's backup service for how BACKUP_S3_*
# maps into the AWS_* names aws-cli actually reads).
set -eu

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="pos_saas-${TIMESTAMP}.sql.gz"
LOCAL_PATH="/backups/${FILENAME}"

# --clean --if-exists makes every dump self-contained and safely restorable
# into either an empty database or one that already has the schema (drops
# each object right before recreating it) - restore.sh relies on this.
pg_dump --clean --if-exists "${DATABASE_URI}" | gzip > "${LOCAL_PATH}"
echo "Wrote ${LOCAL_PATH}"

# Keep the last 14 local dumps regardless of upload success, so a restore
# is still possible from the VPS itself if object storage is unreachable.
find /backups -name '*.sql.gz' -mtime +14 -delete

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  aws s3 cp "${LOCAL_PATH}" "s3://${BACKUP_S3_BUCKET}/${FILENAME}" --endpoint-url "${BACKUP_S3_ENDPOINT:-}"
  echo "Uploaded to s3://${BACKUP_S3_BUCKET}/${FILENAME}"
else
  echo "BACKUP_S3_BUCKET not set - dump kept locally only, not uploaded."
fi
