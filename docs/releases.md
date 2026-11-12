# Releases

Versions stay on `0.1.x` until the app is stable. Each deploy is a patch bump.
The build ID is the version plus the commit, e.g. `0.1.3+42a93f5`. It shows in
the sidebar footer, `GET /health` (`build`) and every feedback item.

1. `bun run release`: bumps every package.json (`0.1.3` → `0.1.4`), commits
   `chore: release v0.1.4`, and tags `v0.1.4` with notes from the `feat:`/`fix:` commits.
   Use `bun run release 0.2.0` for an explicit version, or `--current` to tag the
   current version without a bump. It never pushes.
2. `git push --follow-tags origin main` is the deploy. CI runs the tests, migrates
   Supabase, deploys the web Worker, then the API on Render, in that order
   (`.github/workflows/ci.yml`).
