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

Training data gets the seriousness of engineering tooling. The trainer's loop — scan the week, read signals with cited evidence, approve an AI-drafted block — is staged exactly like reviewing a pull request: a contributions-style grid shows activity, a Needs-review queue lists signals with lamp dots and evidence lines, a 2×2 kept/added/removed/changed summary plus +/−/~ rows presents the draft as a diff, and a single green button merges it as a draft. The voice is quiet, dense, credible, and free of decoration; nothing on screen is ornament, everything is evidence or an action.

The visual world is GitHub's Primer, user-pinned on 2026-10-02 from an eight-direction prototype field (`prototypes/direction-g.html` is the spec): white canvas over gray wells, hairline-bordered boxes with counters, code-span set chips, soft-tinted labels, orange-underline tabs, and a contributions-green data ramp — recognizable as this product even with all content removed. The system font stack (system UI sans + `ui-monospace`) is the committed typographic identity, not a placeholder; the app is light-mode only and explicitly refuses the dark-neon athletic-app default.

Density is the aesthetic: a 14px base, 5px control padding, tabular mono figures right-aligned in bordered sheet tables. Color speaks only in two registers — soft tints for status, one GitHub green for the action that advances the review flow.

**Key Characteristics:**
- White canvas over gray wells; boxes sit on 1px hairlines, never on shadows
- One green action per screen state — primary buttons reserve themselves for review-flow verbs (Generate draft, Approve as draft program, Save)
- Every figure renders `ui-monospace` with tabular numerals; every panel head cites its evidence with a count pill
- Status is ink-on-tint (Primer Labels); logged intensity uses the 4-step contributions ramp
- Primer widgets repurposed for training review: orange-underline tabs, dashed warm-up chips, lamp-dot signal rows, code-span set chips
- Flat and light-only; the only shadows are the button lip and the blue focus halo

## Colors

A neutral Primer canvas (white, wells, hairlines) where color arrives only as function: green for action and success, blue for links and the present moment, red for danger, amber for attention — each always as ink paired with its soft tint.

