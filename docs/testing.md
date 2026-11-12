# Tests

```bash
bun run db:up         # postgres via docker compose
bun run test          # all workspaces
cd apps/api && bun test   # api suite only
```

DB-backed api tests (`apps/api/src/e2e.test.ts`, the opt-in `deepseek.live.test.ts`) run
against a dedicated `program_tracker_test` database on the compose Postgres
(`localhost:5433`). It is created, migrated, truncated and reseeded with fixture
exercises automatically at the start of every api test run — the live
`program_tracker` database is never touched, and tests refuse to start against any
database whose name does not end in `_test`.

Point at another test database with `TEST_DATABASE_URL` (the name must still end in
`_test`), e.g. `TEST_DATABASE_URL=postgres://user:pass@host:5432/my_db_test`.

When Postgres is down, the DB-backed tests are skipped; pure unit tests still run.
