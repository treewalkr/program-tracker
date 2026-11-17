#!/usr/bin/env bash
# Cloudflare Worker helpers (env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID); run from anywhere.
#   worker.sh version                 prints the version id serving most traffic now
#   worker.sh rollback <id> <message> make that version the live one (non-interactive)
set -euo pipefail
cd "$(dirname "$0")/../../apps/web"

case "${1:-}" in
  version)
    bunx wrangler@4 deployments status --json | jq -er '.versions | max_by(.percentage) | .version_id'
    ;;
  rollback)
    id=${2:?usage: worker.sh rollback <version-id> <message>}
    msg=${3:-rollback}
    # wrangler caps the message at 120 characters
    bunx wrangler@4 rollback "$id" --yes --message "${msg:0:120}"
    ;;
  *)
    echo "usage: worker.sh version|rollback ..." >&2
    exit 2
    ;;
esac
