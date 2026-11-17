#!/usr/bin/env bash
# Render API helpers for the deploy and rollback workflows (env: RENDER_API_KEY, RENDER_SERVICE_ID).
#   render.sh deploy <sha>      build and deploy that commit; prints the deploy id
#   render.sh wait <deploy-id>  poll until live (15 min max). Exit 0 live; 3 the build failed
#                               (the old instance keeps serving); 1 any other failure
#   render.sh live              prints "<deploy-id> <commit-sha>" of the deploy serving now
#   render.sh rollback <id>     roll back to an earlier deploy (reuses its image, no rebuild);
#                               prints the new deploy id — then `wait` on it
#   render.sh find <sha>        prints the newest deploy of that commit that built (live or
#                               deactivated), or nothing if none of the last 100 did
# Progress goes to stderr so stdout stays a clean value for $(...).
set -euo pipefail
: "${RENDER_API_KEY:?RENDER_API_KEY is required}" "${RENDER_SERVICE_ID:?RENDER_SERVICE_ID is required}"
api="${RENDER_API_BASE:-https://api.render.com/v1}/services/$RENDER_SERVICE_ID"  # base overridable for local tests

get() { curl -fsS --retry 3 --max-time 30 -H "Authorization: Bearer $RENDER_API_KEY" -H "accept: application/json" "$api$1"; }
# No --retry on POST: a retried deploy could run twice.
post() { curl -fsS --max-time 30 -X POST -H "Authorization: Bearer $RENDER_API_KEY" -H "content-type: application/json" "$api$1" -d "$2"; }

cmd=${1:-}
case "$cmd" in
  deploy)
    sha=${2:?usage: render.sh deploy <sha>}
    id=$(post /deploys "$(jq -nc --arg c "$sha" '{commitId: $c}')" | jq -r .id)
    echo "render deploy $id for $sha" >&2
    echo "$id"
    ;;
  wait)
    id=${2:?usage: render.sh wait <deploy-id>}
    for _ in $(seq 1 60); do
      status=$(get "/deploys/$id" | jq -r .status)
      echo "render $id: $status" >&2
      case "$status" in
        live) exit 0 ;;
        build_failed|pre_deploy_failed) exit 3 ;;
        update_failed|canceled|deactivated) exit 1 ;;
      esac
      sleep "${RENDER_POLL_SECONDS:-15}"
    done
    echo "render $id: not live after 15 min, cancelling it" >&2
    post "/deploys/$id/cancel" '{}' >/dev/null || true
    exit 1
    ;;
  live)
    get "/deploys?limit=20" | jq -er '[.[].deploy | select(.status == "live")][0] | "\(.id) \(.commit.id)"'
    ;;
  rollback)
    to=${2:?usage: render.sh rollback <deploy-id>}
    id=$(post /rollback "$(jq -nc --arg d "$to" '{deployId: $d}')" | jq -r .id)
    echo "render rollback $id to $to" >&2
    echo "$id"
    ;;
  find)
    sha=${2:?usage: render.sh find <sha>}
    get "/deploys?limit=100" | jq -r --arg c "$sha" \
      '[.[].deploy | select(.commit.id == $c and (.status == "live" or .status == "deactivated"))][0].id // empty'
    ;;
  *)
    echo "usage: render.sh deploy|wait|live|rollback|find ..." >&2
    exit 2
    ;;
esac
