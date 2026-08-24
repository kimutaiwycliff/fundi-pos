#!/bin/sh
# pg_dump-to-object-storage backup cron (build plan Phase 9, target 3).
# UNVERIFIED end-to-end - the pg_dump/gzip/rotation steps ran successfully
# against this project's own dockerized Postgres, but the final upload
# step needs real object-storage credentials this environment doesn't have,
# so that step is untested. Requires `aws-cli` in the running container
# (see the backup service's image in docker-compose.prod.yml) and an
# S3-compatible bucket (AWS S3, or any provider speaking the S3 API, e.g.
# a Kenyan/regional provider) configured via the AWS_* env vars below.
set -eu

TIMESTAMP=$(date +%Y%m%d-%H%M%S)
FILENAME="pos_saas-${TIMESTAMP}.sql.gz"
LOCAL_PATH="/backups/${FILENAME}"

pg_dump "${DATABASE_URI}" | gzip > "${LOCAL_PATH}"
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
