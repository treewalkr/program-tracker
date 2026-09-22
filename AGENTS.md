## End-to-End Type Safety

- **Always use [Eden Treaty](https://elysiajs.com/eden/treaty/overview)** as the frontend → backend client — types flow from the Elysia app's type to the SvelteKit frontend; never hand-write fetch clients or duplicate API types

## Code Style

- Svelte 5 runes syntax only — never legacy stores or `$:` reactive statements
- Follow Elysia best practices and ergonomics (see the `/elysia` skill)

## Commits

- **Commit often** — small, frequent commits after each meaningful change
- **Short messages** — one concise subject line (e.g. `add API playground page`)
- **No body** — subject line only, never add a body
- **No co-author** — never add `Co-Authored-By` or similar trailers

## Skills Reference

- **`/elysia`** — Elysia APIs, patterns, and best practices; consult when implementing or reviewing API code instead of guessing
- **`svelte5-best-practices`** — Svelte 5 runes, snippets, and SvelteKit patterns; consult when writing or reviewing Svelte components
- **`impeccable`** — UI design and polish; consult to avoid generic "AI slop" design — every screen must feel intentional and bespoke (design direction in `BRIEF.md`)
