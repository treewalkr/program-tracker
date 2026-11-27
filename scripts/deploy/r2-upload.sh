#!/usr/bin/env bash
# Copy an encrypted backup to the private R2 bucket (S3 API, the runner's aws CLI).
#   R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... CLOUDFLARE_ACCOUNT_ID=... \
#     scripts/deploy/r2-upload.sh <file.dump.age> <prefix>   # prefix: nightly | deploy
# The key can only write to this bucket; the bucket's lifecycle rules expire old copies.
set -euo pipefail

file=${1:?usage: r2-upload.sh <file> <prefix>}
prefix=${2:?usage: r2-upload.sh <file> <prefix>}
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is required}"
bucket=${R2_BACKUP_BUCKET:-pt-db-backups}

AWS_ACCESS_KEY_ID=$R2_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY=$R2_SECRET_ACCESS_KEY AWS_DEFAULT_REGION=auto \
  aws s3 cp "$file" "s3://$bucket/$prefix/$(basename "$file")" \
  --endpoint-url "https://$CLOUDFLARE_ACCOUNT_ID.r2.cloudflarestorage.com" --only-show-errors
echo "copied to R2: $bucket/$prefix/$(basename "$file")"
