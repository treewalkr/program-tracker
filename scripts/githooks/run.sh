#!/bin/sh
# Shared by the hook shims: run scripts/guards/<hook>.ts with bun. Not itself a hook.
#   - CI owns the checks there (scripts/guards/verify-range.ts), so every hook is a no-op.
#   - No bun on PATH (a git GUI with a thin PATH): say so and let the commit through rather than block on tooling.
hook=$1
shift
[ -n "$CI" ] && exit 0
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  echo "guards: bun not found on PATH; $hook guard skipped" >&2
  exit 0
fi
exec bun "$(dirname "$0")/../guards/$hook.ts" "$@"
