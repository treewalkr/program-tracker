## Review — Assessment A (design-director, OPERATE mode)

Method note: reviewed as an isolated design agent — full source read (app.css, layout, all 8 routes, 3 components, signals.ts, mock api/data) plus headless Playwright pass over all 9 routes at 1440×900 with interaction flows (generate→review→approve/reject, template delete, log empty-submit, one-click logging, cold-start client, archived program, mobile widths). No design detector run. Preview server stopped.

**Design-specificity verdict.** This is genuinely authored for strength coaching, not interchangeable SaaS. The vocabulary is fluent coach-speak end to end — RPE, e1RM, AMRAP, "accumulation", "deload → intensification", "band assistance drops one level", warm-up/backoff set typing, kg-first numerics in tabular mono. The mock AI rationale is the strongest specificity signal in the codebase: "Squat progressed 50→62.5kg over 8 weeks (e1RM now ~77kg)… Deadlift still finding its feet at 80kg×5@8" reads like a real coach's note, and the "Why this draft — for you" / "What the client reads" split is a product decision no generic tool would make. The chalk-and-iron system is restrained and coherent: warm paper bg, ink primary buttons, condensed headings, mono numerals, color reserved for status + the RPE scale (documented in app.css comments). Weak spots in specificity are peripheral, not structural: the "AI providers" panel on the dashboard (model registry = developer furniture), generic "Client / Program" crumb, and the dead Rpe color component that leaves the RPE-scale identity unrealized in the log table. An unrelated SaaS could not ship this unchanged.

**Heuristics (27/40 — top of Acceptable band)**

- Visibility of system status: 3/4 — skeletons on every route, generate step-ticker, "Saving…" states, `savedAt` timestamp; but Reject produces zero visible feedback and overview errors die in `console.error`.
- Match with real world: 4/4 — domain-fluent copy and natural order throughout; "Enter what Maya actually did" is exactly the trainer's mental model.
- User control and freedom: 2/4 — cancels on inline forms and signal snooze exist, but no undo anywhere, Reject is a dead-end, and there's no path to archive/deactivate a program.
- Consistency and standards: 3/4 — one disciplined system (panel/pill/btn/sheet); niggles: snooze offered on client page but not overview for the same signals, SetChips used everywhere except the program-detail edit view.
- Error prevention: 2/4 — disabled submits with real conditions and inline validation are good; but unconfirmed destructive deletes (template ×), approve-after-reject stays possible, archived program silently editable.
- Recognition over recall: 3/4 — options visible, last-session weights as placeholders, "Based on: Strength Base A (active, v3)" context; generic "Client" crumb and model-id provider labels lean on recall.
- Flexibility and efficiency: 3/4 — ⚡ one-click logging, Prefill, URL prefill handoff (`?tpl=&note=`), inline (non-modal) forms; no keyboard shortcuts or bulk actions.
- Aesthetic and minimalist: 3/4 — disciplined logbook restraint; program detail's always-on steppers (229 focusable elements) break the noise floor; providers panel clutters the dashboard.
- Error recovery: 2/4 — inline log error ("Enter at least one set — weight and reps.") is good; generate failure message is generic with no retry detail; overview failure is silent.
- Help and documentation: 2/4 — excellent task-contextual microcopy ("periodization signals — computed from logs, you decide"), but no help surface; tooltips are title-attr only.

**Cognitive load findings**

- `/programs/[id]` — worst offender: every set row permanently exposes reps/RPE/rest steppers; a 4-day program renders ~40 set-rows × 6 buttons = 229 focusable elements. Violates minimal-choices and noise-floor; the same data renders as calm chips on `/clients/[id]`.
- `/clients/[id]/generate` — 3 real decisions (provider, templates, note) — within limits — but each template chip carries an adjacent destructive ×, forcing a simultaneous toggle-vs-delete judgment (extraneous load, misclick risk).
- `/clients/[id]/log` — 9 rows × 3 inputs + energy + notes + session/date; dense but well-sequenced, with last-weight placeholders and a single accelerator. Fine at 3 exercises/session; will strain at 6–8.
- `/clients/[id]/programs/new` — three-level nesting (days → exercises → sets) with add/remove affordances at all three levels visible at once; mitigated by smart set defaults (8 reps @ RPE 8, 150s).
- `/` — good single-focus stacking (Needs review on top), but the AI-providers panel is a third simultaneous information group that serves no coach task.

**Emotional journey findings**

- Peak-end on generate→approve is genuinely strong: honest step ticker → rich rationale → diff → "Approved ✓" + "Open in builder / Back to client". The end of the approve flow is the best moment in the app.
- Reject is the valley and it's broken: `onclick={() => api.rejectGeneration(gen!.id)}` discards the result — pill stays "validated", Approve stays clickable (mock will still approve a rejected draft), no navigation, no undo. The user's last interaction memory of a rejected draft is "did that do anything?"
- Logging is reassured and low-friction: "Enter what Maya actually did", one-click path, success copy that ties effort to future value ("now counting toward history and the next AI draft").
- Destructive reassurance is absent where it matters: template delete (both the × in generate and Delete on /templates) fires instantly with no confirm and no undo (verified: zero dialogs, template vanished).
- Demo banner ("every number on screen is mock data. Nothing is saved.") is honest and prevents false attachment — good placement, unobtrusive.

