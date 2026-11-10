# What's new

## Unreleased

## v0.1.15 — 2026-11-10

### New
- Supersets and circuits. In the program editor, click "Superset with next" to pair exercises. They show as A1/A2 with one rounds count for the group. Change it once and every exercise in the group follows.
- Supersets show as a group on the program page, client page and AI draft review.
- Logging a superset goes round by round on one card: A1, A2, then the next round. Enter moves in the same order.
- Pasted notes with "Superset x 3 sets" or A1/A2 labels now come in as real supersets.
- AI-written programs can include supersets.
- The feedback mute toggle uses bell icons.

### Fixed
- A program you build by hand now saves in the order you built it, instead of being re-sorted by exercise label.

## v0.1.14 — 2026-11-10

### New
- On a feedback ticket, "Show me" opens the screenshot when the page can't be opened or the element can't be found, and screenshots open full size.
- Pasted programs with suggested exercise matches show "Did you mean …" buttons. Tap one to pick it, and it's remembered for next time.

### Fixed
- Supersets and circuits from a pasted program keep their pairs together. Exercises stay in the pasted order instead of being re-sorted by role.
- A header like "Superset x 3 sets" now gives each exercise under it 3 sets.
- A pasted exercise is no longer swapped for a look-alike (e.g. "Single leg throwball" became "Single-Leg Hop"). Unsure matches are only suggested, and only matches you pick are remembered.
- A client page that can't load now says so instead of loading forever.

## v0.1.13 — 2026-11-10

### New
- Feedback replies can now come from an AI assistant, marked with an "AI answer" badge. It answers questions it can check against the app, like "this already exists" or "this was added after you reported it". Reply on the ticket if the answer is wrong.
- Feedback replies show formatting such as **bold** text and lists.
- On phones the sidebar is replaced by a slim icon rail that stays put.

### Fixed
- Tapping Save session more than once no longer creates duplicate logs of the same session. Replacing an earlier log can be undone.
- The feedback button no longer covers the pain warning.
- Flag and skip-reason chips are easier to tap on phones.

## v0.1.12 — 2026-11-10

### New
- Readiness and flags on the log sheet: record how the client slept and how sore they are, and flag any exercise for pain or technique, or mark it skipped with a reason. Both show on the client's History.
- A pain flag (or a skip because of pain) raises a "pain flag" alert for 14 days, so you check in before loading that exercise again. AI drafts see readiness and flags from recent sessions.

### Fixed
- Session reasoning shows in the right "Why this session" panel in draft review.
- While a draft is generating, the timer sits next to the title.
- The flag menu's Done button is easier to tap on phones.

## v0.1.11 — 2026-11-10

### New
- Logging a session is faster: fill a value down the column, press Enter to move to the next cell, skip an exercise, and keep the Save button in view. Picking a date picks the session scheduled for it.
- Logging is safer: sessions already logged that day show up, and you're asked before logging a duplicate. You get a summary to confirm, Undo after saving, a warning before leaving with unsaved sets, and drafts that survive a reload.
- Suggested loads on the log sheet. RPE-only sets suggest a kg from the client's recent lifts, every set shows its e1RM with a PR badge, and off-target RPE is flagged. Remaining sets adjust after a set that ran hot or easy, and back-offs follow today's top set.
- Deload rules: set your default deload in Settings, override it per client, and the Deload button and AI drafts follow it.
- The training week on the dashboard is a grid with six weeks of history per client. Clients who need attention are listed first, and tapping a day opens the logger on that session.
- Session cards line up sets, reps, load and effort in columns, group top sets and back-offs, and include a notation key.
- Colour themes: pick a palette for light and dark mode, including high contrast, colourblind-friendly, paper and dimmed.

### Fixed
- Sidebar and account menu alignment tidied up.
- Session balance counts isolation and carry sets.
- Empty reasoning panels no longer show in draft review.
- "Week 1" is no longer cut off in the deload settings.

## v0.1.10 — 2026-11-09

### New
- New client form follows the intake conversation: goals and limitations come first, 1RMs can wait for the first week, and the Add bar stays on screen. "Add & generate program" takes you straight to drafting their first programme.
- Training days are now one row of day chips that fits a phone. Cardio days, the long-session day and the weekly cardio target sit under one Cardio switch, with a one-line summary of the week.
- Client settings are grouped into clear boxes, with a save bar that follows you down the page, a Discard button and ⌘S.
- The History tab shows lift trends with e1RM charts, an 8-week / 6-month / all-time range switch and sessions grouped by week.
- The programme page shows the sets logged under each session.
- A What's new page, with a dot on the version number when there's a new release.
- A refreshed sidebar: account menu at the bottom, tooltips on the collapsed rail, and ⌘B to toggle it.

### Fixed
- AI drafts that hit the length limit say so instead of retrying in vain.
- The all-clients list and admin client page fit narrow screens, and long cardio lines wrap on session cards.
- The name error on a new client only shows after you've typed and left the field, or pressed Add.

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
