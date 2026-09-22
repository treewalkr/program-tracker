# Assessment A — Design-director review (progress log)

Target: apps/web/src (SvelteKit SPA, chalk-and-iron). Mode: OPERATE.
Method: full read of app.css, +layout.svelte, all 8 route pages, 3 components, signals.ts, mock data/api; headless Playwright (chromium 1440x900) over all 9 routes + interaction flows; preview on :4174 (stopped after run).

## Checked
- Files: app.css, +layout.svelte, routes: /, /clients, /clients/[id], /generate, /log, /programs/new, /programs/[id], /templates, /exercises. Components: StatusPill, SetChips, Rpe. lib/signals.ts, lib/api/mock/{data,api}.ts.
- Live: inner_text + focusable counts + headings for every route; generate→review→approve and reject flows; templates delete (no confirm); log empty-submit error; one-click "Did it as prescribed"; archived program page; paused client (Priya) + cold-start generate; mobile 700px sidebar + 390px log table overflow; first-tab focus ring.
- No design detector run (per instructions). Design judgment only.

## Key findings (evidence-backed)
1. P1 Reject is a dead-end/no-op visually: generate/+page.svelte `onclick={() => api.rejectGeneration(gen!.id)}` discards result — pill stays "validated", Approve stays enabled (mock still allows approve-after-reject). No nav/undo/feedback.
2. P1 Table row links are click-only (`tr.rowlink onclick`) — no tabindex/keydown/role anywhere (grep: zero hits). Keyboard + screen-reader cannot open clients/programs.
3. P1 Destructive "×" delete sits flush against template toggle chips in generate form; templates page Delete has zero confirmation; generate tpl delete no confirm (dialog count 0 in test).
4. P2 /programs/[id] crumb is literal "Client / Program" (no client name) — recognition/recall gap.
5. P2 ≤860px sidebar collapse fails: nav labels are text nodes, `display:none` targets spans; measured 39px-wide anchors with "Exercise library" inside 64px rail. 390px log table overflows (546>390) with no scroll wrapper.
6. P2 Rpe.svelte (functional RPE color) is dead code — logged RPE rendered uncolored; "color is functional" claim in app.css unrealized.
7. P3 Diff table lowercases exercise names ("back squat kept" vs "Back Squat"). Chin-up e1RM shows "0kg". Overview sub "Monday, week 13…" hardcoded. Post-save "0/9 sets filled" counter contradicts success toast.
8. --faint (#8b9299) used for informative text ~3:1 contrast — AA fail for 13px copy.

## Strengths
- Coach-voice copy throughout: rationale mock ("Squat progressed 50→62.5kg… band assistance drops one level", "Deadlift still finding its feet"), "Enter what Maya actually did", "Nothing goes live — the draft waits for your review".
- Two-audience draft review ("Why this draft — for you" / "What the client reads") + Changes-vs-current diff.
- ⚡ one-click logging + prefill defaults from last session.

Status: COMPLETE — final report returned in chat. Preview server stopped.