**Strengths**

- Copy as interface: the two-audience draft review and the signal evidence lines ("2 of ~6 planned sessions logged since the block started") do explanatory work no icon set could.
- The signal → prefill handoff: dashboard signal deep-links into generate with the note pre-written and the right template auto-toggled — a genuinely thoughtful cross-screen accelerator.
- Logging defaults from data: last-time weights as placeholders, prefill, and one-click "Did it as prescribed" — built for the real rhythm of a training day.

**Priority issues**

1. **[P1] Reject flow has no consequence and no feedback** — `apps/web/src/routes/clients/[id]/generate/+page.svelte` (Reject button). Why: user can't tell if the draft was discarded, and the mock still allows approving a rejected generation — error prevention and status both fail at the emotional low point. Fix: capture the returned generation into state, flip pill to "rejected", disable Approve, replace buttons with "Discarded — draft again" + "Back to client"; ideally offer "Reject with note" that feeds the next attempt.
2. **[P1] Click-only table rows block keyboard/screen-reader access** — `tr.rowlink onclick` in `/` clients table, `/clients` table, `/clients/[id]` programs table (grep confirms zero tabindex/onkeydown/role in routes). Why: a coach tabbing through can see clients but cannot open any of them; the `→` cell advertises an affordance that doesn't exist for keyboard. Fix: render the name cell as a real `<a href>` (also restores middle-click/preload) and drop the row onclick, or add `tabindex=0` + Enter handler + `role="link"`.
3. **[P1] Unconfirmed destructive deletes, one adjacent to a toggle** — generate page `tpl-x` button flush against template chips; `/templates` Delete button. Why: standing rules ("Beginner — conservative caps") are the trainer's accumulated IP; a misclick in a selection row silently deletes one. Fix: remove × from the generate chip row entirely (manage only at /templates), and add a confirm or 5-second undo toast for Delete.
4. **[P2] Program detail is a control wall with no view/edit separation** — `/programs/[id]` renders 229 focusable elements of always-on steppers, identically for active, draft, and archived programs (verified: archived "Onboarding Intro" is fully editable with a live "Save changes" button). Why: reading a program — the more frequent task — is visually as heavy as editing it; editing an archived program is an unguarded dead end. Fix: default to the SetChips read view with an "Edit" toggle per session (progressive disclosure), and read-only + status-aware header for archived.
5. **[P2] Responsive collapse is broken** — `+layout.svelte` ≤860px rule hides `span:not(.nav-count)` but nav labels are bare text nodes: measured 39px-wide anchors showing "Exercise library" inside a 64px rail; and `/clients/[id]/log` at 390px overflows horizontally (546px scroll width) with no scroll wrapper. Why: any gym-floor phone use is degraded at exactly the moment logging happens. Fix: hide labels correctly (wrap in span or use a label class) and pair with icons or a bottom bar; wrap `table.sheet` in `overflow-x: auto`.

**Minor observations**

- `/programs/[id]` crumb is literal "Client / Program" — no client name (recall gap).
- Diff table lowercases exercise names ("back squat kept") vs "Back Squat" everywhere else (`generate/+page.svelte` key handling).
- Progress table shows "Chin-up 0kg" — bodyweight sets should render "—", not a 0 e1RM.
- Overview sub "Monday, week 13 of the training year." is hardcoded — will read as broken once real.
- After a successful save, "0/9 sets filled" counter resets and contradicts the success message above it.
- `--faint` (#8b9299) carries informative 13px copy at ~3:1 contrast — below AA.
- `lib/components/Rpe.svelte` is dead code; the functional RPE color scale exists only as a CSS comment.
- AI providers panel is settings-grade content on the coach's primary screen; nav count badge exists only on Clients (inconsistent).
- Focus treatment: default browser blue ring on links/nav vs `--focus` #2b6cb0 on inputs.
- Dates render US-format via `toLocaleDateString()` ("9/20/2026").
- No UI path to archive/pause programs or change client status (mock scope, but control-freedom debt).
- Overview `catch` swallows API errors to console — user sees a permanent skeleton-less empty table with no message.

**Questions for the trainer-user**

- When a draft is 80% right, do you reject-and-redraft with a sharper note, or fix the last 20% by hand? (The UI only offers approve-or-reject; there's no "edit this draft, then approve".)
- Are you logging each set live on the gym floor, or entering the whole session afterward from memory? (That decides whether one-click/prefill is the right primary, or a per-set "as prescribed" tap is.)
- Should "What the client reads" ever go to Maya automatically, or is copy-paste into your own messaging the permanent workflow?