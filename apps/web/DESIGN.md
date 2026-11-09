---
name: Program Tracker
description: A trainer's operating system for periodized strength programming, built in GitHub's Primer grammar — training data reviewed like code.
colors:
  canvas-white: "#ffffff"
  well-gray: "#f6f8fa"
  well-gray-deep: "#eef1f4"
  well-gray-active: "#e0e5ea"
  ink: "#1f2328"
  ink-muted: "#59636e"
  ink-faint: "#666e78"
  hairline: "#d0d7de"
  hairline-soft: "#d8dee4"
  hairline-strong: "#afb8c1"
  inverted-ink: "#24292f"
  avatar-gray: "#dde4ea"
  chip-gray: "rgba(175, 184, 193, 0.2)"
  action-green: "#1f883d"
  action-green-hover: "#1a7f37"
  commit-green: "#1a7f37"
  commit-green-bg: "#dafbe1"
  commit-green-line: "#aceebb"
  link-blue: "#0969da"
  link-blue-hover: "#0860c4"
  focus-blue: "rgba(9, 105, 218, 0.45)"
  today-blue-bg: "#ddf4ff"
  danger-red: "#cf222e"
  danger-red-bg: "#ffebe9"
  danger-red-line: "#ffcecb"
  attention-amber: "#9a6700"
  attention-amber-bg: "#fff8c5"
  attention-amber-line: "#d4a72c66"
  tab-underline: "#fd8c73"
  done-1: "#aceebb"
  done-2: "#4ac26b"
  done-3: "#2da44e"
  done-4: "#116329"
typography:
  headline:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.2
  micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif"
    fontSize: "13px / 11px"
    fontWeight: 400
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "32px"
components:
  button:
    backgroundColor: "{colors.well-gray}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "5px 16px"
  button-hover:
    backgroundColor: "{colors.well-gray-deep}"
  button-primary:
    backgroundColor: "{colors.action-green}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "5px 16px"
  button-primary-hover:
    backgroundColor: "{colors.action-green-hover}"
  button-danger:
    backgroundColor: "{colors.well-gray}"
    textColor: "{colors.danger-red}"
    rounded: "{rounded.md}"
    padding: "5px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "5px 16px"
  input:
    backgroundColor: "{colors.well-gray}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "5px 12px"
  panel:
    backgroundColor: "{colors.canvas-white}"
    rounded: "{rounded.md}"
    padding: "16px"
  panel-head:
    backgroundColor: "{colors.well-gray}"
    rounded: "{rounded.md}"
    padding: "10px 16px"
  pill-good:
    backgroundColor: "{colors.commit-green-bg}"
    textColor: "{colors.commit-green}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-warn:
    backgroundColor: "{colors.attention-amber-bg}"
    textColor: "{colors.attention-amber}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-bad:
    backgroundColor: "{colors.danger-red-bg}"
    textColor: "{colors.danger-red}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  pill-neutral:
    backgroundColor: "{colors.well-gray}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  counter:
    backgroundColor: "{colors.canvas-white}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  set-chip:
    backgroundColor: "{colors.chip-gray}"
    textColor: "{colors.ink}"
    typography: "{typography.mono}"
    rounded: "{rounded.md}"
    padding: "2px 7px"
  week-cell-done:
    backgroundColor: "{colors.done-4}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
  tab-active:
    textColor: "{colors.ink}"
---

# Design System: Program Tracker

## Overview

**Creative North Star: "The Coach's Code Review"**

Training data gets the seriousness of engineering tooling. The trainer's loop — scan the week, read signals with cited evidence, approve an AI-drafted block — is staged exactly like reviewing a pull request: a contributions-style grid shows activity, a Needs-review queue lists signals with lamp dots and evidence lines, a decision band (changes since the last version as +/−/~ lines, automated checks, and the version history) presents the draft as a diff, and a single green button merges it as a draft. The voice is quiet, dense, credible, and free of decoration; nothing on screen is ornament, everything is evidence or an action.

The visual world is GitHub's Primer, user-pinned on 2026-10-02 from an eight-direction prototype field (`prototypes/direction-g.html` is the spec): white canvas over gray wells, hairline-bordered boxes with counters, code-span set chips, soft-tinted labels, orange-underline tabs, and a contributions-green data ramp — recognizable as this product even with all content removed. The system font stack (system UI sans + `ui-monospace`) is the committed typographic identity, not a placeholder; light is the default; an opt-in dark theme (System / Light / Dark in the sidebar account menu and on Settings, `$lib/theme.svelte.ts`) mirrors Primer's dark default token-for-token on `:root[data-theme="dark"]` and still refuses the dark-neon athletic-app default.

