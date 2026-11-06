# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary user: a personal trainer or S&C coach running their own book of clients (solo professional, ~5–30 clients). They open the app daily to see who trained, weekly to review each client's progress and adjust programming, and per-block (~every 4–8 weeks) to write the next training block. Secondary audience (confirmed positioning decision): **other trainers as SaaS buyers** — the product is built to be sold to trainers as a professional tool, not to athletes directly.

## Product Purpose

A trainer's operating system for periodized strength programming: manage clients, write (or AI-draft) multi-week training programs, log what clients actually did, and watch each client's "block pulse" (tonnage, sets, average RPE, best e1RM per week) to decide what the next block should be. Programs cover strength and cardio together: each week holds lifting and cardio sessions with quantified weekly targets. Success = the trainer makes better programming decisions faster than in a spreadsheet, and trusts every number on screen because it is derived from logged sessions.

## Positioning

The AI never touches anything the client sees: AI drafts a full next block with trainer-facing rationale and a diff against the current program, but it becomes real only when the trainer reviews and approves it — and even then it lands as a draft the trainer can edit before activating. The same rule covers client-facing text: AI-drafted client messages are approved by the trainer and sent by the trainer, never by the system. Evidence-first periodization: signal cards ("block ending", "RPE creep", "stall", "cardio behind") cite the logged data behind them. That human-in-the-loop authorship plus traceable numbers is the claim a generic AI fitness app could not truthfully copy.

## Operating Context

- Weekly rhythm: Overview ("This week") → needs-review signals → client detail → draft, revise and approve the next block → log sessions as clients report back.
- Programs are week documents: each week holds sessions (lifting or cardio) placed on weekdays by a rule-based placer from the client's schedule, plus quantified week targets. Periodization runs week by week (base / +volume / +intensity / deload / transition) with a program direction.
- Lifting sessions prescribe sets per exercise (reps, kg, RPE, rest; exercises carry a role); logging captures actual kg/reps/RPE per set plus perceived energy. Cardio sessions log against a per-client weekly cardio target.
- Programs are versioned per client (version counter; latest active, previous archived). Before approval, a draft has its own version history: each revision, chat-applied change or manual block-plan edit becomes a new draft version with a diff against the previous one.
- AI providers are configurable in-app (Z.ai GLM and DeepSeek models today, with per-model effort settings). Generation runs server-side, takes minutes, and can be resumed after leaving the page or cancelled.
- Demo/mock mode (the default web mode) runs on in-memory demo data for sales and evaluation (every number mock); live mode talks to the API.

## Capabilities and Constraints

- Confirmed:
  - Clients: CRUD, with a profile that holds a training schedule, cardio target, AI context sections and editable identity.
  - Programs: manual builder; program page with inline session editing, phasing/block-plan editor, direction editing and a week switcher.
  - AI drafting: generate → validate → review → approve/reject; revise a draft with trainer feedback; a client chat page that answers questions about the client and proposes draft changes beside a live preview.
  - Learning loop: trainer feedback is distilled into learned preferences, and programs marked as examples are retrieved into generation prompts. Both are browsable and editable.
  - Client messages: AI drafts a message, the trainer approves it, then copies it in one tap.
  - Logging and evidence: lifting and cardio session logging, block-pulse metrics (tonnage, sets, avg RPE, best e1RM, week targets), and needs-review signals with snooze. Signal kinds: block ending, deload week, transition due, week ending, RPE creep, stall, off-plan, adherence and cardio behind.
  - Exercise catalog: seeded from WGER plus trainer-custom exercises, with movement-pattern taxonomy, pattern balance and kinetic-chain balance (chain map editable in settings).
  - Also: instruction templates and the provider/model picker.
- Constraints: SvelteKit 2 + Svelte 5 runes SPA frontend, ElysiaJS/Bun API (Eden Treaty end-to-end), Drizzle + Postgres, zod-gated payloads. Monorepo: apps/web, apps/api, packages/db, packages/shared.
- Explicitly deferred: freestyle (non-prescribed) logging in the UI (the API already accepts a log with no program session); browsing version history of approved programs (only draft versions are browsable).

## Brand Commitments

- Name: Program Tracker (brand mark "PT").
- Voice: precise, evidence-citing, coach-like; never hype. UI copy states what data shows and what an action does.
- Binding visual constraint (user-pinned 2026-10-02): the app's UI follows the "Primer" direction — GitHub's design language as realized in `prototypes/direction-g.html`, chosen by the user from an eight-direction prototype field. Expansion of this constraint lives in the surface brief and DESIGN.md, not here.

## Evidence on Hand

- `prototypes/`: eight fully-built HTML design directions plus a chooser (direction G "Primer" selected by the user; identical content across all).
- `apps/web`: working production frontend (13 pages) in the Primer system, with mock/live modes and a Storybook of UI and domain components; `apps/web/DESIGN.md` records the design system.
- `docs/` (architecture, domain model, API, AI integration, notifications, roadmap) + `/openapi` Scalar UI: API documentation.
- No customer testimonials, pricing, or commercial claims exist; future work must not fabricate them.

## Product Principles

1. The trainer is the editor-in-chief: AI proposes, evidence supports, the human approves — nothing reaches a client without explicit trainer authorship.
2. Every number is traceable to logged work; a metric with no provenance doesn't ship.
3. Sell to trainers as a professional instrument: credibility, density, and craft over athletic-consumer aesthetics.
4. Decisions surface themselves — signals bring the block-pulse evidence to the trainer; the trainer shouldn't have to dig for the next decision.

## Accessibility & Inclusion

No product-specific standard established yet; the Primer system's contrast-tuned palette (GitHub's public color scales) is treated as the floor, verified with the design detector before shipping.
