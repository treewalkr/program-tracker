#!/usr/bin/env bash
# Encrypted backup of the app's schemas (public + drizzle) before migrating.
#   DATABASE_URL=... scripts/deploy/db-backup.sh <out.dump.age>
# pg_dump runs in the postgres:17 image (matches Supabase 17; the runner's client is
# older) and streams straight into age, so the plaintext dump never touches disk or
# logs — the repo is public and the file becomes a workflow artifact. Only the
# owner's private key (see .github/backup-age.pub) can decrypt it.
set -euo pipefail

out=${1:?usage: db-backup.sh <out.dump.age>}
: "${DATABASE_URL:?DATABASE_URL is required}"
pub=${BACKUP_AGE_PUB:-.github/backup-age.pub}
image=${PG_IMAGE:-postgres:17}

trap 'rm -f "$out"' ERR

# DATABASE_URL reaches the container via -e NAME, so it isn't in any command line.
docker run --rm -i --network host -e DATABASE_URL "$image" \
  sh -c 'exec pg_dump --dbname="$DATABASE_URL" --schema=public --schema=drizzle --format=custom --no-owner --no-privileges' \
  | age -r "$(cat "$pub")" -o "$out"

# A custom-format dump of a real schema is never this small; treat it as a failed dump.
size=$(wc -c < "$out" | tr -d ' ')
if [ "$size" -lt 1024 ]; then
  echo "backup is only $size bytes — refusing to continue" >&2
  rm -f "$out"
  exit 1
fi
echo "encrypted backup: $out ($size bytes)"