Density is the aesthetic: a 14px base, 5px control padding, tabular mono figures right-aligned in bordered sheet tables. Color speaks only in two registers — soft tints for status, one GitHub green for the action that advances the review flow.

**Key Characteristics:**
- White canvas over gray wells; boxes sit on 1px hairlines, never on shadows
- One green action per screen state — primary buttons reserve themselves for review-flow verbs (Generate draft, Approve as draft program, Save)
- Every figure renders `ui-monospace` with tabular numerals; every panel head cites its evidence with a count pill
- Status is ink-on-tint (Primer Labels); logged intensity uses the 4-step contributions ramp
- Primer widgets repurposed for training review: orange-underline tabs, lamp-dot signal rows, code-span set chips
- Flat and light-only; the only shadows are the button lip, the blue focus halo, and one overlay shadow for surfaces that float over content

## Colors

A neutral Primer canvas (white, wells, hairlines) where color arrives only as function: green for action and success, blue for links and the present moment, red for danger, amber for attention — each always as ink paired with its soft tint.

### Primary
- **Action Green** (#1f883d): The primary button — the review-flow verb ("Approve as draft program", "Generate draft", "Save profile"). Darkens to Action Green Hover (#1a7f37) on hover. Also the lamp green, the sidebar live-data dot, and the generation-meta dot.
- **Commit Green** (#1a7f37): Success and delta-up text ink (approved flash note, `+12%` deltas, done step dots) and the easy RPE tier. Paired with **Commit Green Tint** (#dafbe1) and **Commit Green Edge** (#aceebb) for the good pill and approval flash.

### Secondary
- **Link Blue** (#0969da): Links, snooze, the "changed" diff ink, the transition directive chip, and injected periodization context. Darkens to Link Blue Hover (#0860c4).
- **Focus Blue** (rgba(9, 105, 218, 0.45)): The global `:focus-visible` outline (2px, offset −1px). Input focus adds a 3px halo at 15% alpha of the same hue.
- **Pulse Blue Tint** (#ddf4ff): The current week — today's cell and the current pulse row — a highlight, not a status.

### Tertiary
- **Danger Red** (#cf222e): Destructive actions, rejected/failed states, delta-down, missed sessions, maximal RPE. Tint Danger Red Tint (#ffebe9) + Edge Danger Red Edge (#ffcecb) for the bad pill, missed cells, and the reject flash.
- **Attention Amber** (#9a6700): Paused/warn ink and the hard RPE tier (7–8). Tint Attention Amber Tint (#fff8c5) + Edge (#d4a72c66) for the demo banner and limitations panel (amber body ink #4d3800 on the tint).
- **Tab Coral** (#fd8c73): The 2px active-tab underline — the system's only warm flourish, straight from Primer's UnderlineNav.
- **Contributions Ramp** (done-1 #aceebb → done-4 #116329): Logged intensity. The overall volume heat strip walks the full 4 steps; logged week cells intentionally use the darkest step (done-4, #116329) instead of the prototype's brighter #4ac26b so the 10px white uppercase tag keeps 4.5:1 contrast; missed-past cells are Danger Red Tint (a real data state, not prototype furniture).

### Neutral
- **Canvas White** (#ffffff): Page background and every panel surface.
- **Well Gray** (#f6f8fa): Wells — sidebar, panel headers, inputs, selects, default buttons, "next" cells, code-ish `pre` blocks.
- **Well Gray Deep** (#eef1f4): The hover layer (default button, nav item) and the skeleton shimmer base.
- **Well Gray Active** (#e0e5ea): The selected nav item.
- **Ink** (#1f2328): Primary text. **Muted Ink** (#59636e): secondary text, placeholders, labels. **Faint Ink** (#666e78): tertiary metadata and planned-only rows.
- **Hairline Gray** (#d0d7de): Primary 1px borders. **Hairline Gray Soft** (#d8dee4): row separators. **Hairline Gray Strong** (#afb8c1): hover borders and pending step dots.
- **Inverted Ink** (#24292f): Inverted fills — the "PT" brand mark and selected toggle chips (template chips, exercise filters) and picked training-week cells.
- **Avatar Gray** (#dde4ea): Initials avatar background.
- **Chip Gray** (rgba(175, 184, 193, 0.2)): The code-span background of set chips.

### Named Rules
**The Ink-on-Tint Rule.** Status is colored ink on its soft tint (good on Commit Green Tint, bad on Danger Red Tint) — never a large saturated fill. The only saturated fills in the system are the green primary button and the logged contributions cell.

## Typography

**Display Font:** none — the system UI stack at 20px semibold is the largest voice the app has.
**Body Font:** system UI stack — `-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif`.
**Label/Mono Font:** `ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` with tabular numerals for every figure.

**Character:** An engineering-tool voice: one workhorse sans at a 14px base doing everything from headings to buttons, with mono reserved for data. Hierarchy comes from weight and size steps within a single family, never from a second typeface.

### Hierarchy
- **Headline** (600, 20px, 1.25, −0.01em): The page title ("This week", "Draft — next block").
- **Title** (600, 16px / 14px, 1.3): `h2` section titles and panel-head titles (panel heads run 14px).
- **Body** (400, 14px, 1.5): All prose, table cells, buttons, nav. Forms and settings stacks cap at `--measure-form` (720px).
- **Label** (500, 12px, 1.2): Pills, counters, directive chips, when-chips, set-chip sub-labels, sidebar nav group labels (sentence case, Muted Ink).
- **Mono figures** (500, 12px, tabular-nums): Set chips, deltas, `.num` stats (`.num.big` 20px/600), table `.r` columns, the merged-instructions `pre`. Week-cell tags run 10px uppercase mono with 0.02em tracking.
- **Micro metadata** (400, 13px / 11px): Evidence lines at 13px muted; day numbers, client meta, and off-day dashes at 11px faint.

### Named Rules
**The Tabular Figure Rule.** Any number that gets compared across a row, column, or week renders in `ui-monospace` with `font-variant-numeric: tabular-nums` (right-aligned in sheet tables). Counts inside pills are the one exception — they are labels, not figures.
**The System-Stack Rule.** The system stacks are the committed identity, pinned with the Primer direction. Never load a webfont or add a display typeface; hierarchy is weight and size within the system stack only.

## Layout

A two-column shell: a 236px **well sidebar** (Well Gray, hairline right border, sticky full-height) and a main column anchored to the sidebar (never centered — centering opened a dead strip between nav and content on wide screens), capped at `--page-max` 1280px, padded 28px/40px/64px with a `min-width: 0` guard so grid children shrink instead of blowing the page sideways. The sidebar is a flat, flush-left column (classic, never a floating card) padded 8px, with three bands: header, a nav that scrolls on its own, and a pinned foot. The header is a switcher-style brand row: one 48px link (8px radius, hover Well Gray Deep) holding the 32px rounded-square inverted-ink "PT" mark (8px radius), "Program Tracker" at 600 14px over a 12px muted "Trainer workspace". The collapse toggle lives outside the sidebar, on the page's first line: a 28px ghost icon button and a 16px hairline divider set inline before the title (or the crumbs, which the title block then clears), as in shadcn's inset header; panels below keep the column's left edge. On phone gym-floor routes the corner menu button replaces it. Nav groups sit 16px apart under sentence-case 500 12px Muted Ink labels in 32px rows; items are 32px rows, 6px radius, 8px gap, 14px text with 16px `Icon` stroke glyphs (one distinct icon per destination, never shared), hover Well Gray Deep, active Well Gray Active + 500 weight + ink icon, and a right-aligned mono count pill. Rows sit 8px in from the edge with 12px inner padding, so icons land at x=20 — where the rail centres them. The foot holds the utility links (Feedback, Settings) apart from the daily work, then the **account menu** trigger: a 48px row with the 32px rounded-square avatar (data-mode dot on its corner — green live, amber demo — so it survives the rail), the name at 600 14px over the muted email (plus the blue What's-new dot — on the rail it rides the avatar's top corner), and a chevrons-up-down glyph. It opens a 256px menu (white, hairline border, 8px radius, overlay shadow, `role="menu"`): the name and email, What's new with the version, a three-icon System / Light / Dark theme switch, and Sign out — beside the sidebar, bottom edges aligned (upward when the screen is too narrow); arrow keys move through it, Escape and outside clicks close it and focus returns to the trigger. With auth off the foot shows just the data-mode dot and build. Collapsing: the title-line toggle, a 12px edge rail straddling the sidebar's border (hover draws a 2px Strong Hairline, `ew-resize` cursor; wide screens only), or ⌘B / Ctrl+B (ignored while typing in a field). Wide screens remember the rail; narrow ones open the full menu over the page. On the rail, every item, the brand and the account trigger get an ink tooltip to the right on hover and keyboard focus (Feedback adds its unread count).

Pages open with a page-head (title + `.sub` context line, actions right, wrapping), then panels in grids: Overview runs 1.4fr/1fr; client detail runs `minmax(0,1fr)` + 300px; the draft review's decision band runs 1.15fr/1fr/1fr and its session rows `minmax(0,1fr)` + 300px; the chat page runs `minmax(0,1fr)` + `minmax(380px, 0.95fr)`. Grid tracks that hold prose use `minmax(0,·)`. Widths come from tokens only: `--page-max` (1280px) for the column and `--measure-form` (720px) for single-column forms and settings panels (Settings, client Settings tab, generate setup steps). A form that sits above a full-width table spans the column too and pairs its sections into two columns at ≥1360px, so panel edges line up. Crumbs sit on their own line above the page title. The rhythm is 4/8/16: chip gaps 4, control gaps 8, panel grids and panel-body padding 16; panel heads sit at 10px/16px; tabs at 16px top / 18px bottom; page-head margin 22px. Wide tables scroll horizontally inside `overflow-x: auto` wrappers.

Breakpoints: **860px** collapses the sidebar to a 56px icon rail (labels, counts, account text hidden; centered icons; the toggle opens it as an overlay). The rail keeps the open menu's vertical rhythm — 48px brand and account rows, 16px group gaps, and each group label's 32px slot holding a centred 16px Strong Hairline divider in place of the faded text — so icons never move up or down on toggle, only the labels slide; **1060px** stacks the Overview columns; **900px** stacks the client two-column and stretches head-actions full width; **1000px** stacks the draft review's band and session rows; **980px** stacks the chat page, with the draft pane collapsing above the conversation; **700px** moves draft-review actions into the fixed bottom bar; **520px** wraps signal action buttons to their own row. Demo mode injects an amber banner note above the page.

## Elevation & Depth

Flat, and deliberately so. Depth is conveyed by tonal layering — white panels on white canvas separated by hairlines, wells (`#f6f8fa`) recessed one step for headers, inputs, buttons, and the sidebar — not by shadows or overlap. Panels never float; only true overlays (a popover, a sticky save bar, the phone approve bar, the collapsed draft pane on narrow screens) do, and they take the overlay shadow.

### Shadow Vocabulary
- **Button lip** (`box-shadow: 0 1px 0 rgba(31, 35, 40, 0.04)`): The system's only elevation, a 1px lip under every button; removed on `:active` so the press feels physical.
- **Focus halo** (`box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15)`): Appears on input focus alongside a Link Blue border switch from well to white background; also marks a panel in edit mode (the block plan while editing) and a focused composer box.
- **Overlay** (`--shadow-overlay: 0 8px 24px rgba(140, 149, 159, 0.2)`, and `--shadow-overlay-up` with the y-offset flipped for bars pinned to the bottom edge): Primer's overlay shadow, for surfaces that sit on top of scrolling content — the model-settings popover, the shared sticky save bar (program page, client Settings), the phone approve bar, the collapsed draft pane.
- **Inset rings** (`inset 0 -2px 0` tab underline, `inset 0 0 0 1px` selected block-plan tile): borders drawn with box-shadow so they don't shift layout. They are borders, not elevation.
- **Shimmer** (linear gradient `#eef1f4 → #f6f8fa → #eef1f4`, 200% width, 1.2s infinite linear): Loading skeletons; the sole animation besides 120ms button background transitions.

### Named Rules
**The Hairline Rule.** Surfaces are separated by 1px hairlines (2px for table headers and the today cell) and layered by well tint, never by shadow. No panel or in-flow container may add an elevation shadow. The budget is the button lip, the focus halo, and the overlay token — and the overlay token only goes on a surface that actually floats over content. Never write a raw shadow value; use the tokens.

## Shapes

A bordered, quietly rounded form language. Default radius 6px on every control and container (buttons, inputs, panels, set chips, notes, `pre` blocks); fully-round 99px pills for every chip-like token (labels, counters, when-chips, directive chips, lamps, avatars, scrollbars); 8px for the sidebar's identity squares (the 32px "PT" mark and account avatar, the brand row) and the floating account menu; 4px only inside data grids and small focus outlines (week cells, overall volume heat squares, the row-link focus ring). Everything gets a 1px border — transparent-background variants (ghost buttons) switch to dashed rather than going naked. Underlines act as shape: the 2px Tab Coral tab underline, the 2px Link Blue today-cell border, the 2px Hairline Gray Soft table header rule, and `text-underline-offset: 3px` on row links.

### Named Rules
**The Fixed Radii Rule.** Three radii exist — 6px containers/controls, 99px pills, 4px inner data cells — and no others. No new corner value enters the system.

## Components

### Buttons
- **Shape:** softly rounded (6px), tight (5px/16px padding, 14px/500, 7px icon gap; `.small` 3px/12px at 12px)
- **Default:** a "secondary" Primer button — Well Gray on Ink with a translucent hairline border and the 1px lip; hover deepens the well
- **Primary:** Action Green with white text, reserved for the review-flow verb; hover darkens one step
- **Danger:** Well Gray body with Danger Red text; hover fills Danger Red Tint and borders its edge
- **Ghost:** transparent, borderless; hover washes Well Gray Deep — used for tertiary links-in-button-form ("Open client")
- **Focus:** global 2px Focus Blue inset outline; icons are 14px inline stroke SVGs (1.7 stroke) colored by `currentColor`

### Chips
- **Status pill (Primer Label):** 99px, 12px/500 ink-on-tint (`good`/`warn`/`bad`/`neutral`) with a matching tint edge; the StatusPill component maps every domain state onto these four
- **Counter:** a white pill with hairline border and Muted Ink text sitting beside a heading to cite its evidence ("9 of 12 logged")
- **Directive chips:** neutral pills recolored per periodization directive — +volume green, +intensity amber, transition blue
- **Role chip:** the session slot an exercise fills (Power / Primary / Str / Aux / Core) — neutral well pill in the trainer's shorthand, the primary lift in default ink; full description on hover (`title`); leads the exercise name in session rows
- **Set chip (code span):** mono 12px on Chip Gray (6px radius): reps `3×8`, amber/red/green `@RPE`, faint rest `3m` (11px micro); chip RPE ink reuses the RPE tiers darkened one step for AA on the chip background (≤6 #116329, 7–8 #7d5600, 9–10 Danger Red)
- **Toggle chips:** hairline pills that invert to Inverted Ink (#24292f) with white text when selected (templates, exercise filters)

### Cards / Containers
- **Panel (Primer Box):** Canvas White, 1px Hairline Gray border, 6px radius; optional **panel-head** (Well Gray band, hairline bottom, 10px/16px, 14px/600 title + counter + right-aligned `act` link, wrapping on narrow viewports) and **panel-body** (16px, or 4px/16px `tight` for tables)
- **Sessions inside a panel:** stacked session-rows — 11px/14px header band (h3 + when-pill + optional conditioning note) over a 12px/14px body of `1fr/auto` exercise rows; hairline-soft separators, Hairline Gray between sessions
- **Empty state:** centered muted text at 28px/18px padding, with centered actions when the empty state is an on-ramp

### Inputs / Fields
- **Style:** Well Gray field on 1px Hairline Gray border, 6px radius, 5px/12px padding, 14px; placeholder Muted Ink; `.label` 14px/500 with 6px bottom margin
- **Focus:** background flips to white, border to Link Blue, plus the 3px halo (see Elevation)
- **Error / read-only:** errors are Danger Red 13px/500 text lines; read-only context renders as a mono `pre` on a well, blue when injected (periodization context)

### Navigation
- **Sidebar:** see Layout; inline stroke icons (16px, 1.75 stroke, Ink like their labels); sentence-case group labels; the active item is Well Gray Active at 500 weight; rail tooltips sit to the right; ⌘B / Ctrl+B toggles the rail
- **Tabs (orange underline):** 14px Muted Ink buttons on the page's hairline with a transparent 2px underline (−1px overlap); hover gains a hairline underline; active turns Ink + 600 + Tab Coral underline. Tabs carry counters; disabled tabs dim to 50%
- **Links:** Link Blue, underline on hover; row links are Ink/600 with 3px offset underline; in-table row names are real anchors for keyboard and middle-click

### Signal Row
The needs-review unit: an 8px lamp dot (green/amber `#bf8700`/red/gray `#818b98`) beside a 14px/600 title and a 13px muted evidence line, with actions right (green "Draft next block" + ghost "Open client" or an underlined blue snooze). At 520px the actions wrap below. The lamp always travels with a label and evidence — color never signals alone.

### Contributions Week Grid
The overview's signature: one row per client, seven day cells (104px label column, `minmax(52px, 1fr)` cells, max-width 70px each, 4px radius, min-height 34px). Each cell shows the session's short name as a 10px uppercase mono tag, with a 10px state word below it (done / today / missed). Upcoming cells show no state word. States: **done** = Contributions done-4 fill + white text; **today** = 2px Link Blue border on Pulse Blue Tint + blue text; **missed** = Danger Red Tint + edge + red text; **next** = Well Gray + Muted Ink tag; off-days a faint em dash. A day with more than one session shows the count as a 9px mono figure in the cell's top-right corner. The day header for today turns Link Blue + 600; past day headers dim to Faint Ink. The client column stacks name, `N/wk · program`, a `+N any day` line for sessions with no weekday, and the cardio progress line. A row with no placed sessions spans one neutral pill across the week ("2 sessions · any day", "no program", or the client status). Cells are links: logged → client, otherwise → the log page. Hover brightens 5%.

### Profile Sections
A client profile (client Settings tab, New client) is a stack of **ProfileSection** boxes inside a `.pf` form: one Primer Box per topic, capped at `--measure-form` (720px) with a 16px gap and never nested in an outer panel. Each head carries the 14px/600 title and a one-line 13px Muted Ink purpose. The order follows the intake conversation: Contact (how you reach them), Goals & limitations (every AI draft respects these; always open), Training week (where lifting and cardio land on the calendar), Basics (used for age, loading and AI context), then 1RMs (sets prescribed as % of 1RM take their kg from these; empty state "No 1RMs yet" + "+ Add a 1RM" link). On New client the 1RMs box waits behind a small "+ Add 1RMs — usually tested in the first week" link until clicked or a restored draft has rows. New client ends in a sticky `.savebar`: status text, Cancel (ghost), Add client (default) and Add & generate program (primary, goes straight to `/clients/<id>/generate`). Under 700px the neutral hint hides and the primary button takes its own full-width row; up to 1100px the bar sits 60px up to clear the Feedback launcher.

### Day Chips
**DayChips** picks weekdays in one row: seven `aria-pressed` toggle buttons (Mon … Sun, full day name as the accessible label) in a labelled group. Chips are `flex: 1`, 40px minimum and 72px maximum width, 4px gap, 6px radius, hairline border, 13px Muted Ink label, min-height 32px (40px tall under 700px, where width may flex down to ~39px so the row fits a 390px phone beside the nav rail). Picked chips fill Inverted Ink with the day name. With none picked a 12.5px muted line says what an empty list means ("No fixed days — sessions are spread across the week"). No table, never scrolls sideways.

### Training Week
**TrainingWeekGrid** (file name kept) sets a client's week in one box. "Lifting sessions a week" is a compact −/+ stepper (1–7, mono tabular value) with the stacking warning beside it in Attention Amber ("2 days will hold two sessions"). Below it, Lifting days are Day Chips. A hairline then a "Cardio" checkbox: on when the client has cardio days, a long session day or a weekly target. On, it reveals (behind a 2px left rule, dropped under 700px) Cardio days as Day Chips ("No fixed days — on lifting days"), Long session day as a select ("No preference" or Monday … Sunday) and the Weekly target (unit select, value, unit word; resets every Monday) side by side, stacked under 700px. Turning it off clears cardio days, the long session day and the target. A 13px muted summary reads the week back ("3 lifts on Mon Wed Fri · cardio on Sat · long session Sun · 120 minutes a week"; "3 lifts, no fixed days").

### Sticky Save Bar
The shared `.savebar` (app.css) floats unsaved edits over the page: sticky at `bottom: 12px` (60px under 700px, clear of the Feedback launcher), Canvas White on a hairline, 6px radius, `--shadow-overlay`, `role="region"` labelled "Unsaved changes". Left: a 12.5px muted `.savemsg` ("Unsaved changes", or the save error in Danger Red); right: a ghost Discard and the green primary save. On the client Settings tab it shows only while the profile is dirty, a save failed, or "Saved" is flashing; Discard restores the stored client and Ctrl/⌘+S saves. The program page uses the same bar for its edits.

### AI Draft Review
The code-review moment (`DraftReview`). Top to bottom:
- **Head:** crumbs, version title, and the action row: a Danger "Reject…" (opens an optional reason box that future drafts learn from) beside the primary "Approve vN as draft program". Under the buttons, a lock-icon line: "Creates a draft program. {name} sees nothing until you activate it." Below 700px the action row moves into a fixed bottom bar (`--shadow-overlay-up`).
- **Decision band:** one panel, three columns (1.15fr/1fr/1fr; stacks on narrow screens). **Since vN−1** lists up to five +/−/~ lines (bold mono sign, session tag, struck-through old value → new value). The changes are read from the drafts, not from the AI's description, and the panel says so. **Checks** shows ok/warn icon rows. **How this draft evolved** lists each version with the trainer's request in quotes, the change count, and how long ago.
- **Block plan:** a panel with the BlockPlanStrip. "Edit" swaps in the BlockPlanEditor; while editing, the panel takes the focus halo and approval pauses ("Finish editing the plan to approve.").
- **Sessions:** SessionCards with changed slots marked, each beside a 300px "Why this session" column of AI reasoning.
- **Reasoning:** two collapsed `<details>`: the trainer-facing rationale, and "What {name} will read" (editable after approval). Both render as markdown prose.
- **Outcome flash:** after a decision, an ok or bad Note confirms what happened ("Approved… is now a draft program — edit it, then activate when ready").

### Chat & Draft Preview
The client chat page (`clients/[id]/chat`) runs two columns: the conversation (`minmax(0, 1fr)`) beside the **DraftPreview** pane (`minmax(380px, 0.95fr)`). Under every assistant turn that built a version sits a **VersionStamp**: the version tag plus a changed-slot count read from the drafts. It opens to the change list, and opens by itself when the build changed something the proposal didn't ask for. A **ChatProposal** card holds a proposed change. Nothing rebuilds until the trainer presses Build; "Adjust" hands the request back to the composer. A superseded proposal dims. The preview marks changed slots, and slots changed without being asked for get Attention Amber. While a new version builds, the current one stays visible but dimmed, with elapsed time and Cancel. Approving happens only on the review page. **ModelSettings** sits in the composer as a one-line summary that opens the ProviderPicker in a popover (`--shadow-overlay`, Escape closes).

### Block Plan Strip
The block's weeks as a row of button tiles: directive chip, % target, and a bar for the chained volume index (week 1 = 100). Picking a tile shows its note; weeks changed since the previous version get an outline. The selected tile takes a 1px Inverted Ink inset ring. The BlockPlanEditor edits a copy (per-week directive, target and note; add or remove weeks; rename the phase). Out-of-range targets block Save; softer issues show as warnings.

### Week Calendar
The program page's placement board: Mon–Sun columns plus an "Any day" tray. Cards are plain hairline boxes; the mono tag names the kind ("Session 1" in Muted Ink, "Cardio 1" in Commit Green), and the selected card takes a Link Blue border plus a 1px inset ring. Session cards drag between days, stack inside a day and reorder within it. Alt+arrows do the same from the keyboard, and SessionHeadEditor has a day select as the touch fallback. The calendar handles placement only; session content is edited inline below it with SessionHeadEditor and ExerciseEditor. Edits collect in the shared sticky save bar (see Sticky Save Bar).

### Pulse Chart
Weekly volume bars on the contributions ramp, with an average-RPE line on a fixed 6–10 right axis. Weeks that are planned but not yet logged render as dashed stubs. The RPE line breaks over weeks with no RPE. It is purely presentational: metrics come from `blockPulse` in the page.

### Generate Inputs & Client Message
The generate page opens with an **InputLedger**: "What the AI reads", one lamp row per generation input. Empty inputs link to where they're filled in. While a draft runs, **GeneratingState** shows phase and elapsed time. The client message page puts the approved text next to a **CopyButton** ("Copy" → "Copied ✓" for 2s, errors shown in place). The trainer pastes the message into LINE by hand; the app never sends it.

## Component Library & Storybook

Reusable UI lives in code, catalogued in Storybook:

- **Run:** `bun run storybook` (repo root) → http://localhost:6006. Stories are Svelte 5 CSF (`defineMeta` + `Story`) via `@storybook/addon-svelte-csf`.
- **Layout:** `src/lib/ui/` holds generic primitives (Button, Pill, ToggleChip, Note, ConfirmButton, Field, Tabs, Panel, Crumbs, PageHead, Skeleton/SkeletonPanel, Counter, Icon, EmptyState, Avatar, GeneratingState). `src/lib/components/` holds domain components, grouped by surface:
  - **Overview & client:** StatusPill, SignalRow, WeekGrid, PulseChart, SessionCard, SetChips, RoleChip, DirChip
  - **Draft review & chat:** DraftReview, DraftPreview, ChatProposal, VersionStamp, BlockPlanStrip, BlockPlanEditor
  - **Program editing:** WeekCalendar, SessionHeadEditor, ExerciseEditor, PhasingEditor
  - **Generate & settings:** InputLedger, ModelSettings, ProviderPicker, KineticChainEditor, ClientProfileFields, ClientIdentityFields, ProfileSection, TrainingWeekGrid, DayChips, CopyButton
- **Stories** are colocated as `X.stories.svelte` next to each component.
- **Architecture:** `src/app.css` stays the single style source — tokens (`:root` custom properties) plus the Primer classes. Components are typed Svelte 5 wrappers over those classes; every route consumes the primitives (PageHead, Button, Panel, Field, Skeleton, EmptyState) instead of hand-rolling `.page-head`/`.btn`/`.panel` markup, and recurring domain shapes live as components: **SessionCard** (prescribed session rows over the global `.session` classes — callers resolve exercise names to plain strings), **DraftReview** (the whole review surface, shared by full-block and single-week drafts), **WeekGrid** (the overview training-week grid — purely presentational; row building and status derivation live in `$lib/overview.ts`; the page passes rows plus local ISO week dates and today).
- **The 3-uses rule:** a page-scoped pattern that appears 3+ times gets extracted — into an `app.css` class when it's styling, into `src/lib/ui/` when it's generic, into `src/lib/components/` when it speaks domain language. Never re-hand-roll markup or scoped CSS a library component already wraps.
- **Design/Tokens** stories render swatches live from `:root`, so the catalog cannot drift from the shipped stylesheet.

## Do's and Don'ts

### Do:
- **Do** build every container as a Primer Box: Canvas White surface, 1px Hairline Gray border, 6px radius, optional Well Gray head carrying a 14px/600 title and a counter.
- **Do** cite evidence in the header — panel heads and tabs carry counters ("9 of 12 logged", "8 wks") stating the data behind them.
- **Do** render every compared figure in `ui-monospace` with tabular numerals, right-aligned in sheet-table `.r` columns.
- **Do** reserve the Action Green primary button for the verb that advances the review flow (Generate draft, Approve as draft program, Save).
- **Do** mark the present moment with 2px Link Blue on Pulse Blue Tint (today cell, current pulse row), and logged weeks with the darkest ramp step (#116329).
- **Do** wrap wide tables and the week grid in `overflow-x: auto` and give prose grid tracks `minmax(0, 1fr)`.
- **Do** honor `prefers-reduced-motion`: the skeleton shimmer and button transitions switch off.

### Don't:
- **Don't** communicate status with saturated fills — status is colored ink on its soft tint (pills, flash notes, missed cells).
- **Don't** raise panels on shadows or layer elevation. The button lip, focus halo and `--shadow-overlay` are the entire shadow budget, and the overlay only goes on surfaces that float over content.
- **Don't** brighten logged week cells past #116329 — the prototype's #4ac26b was deliberately darkened for 4.5:1 contrast on 10px white tags.
- **Don't** add colored left-edge stripes for emphasis — use a status pill, a lamp, or a full hairline border change instead.
- **Don't** load webfonts or add display type — the system stacks are the committed identity.
- **Don't** add neon accents or hard-coded colors — every color is a token with a value in both the light `:root` and the dark `[data-theme="dark"]` block, so dark mode stays Primer-dark, never the dark-neon athletic-app default.
- **Don't** show a colored signal without its label — the lamp dot always travels with a title and an evidence line.
