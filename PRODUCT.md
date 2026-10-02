# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a personal trainer or S&C coach running their own book of clients (solo professional, ~5–30 clients). They open the app daily to see who trained, weekly to review each client's progress and adjust programming, and per-block (~every 4–8 weeks) to write the next training block. Secondary audience (confirmed positioning decision): **other trainers as SaaS buyers** — the product is built to be sold to trainers as a professional tool, not to athletes directly.

## Product Purpose

A trainer's operating system for periodized strength programming: manage clients, write (or AI-draft) multi-week training programs, log what clients actually did, and watch each client's "block pulse" (tonnage, sets, average RPE, best e1RM per week) to decide what the next block should be. Success = the trainer makes better programming decisions faster than in a spreadsheet, and trusts every number on screen because it is derived from logged sessions.

## Positioning

The AI never touches anything the client sees: AI drafts a full next block with trainer-facing rationale and a diff against the current program, but it becomes real only when the trainer reviews and approves it — and even then it lands as a draft the trainer can edit before activating. Evidence-first periodization: signal cards ("block ending", "RPE creep") cite the logged data behind them. That human-in-the-loop authorship plus traceable numbers is the claim a generic AI fitness app could not truthfully copy.

## Operating Context

- Weekly rhythm: Overview dashboard → needs-review signals → client detail → approve/draft next block → log sessions as clients report back.
- Programs are versioned per client (version counter; latest active, previous archived) with week-by-week periodization directives (base / +volume / +intensity / deload / transition).
- Sessions prescribe sets per exercise (reps, kg, RPE, rest); logging captures actual kg/reps/RPE per set plus perceived energy.
- Multiple AI providers (Z.ai GLM models today) configurable in-app; generation takes minutes and runs server-side.
- Demo/mock mode exists for sales and evaluation (every number mock).

## Capabilities and Constraints

- Confirmed: clients CRUD, manual program builder, AI generate→validate→review→approve/reject flow, session logging, block-pulse metrics, needs-review signals with snooze, instruction templates, exercise catalog (demo subset; real seed holds 719 from WGER), provider/model picker.
- Constraints: SvelteKit 2 + Svelte 5 runes SPA frontend, ElysiaJS/Bun API (Eden Treaty end-to-end), Drizzle + Postgres, zod-gated payloads. Monorepo: apps/web, apps/api, packages/db, packages/shared.
- Explicitly deferred: freestyle (non-prescribed) logging; generation history UI beyond the live flow.
- Program versioning is overwrite-in-place with a counter (no history browsing); periodization phasing edits are API-only today.

## Brand Commitments

- Name: Program Tracker (brand mark "PT").
- Voice: precise, evidence-citing, coach-like; never hype. UI copy states what data shows and what an action does.
- Binding visual constraint (user-pinned 2026-10-02): the app's UI follows the "Primer" direction — GitHub's design language as realized in `prototypes/direction-g.html`, chosen by the user from an eight-direction prototype field. Expansion of this constraint lives in the surface brief and DESIGN.md, not here.

## Evidence on Hand

- `prototypes/` — eight fully-built HTML design directions + chooser (direction G "Primer" selected by the user; identical content across all).
- `apps/web` — working production frontend (9 routes) with mock/live modes; current "chalk & iron" theme is the incumbent being replaced.
- `docs/` + `/openapi` Scalar UI — API documentation.
- No PRODUCT.md/DESIGN.md existed before this file; no customer testimonials, pricing, or commercial claims exist — future work must not fabricate them.

## Product Principles

1. The trainer is the editor-in-chief: AI proposes, evidence supports, the human approves — nothing reaches a client without explicit trainer authorship.
2. Every number is traceable to logged work; a metric with no provenance doesn't ship.
3. Sell to trainers as a professional instrument: credibility, density, and craft over athletic-consumer aesthetics.
4. Decisions surface themselves — signals bring the block-pulse evidence to the trainer; the trainer shouldn't have to dig for the next decision.

## Accessibility & Inclusion

No product-specific standard established yet; the Primer system's contrast-tuned palette (GitHub's public color scales) is treated as the floor, verified with the design detector before shipping.
