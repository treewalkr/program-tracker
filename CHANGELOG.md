# What's new

## Unreleased

## v0.1.9 — 2026-11-09

### New
- Paste a client's training history from your notes and save it as past programmes and session logs — with undo.
- Admins can open any client read-only and see their active programme and this week.
- The all-clients list shows each client's programme and links straight to them.

### Fixed
- Deload weeks now lower the load index the way the deload rule says.
- Client dates in the admin directory show as calendar days, so the list loads.

## v0.1.8 — 2026-11-09

### New
- Admins get an all-clients page in the sidebar, and each trainer's client count links to their clients.

## v0.1.7 — 2026-11-09

### New
- A Vocabulary page for your exercise aliases, glossary and role labels.
- Pasted notes are read in your own shorthand, keeping loads, cues and circuit headers; new words from an import can be added to your glossary.
- Your personal exercise aliases are matched before the shared ones.

### Fixed
- Example programmes are picked on the client's goal, level and training days.
- Pattern balance counts hard sets.
- Leaving a programme with unsaved edits asks before closing, and discarding edits resets the phasing editor.

## v0.1.6 — 2026-11-08

### New
- Paste a programme from your notes on the new-programme page; exercises are matched to your catalog with a suggested role.
- Name your own exercise roles and rank them — drafts and new programmes order exercises by your ranks.
- Client basics: phone, experience, age, sex and size, plus 1RMs when you add a client. The AI takes them into account.
- Edit progression rules in the draft block plan editor.

### Fixed
- Pressing deload a second time undoes it instead of deloading twice.
- Stalls compare %1RM prescriptions correctly.
- Holds swapped into a timed slot are read as seconds.
- Moving a session to another weekday shows up in the programme changes.

## v0.1.5 — 2026-11-08

- Maintenance and reliability updates.

## v0.1.4 — 2026-11-08

### New
- Prescribe sets as %1RM, RPE ranges, RIR, tempo or AMRAP with a stop RPE; loads resolve from each client's 1RMs.
- Set per-week progression rules and preview them before applying.
- Client run days and long-run day: cardio is placed around key runs and heavy lower days, and the AI suggests weekdays that follow the same rules.
- Client email is now optional, and a half-filled new-client form is kept if you leave the page.
- Updated movement patterns and muscle groups, with kinetic-chain defaults rebuilt on the sling model.
- The theme picker moved into Settings, and the sidebar opens and closes smoothly.

### Fixed
- Deload weeks are described and applied the same way everywhere.
- 1RM dates no longer shift when you save again.
- Chain counts are labelled as sets touching each chain, not a balance score.

## v0.1.3 — 2026-11-08

### New
- Phone-friendly session logger: skip a set, add an extra set, swap an exercise and see last time's numbers per slot.
- Tap a block pulse cell to see the sets behind it and the top lift.
- The AI cites each client's dated training log when it drafts and answers questions.
- Coaching rules: leave a note on a draft or chat reply, and confirmed rules are applied in every future draft.
- Chat proposals can change cardio sessions, and a built draft keeps only the proposed changes, listing what stayed as before.
- A fuller draft diff covering rep ranges, loads, sessions, cardio and the block plan.
- DeepSeek Flash is the default model.

### Fixed
- Signals are fairer: cardio behind, adherence, RPE creep and stall are judged by block week and pro-rated from the start date.
- Signals show on a client's page even without a programme.
- Block pulse counts back-off sets and keeps timed holds out of tonnage and e1RM.
- Today's date and the log window use your local calendar day.
- Thai text uses a matching typeface.

## v0.1.2 — 2026-11-07

### New
- Dark theme, with a system / light / dark switch.
- Thumbs up or down, reasons and notes on AI replies, drafts and messages.
- Email preferences in Settings, with one-click unsubscribe.

### Fixed
- Programme rows fit narrow columns beside the sidebar.

## v0.1.1 — 2026-11-07

### New
- The client chat keeps unsent text and your last model choice; Return adds a line and Cmd/Ctrl+Return sends.
- Collapse the sidebar to an icon rail.
- Settings › About shows the app and server versions.

### Fixed
- The model picker closes when you tap outside it.
- The chat composer fits the narrow draft column.

## v0.1.0 — 2026-11-07

### New
- First release.
- Clients with a training schedule, cardio target and coaching context.
- Programme builder: week-by-week lifting and cardio sessions, phasing (base, volume, intensity, deload, transition) and weekly targets.
- AI drafts the next block with its reasoning and a diff against the current one — nothing goes live until you approve and activate it.
- Revise a draft with your feedback, or ask the client chat to propose changes beside a live preview.
- Log lifting and cardio sessions as clients report back.
- Block pulse: tonnage, sets, average RPE and best e1RM per week, each traceable to logged sets.
- Needs-review signals — block ending, deload due, RPE creep, stall, adherence, cardio behind — with snooze.
- Exercise catalog with movement patterns, pattern balance and kinetic-chain balance.
- AI-drafted client messages you approve and copy in one tap.
