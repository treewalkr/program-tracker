#!/usr/bin/env bash
# Post-deploy smoke tests, retried for ~2 min while Render/Cloudflare swap over.
#   smoke.sh api <sha>   $API_ORIGIN/health is 200 and its build is <version>+<short sha>
#   smoke.sh site <sha>  $SITE_URL/ is 200, /v1/meta reports the same build (through the
#                        Worker proxy), and signed-out /v1/auth/me is a 401 JSON, not a 5xx
set -euo pipefail
target=${1:?usage: smoke.sh api|site <sha>}
sha=${2:?usage: smoke.sh api|site <sha>}
short=${sha:0:7}
tries=${SMOKE_TRIES:-12}
delay=${SMOKE_DELAY:-10}

# Each check prints why it failed and returns 1 (errexit is off inside `if`, so return explicitly).
has_build() { # <url>
  local build
  build=$(curl -fsS --max-time 60 "$1" | jq -r .build) || { echo "  $1: request failed"; return 1; }
  [[ $build == *"+$short" ]] || { echo "  $1: build $build, want +$short"; return 1; }
}

check_api() {
  : "${API_ORIGIN:?API_ORIGIN is required}"
  has_build "$API_ORIGIN/health"
}

check_site() {
  : "${SITE_URL:?SITE_URL is required}"
  local code body
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "$SITE_URL/") || code=000
  [[ $code == 200 ]] || { echo "  $SITE_URL/: HTTP $code"; return 1; }
  has_build "$SITE_URL/v1/meta" || return 1
  body=$(mktemp)
  code=$(curl -s -o "$body" -w '%{http_code}' --max-time 60 "$SITE_URL/v1/auth/me") || code=000
  if [[ $code != 401 ]] || ! jq -e . "$body" >/dev/null 2>&1; then
    echo "  $SITE_URL/v1/auth/me: HTTP $code, body $(head -c 200 "$body")"
    rm -f "$body"
    return 1
  fi
  rm -f "$body"
}

run_check() {
  case "$target" in
    api) check_api ;;
    site) check_site ;;
  esac
}
[[ $target == api || $target == site ]] || { echo "usage: smoke.sh api|site <sha>" >&2; exit 2; }

for i in $(seq 1 "$tries"); do
  if run_check; then
    echo "smoke $target ok (build +$short)"
    exit 0
  fi
  echo "smoke $target: attempt $i/$tries failed"
  [[ $i == "$tries" ]] || sleep "$delay"
done
echo "::error::smoke test ($target) failed: expected build +$short"
exit 1