### Primary
- **Action Green** (#1f883d): The primary button — the review-flow verb ("Approve as draft program", "Generate draft", "Save profile"). Darkens to Action Green Hover (#1a7f37) on hover. Also the lamp green, the sidebar status dot, and the generation-meta dot.
- **Commit Green** (#1a7f37): Success and delta-up text ink (approved flash note, `+12%` deltas, done step dots) and the easy RPE tier. Paired with **Commit Green Tint** (#dafbe1) and **Commit Green Edge** (#aceebb) for the good pill and approval flash.

### Secondary
- **Link Blue** (#0969da): Links, snooze, the "changed" diff ink, the transition directive chip, and injected periodization context. Darkens to Link Blue Hover (#0860c4).
- **Focus Blue** (rgba(9, 105, 218, 0.45)): The global `:focus-visible` outline (2px, offset −1px). Input focus adds a 3px halo at 15% alpha of the same hue.
- **Pulse Blue Tint** (#ddf4ff): The current week — today's cell and the current pulse row — a highlight, not a status.

### Tertiary
- **Danger Red** (#cf222e): Destructive actions, rejected/failed states, delta-down, missed sessions, maximal RPE. Tint Danger Red Tint (#ffebe9) + Edge Danger Red Edge (#ffcecb) for the bad pill, missed cells, and the reject flash.
- **Attention Amber** (#9a6700): Paused/warn ink and the hard RPE tier (7–8). Tint Attention Amber Tint (#fff8c5) + Edge (#d4a72c66) for the demo banner and limitations panel (amber body ink #4d3800 on the tint).
- **Tab Coral** (#fd8c73): The 2px active-tab underline — the system's only warm flourish, straight from Primer's UnderlineNav.
- **Contributions Ramp** (done-1 #aceebb → done-4 #116329): Logged intensity. The tonnage heat strip walks the full 4 steps; logged week cells intentionally use the darkest step (done-4, #116329) instead of the prototype's brighter #4ac26b so the 10px white uppercase tag keeps 4.5:1 contrast; missed-past cells are Danger Red Tint (a real data state, not prototype furniture).

### Neutral
- **Canvas White** (#ffffff): Page background and every panel surface.
- **Well Gray** (#f6f8fa): Wells — sidebar, panel headers, inputs, selects, default buttons, "next" cells, code-ish `pre` blocks.
- **Well Gray Deep** (#eef1f4): The hover layer (default button, nav item) and the skeleton shimmer base.
- **Well Gray Active** (#e0e5ea): The selected nav item.
- **Ink** (#1f2328): Primary text. **Muted Ink** (#59636e): secondary text, placeholders, labels. **Faint Ink** (#666e78): tertiary metadata and planned-only rows.
- **Hairline Gray** (#d0d7de): Primary 1px borders. **Hairline Gray Soft** (#d8dee4): row separators. **Hairline Gray Strong** (#afb8c1): hover borders and pending step dots.
- **Inverted Ink** (#24292f): Inverted fills — the "PT" brand mark and selected toggle chips (weekday picker, template chips, exercise filters).
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
- **Body** (400, 14px, 1.5): All prose, table cells, buttons, nav. Forms and settings panels cap near 560px wide.
- **Label** (500, 12px, 1.2): Pills, counters, directive chips, when-chips, set-chip sub-labels. Nav group labels add uppercase and 0.04em tracking.
- **Mono figures** (500, 12px, tabular-nums): Set chips, deltas, `.num` stats (`.num.big` 20px/600), table `.r` columns, the merged-instructions `pre`. Week-cell tags run 10px uppercase mono with 0.02em tracking.
- **Micro metadata** (400, 13px / 11px): Evidence lines at 13px muted; day numbers, client meta, and off-day dashes at 11px faint.

### Named Rules
**The Tabular Figure Rule.** Any number that gets compared across a row, column, or week renders in `ui-monospace` with `font-variant-numeric: tabular-nums` (right-aligned in sheet tables). Counts inside pills are the one exception — they are labels, not figures.
**The System-Stack Rule.** The system stacks are the committed identity, pinned with the Primer direction. Never load a webfont or add a display typeface; hierarchy is weight and size within the system stack only.

## Layout

A two-column shell: a 236px **well sidebar** (Well Gray, hairline right border, sticky full-height) and a main column capped at 1080px, centered, padded 28px/32px/64px with a `min-width: 0` guard so grid children shrink instead of blowing the page sideways. The sidebar carries the inverted-ink "PT" mark, grouped nav (uppercase group labels; 14px items with inline stroke SVG icons, 6px/8px radius, hover Well Gray Deep, active Well Gray Active + 600 weight + ink icon), a right-aligned count pill, and a footer status dot.

Pages open with a page-head (title + `.sub` context line, actions right, wrapping), then panels in grids: Overview runs 1.4fr/1fr; client detail runs `minmax(0,1fr)` + 300px; the draft review runs 1fr/1fr. Grid tracks that hold prose use `minmax(0,·)`. The rhythm is 4/8/16: chip gaps 4, control gaps 8, panel grids and panel-body padding 16; panel heads sit at 10px/16px; tabs at 16px top / 18px bottom; page-head margin 22px. Wide tables scroll horizontally inside `overflow-x: auto` wrappers; the training-week grid keeps a 480px minimum and scrolls rather than compressing.

Breakpoints: **860px** collapses the sidebar to a 56px icon rail (labels, counts, footer hidden; centered icons); **1060px** stacks the Overview columns; **900px** stacks client/review two-columns and stretches head-actions full width; **520px** wraps signal action buttons to their own row. Demo mode injects an amber banner note above the page.

## Elevation & Depth

Flat, and deliberately so. Depth is conveyed by tonal layering — white panels on white canvas separated by hairlines, wells (`#f6f8fa`) recessed one step for headers, inputs, buttons, and the sidebar — not by shadows or overlap. Panels never float.

### Shadow Vocabulary
- **Button lip** (`box-shadow: 0 1px 0 rgba(31, 35, 40, 0.04)`): The system's only elevation, a 1px lip under every button; removed on `:active` so the press feels physical.
- **Focus halo** (`box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15)`): Appears on input focus alongside a Link Blue border switch from well to white background.
- **Shimmer** (linear gradient `#eef1f4 → #f6f8fa → #eef1f4`, 200% width, 1.2s infinite linear): Loading skeletons; the sole animation besides 120ms button background transitions.

### Named Rules
**The Hairline Rule.** Surfaces are separated by 1px hairlines (2px for table headers and the today cell) and layered by well tint, never by shadow. No panel, dropdown, or overlay may add elevation shadows; the button lip and focus halo are the entire shadow budget.

## Shapes

A bordered, quietly rounded form language. Default radius 6px on every control and container (buttons, inputs, panels, set chips, notes, `pre` blocks); fully-round 99px pills for every chip-like token (labels, counters, when-chips, directive chips, lamps, avatars, scrollbars); 4px only inside data grids (week cells, tonnage heat squares). Everything gets a 1px border — transparent-background variants (ghost buttons, warm-up chips) switch to dashed rather than going naked. Underlines act as shape: the 2px Tab Coral tab underline, the 2px Link Blue today-cell border, the 2px Hairline Gray Soft table header rule, and `text-underline-offset: 3px` on row links.

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
- **Set chip (code span):** mono 12px on Chip Gray (6px radius): reps `3×8`, amber/red/green `@RPE`, faint rest `3m` (11px micro); warm-up sets go dashed-border transparent; chip RPE ink reuses the RPE tiers darkened one step for AA on the chip background (≤6 #116329, 7–8 #7d5600, 9–10 Danger Red)
- **Toggle chips:** hairline pills that invert to Inverted Ink (#24292f) with white text when selected (weekday picker, templates, exercise filters)

### Cards / Containers
- **Panel (Primer Box):** Canvas White, 1px Hairline Gray border, 6px radius; optional **panel-head** (Well Gray band, hairline bottom, 10px/16px, 14px/600 title + counter + right-aligned `act` link, wrapping on narrow viewports) and **panel-body** (16px, or 4px/16px `tight` for tables)
- **Sessions inside a panel:** stacked session-rows — 11px/14px header band (h3 + when-pill + optional conditioning note) over a 12px/14px body of `1fr/auto` exercise rows; hairline-soft separators, Hairline Gray between sessions
- **Empty state:** centered muted text at 28px/18px padding, with centered actions when the empty state is an on-ramp

### Inputs / Fields
- **Style:** Well Gray field on 1px Hairline Gray border, 6px radius, 5px/12px padding, 14px; placeholder Muted Ink; `.label` 14px/500 with 6px bottom margin
- **Focus:** background flips to white, border to Link Blue, plus the 3px halo (see Elevation)
- **Error / read-only:** errors are Danger Red 13px/500 text lines; read-only context renders as a mono `pre` on a well, blue when injected (periodization context)

### Navigation
- **Sidebar rail:** see Layout; inline stroke icons (16px, 1.5 stroke, Muted Ink → Ink when active)
- **Tabs (orange underline):** 14px Muted Ink buttons on the page's hairline with a transparent 2px underline (−1px overlap); hover gains a hairline underline; active turns Ink + 600 + Tab Coral underline. Tabs carry counters; disabled tabs dim to 50%
- **Links:** Link Blue, underline on hover; row links are Ink/600 with 3px offset underline; in-table row names are real anchors for keyboard and middle-click

### Signal Row
The needs-review unit: an 8px lamp dot (green/amber `#bf8700`/red/gray `#818b98`) beside a 14px/600 title and a 13px muted evidence line, with actions right (green "Draft next block" + ghost "Open client" or an underlined blue snooze). At 520px the actions wrap below. The lamp always travels with a label and evidence — color never signals alone.

### Contributions Week Grid
The overview's signature: one row per client, seven day cells (104px label column, `minmax(52px, 1fr)` cells, max-width 70px each, 4px radius, min-height 34px) with a 10px uppercase mono tag. States: **done** = Contributions done-4 fill + white tag + ✓; **today** = 2px Link Blue border on Pulse Blue Tint + "· due"; **missed** = Danger Red Tint + edge + red tag; **next** = Well Gray + Muted Ink tag; off-days a faint em dash. Hover brightens 5%.

### AI Draft Review
The code-review moment: a 2×2 diff-tile grid (kept/added/removed/changed — 20px/600 mono counts in Muted/Commit Green/Danger Red/Link Blue over 12px labels) above +/−/~ change rows (bold mono sign, colored exercise name, faint mono detail right-aligned), a rationale panel beside a well-gray "what the client reads" card, and — pinned exception — an **approve-note** with a 6px Action Green left border on a hairline well, carrying the lock icon and "nothing reaches the client until you activate it".

## Component Library & Storybook

Reusable UI lives in code, catalogued in Storybook:

- **Run:** `bun run storybook` (repo root) → http://localhost:6006. Stories are Svelte 5 CSF (`defineMeta` + `Story`) via `@storybook/addon-svelte-csf`.
- **Layout:** `src/lib/ui/` holds generic primitives (Button, Pill, ToggleChip, Note, ConfirmButton, Field, Tabs, Panel, Crumbs, PageHead, Skeleton/SkeletonPanel, Counter, Icon, EmptyState, DirChip, Avatar); `src/lib/components/` holds domain components (StatusPill, WeekdayPicker, SetChips, SignalRow, SessionCard, DiffTiles, ChangeRow, WeekGrid). Stories are colocated as `X.stories.svelte` next to each component.
- **Architecture:** `src/app.css` stays the single style source — tokens (`:root` custom properties) plus the Primer classes. Components are typed Svelte 5 wrappers over those classes; every route consumes the primitives (PageHead, Button, Panel, Field, Skeleton, EmptyState) instead of hand-rolling `.page-head`/`.btn`/`.panel` markup, and recurring domain shapes live as components: **SessionCard** (prescribed session rows over the global `.session` classes — callers resolve exercise names to plain strings), **DiffTiles + ChangeRow** (the AI draft diff tiles and +/−/~ rows), **WeekGrid** (the overview training-week grid — purely presentational; row building and status derivation stay in the page, which passes rows plus ISO week dates and today).
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
- **Don't** raise panels on shadows or layer elevation; the button lip and focus halo are the entire shadow budget.
- **Don't** brighten logged week cells past #116329 — the prototype's #4ac26b was deliberately darkened for 4.5:1 contrast on 10px white tags.
- **Don't** add colored left-edge stripes for emphasis; the approve-note's 6px green border is a single brief-pinned exception, not a pattern to extend.
- **Don't** load webfonts or add display type — the system stacks are the committed identity.
- **Don't** design dark mode or neon accents; the system is light-only and refuses the dark-neon athletic-app default.
- **Don't** show a colored signal without its label — the lamp dot always travels with a title and an evidence line.
