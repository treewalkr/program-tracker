<script lang="ts">
  import type { SlotChange } from "@pt/shared";
  import { changeSummary, type VersionRow, type VersionView } from "$lib/chatRefine";
  import { draftSessionTags } from "$lib/draftReview";
  import SessionCard, { type SessionEditable, type SlotMark } from "$lib/components/SessionCard.svelte";
  import DraftEditDock from "$lib/components/DraftEditDock.svelte";
  import VersionPicker from "$lib/components/VersionPicker.svelte";
  import DraftWeekTabs from "$lib/components/DraftWeekTabs.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import type { DraftEditor } from "$lib/draftEditor.svelte";
  import { rowMenuItems } from "$lib/draftEditMenu";
  import { roleLabels } from "$lib/roleLabelStore.svelte";

  /**
   * Draft pane beside the chat. Shows one version of the draft (switchable),
   * marks the exercise slots that changed from the version before it (amber
   * when the change was not in the proposal), and — while a new version
   * builds — keeps the current one visible, dimmed, with elapsed time and
   * Cancel. Approving happens only on the review page. On narrow screens the
   * pane collapses to its head row (`open` toggles it).
   *
   * With an `editor`, the latest version can be rearranged by hand: a ⋯ menu
   * per row, and a Select mode whose bar acts on the ticked rows. An edit
   * saves the next version, or folds into the latest when that is already a
   * hand-edit version. Older versions and a running build lock it.
   */
  interface Props {
    view: VersionView;
    /** Newest version number (the switcher shows 1…latest). */
    latest: number;
    /** Switcher rows, oldest first (who made each version, what changed); bare "vN" rows when omitted. */
    history?: VersionRow[];
    /** Changes outside the proposal, for the shown version; empty if none or not proposal-built. */
    unproposed?: SlotChange[];
    /** Set while a new version builds. */
    building?: { next: number; elapsed: string } | null;
    reviewHref: string;
    onview: (version: number) => void;
    oncancel?: () => void;
    /** Narrow screens: expanded or collapsed to the head row. */
    open?: boolean;
    /** Hand edits on the latest version; omit for a read-only pane. */
    editor?: DraftEditor;
    /** Pick the draft week shown (drafts with several weeks get week tabs). */
    onweek?: (week: number) => void;
  }

  let {
    view,
    latest,
    history,
    unproposed = [],
    building = null,
    reviewHref,
    onview,
    oncancel,
    open = $bindable(false),
    editor,
    onweek,
  }: Props = $props();

  const weeks = $derived(view.generation.draft?.weeks ?? []);
  /** The op week for hand edits: the shown week when the draft has several. */
  const opWeek = $derived(weeks.length > 1 ? view.week : null);
  const shownLocked = $derived(weeks.find((w) => w.week === view.week)?.locked === true);
  function pickWeek(n: number) {
    if (editor?.selecting) editor.setSelecting(false);
    onweek?.(n);
  }

  let showChanges = $state(true);

  const rows = $derived<VersionRow[]>(
    history?.length === latest
      ? history
      : Array.from({ length: latest }, (_, i) => ({ version: i + 1, by: "ai" as const, label: i === 0 ? "First draft" : "" }))
  );
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;

  const keyOf = (c: SlotChange) => `${c.week ?? ""}:${c.day}:${c.beforeSlot}:${c.afterSlot}:${c.kind}`;
  const unproposedKeys = $derived(new Set(unproposed.map(keyOf)));

  const isLatest = $derived(view.version === latest);
  /** Why hand edits are off right now, or null when they are on. */
  const lockReason = $derived(
    !editor
      ? null
      : building
        ? `Editing pauses while v${building.next} builds`
        : !isLatest
          ? `Only the latest version (v${latest}) can be edited`
          : null
  );
  const canEdit = $derived(!!editor && lockReason === null && !!view.generation.draft);

  // A locked pane leaves select mode.
  $effect(() => {
    if (!canEdit && editor?.selecting) editor.setSelecting(false);
  });

  function editableFor(day: number): SessionEditable | undefined {
    const ed = editor;
    const d = view.generation.draft;
    if (!ed || !canEdit || !d || shownLocked) return undefined;
    return {
      selecting: ed.selecting,
      disabled: ed.busy,
      isSelected: (slot) => ed.isSelected({ day, slot }),
      ontoggle: (slot) => ed.toggle({ day, slot }),
      items: (slot) => rowMenuItems(d, { day, slot }, (ops) => ed.run(ops), roleLabels.all, { keepOrder: view.generation.trainerOrder, week: opWeek }),
    };
  }

  /** "Session N" / "Cardio N" per draft session (drafts carry no weekdays). */
  const tags = $derived(draftSessionTags(view.sessions));

  /** One mark map per session, keyed by the slot in the shown version. */
  const marksByDay = $derived.by(() => {
    const days: Map<number, SlotMark>[] = view.sessions.map(() => new Map());
    if (!showChanges) return days;
    for (const c of view.changes) {
      if (c.afterSlot == null) continue;
      days[c.day - 1]?.set(c.afterSlot, {
        kind: unproposedKeys.has(keyOf(c)) ? "unproposed" : "changed",
        was: c.kind === "swap" || c.kind === "rx" ? c.from : null,
      });
    }
    return days;
  });
</script>

<section class="panel pane" class:open aria-busy={building !== null} aria-label="Draft">
  <div class="panel-head pane-head">
    <h2>Draft</h2>
    <VersionPicker {rows} current={view.version} building={building?.next ?? null} onpick={onview} />
    <span class="counter days">{plural(view.sessions.length, "session")}</span>
    {#if view.generation.manualEdit}<span class="pill neutral edited">edited by you</span>{/if}
    {#if editor}
      <button
        type="button"
        class="btn small select-toggle"
        aria-pressed={editor.selecting}
        disabled={!canEdit}
        title={lockReason ?? (editor.selecting ? "Leave select mode" : "Tick exercises to move or superset them together")}
        onclick={() => editor.setSelecting(!editor.selecting)}
      >
        <Icon name="list-check" />{editor.selecting ? "Done" : "Select"}
      </button>
    {/if}
    <button type="button" class="strip-toggle" aria-expanded={open} onclick={() => (open = !open)}>
      {open ? "Hide" : "Show"} draft <Icon name="chevron" />
    </button>
  </div>

  {#if building}
    <div class="building" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <span>Building <strong>v{building.next}</strong> · v{latest} shown until it lands</span>
      <span class="elapsed">{building.elapsed}</span>
      <button type="button" class="btn small" onclick={() => oncancel?.()}>Cancel</button>
    </div>
  {/if}

  {#if weeks.length > 1 && onweek}
    <div class="weeks">
      <DraftWeekTabs {weeks} value={view.week} onchange={pickWeek} />
    </div>
  {/if}

  <div class="summary">
    {#if view.version > 1}
      <strong>{plural(view.changes.length, "change")}</strong>
      <span class="muted">since v{view.version - 1}{weeks.length > 1 ? ` in W${view.week}` : ""}{view.changes.length ? ` · ${changeSummary(view.changes)}` : ""}</span>
    {:else}
      <span class="muted">First draft</span>
    {/if}
    <label class="mark-toggle"><input type="checkbox" bind:checked={showChanges} /> Mark changes</label>
    {#if lockReason}
      <span class="edit-hint"><Icon name="lock" />{lockReason}</span>
    {:else if editor?.selecting}
      <span class="edit-hint">Tick exercises, then act from the bar below.</span>
    {/if}
  </div>

  <div class="scroll">
    <div class="body" class:dim={building !== null}>
      {#each view.sessions as s, i (i)}
        <div class="session-slot" data-day={i + 1}>
          <SessionCard
            name={s.name}
            tag={tags[i]}
            kind={s.kind}
            cardio={s.cardio}
            exercises={s.exercises}
            marks={marksByDay[i]}
            editable={s.kind === "cardio" ? undefined : editableFor(i + 1)}
          />
        </div>
      {/each}
    </div>
  </div>

  {#if editor && view.generation.draft}
    <DraftEditDock {editor} draft={view.generation.draft} week={opWeek} labels={roleLabels.all} keepOrder={view.generation.trainerOrder} />
  {/if}

  <div class="foot">
    <Icon name="lock" />
    <span>Approving creates a draft program. Your client sees nothing until you activate it.</span>
    <a
      class="btn"
      href={reviewHref}
      aria-disabled={building !== null}
      tabindex={building !== null ? -1 : undefined}
      class:disabled={building !== null}>Review v{latest} to approve</a
    >
  </div>
</section>

<style>
  .pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
  }
  .pane-head {
    gap: 10px;
    flex: none;
  }
  .strip-toggle {
    display: none;
  }
  .weeks {
    flex: none;
    padding: 6px 12px 0;
    border-bottom: 1px solid var(--line);
  }
  .select-toggle {
    margin-left: auto;
  }
  .select-toggle[aria-pressed="true"] {
    background: var(--hover-ink);
    color: var(--on-ink);
    border-color: var(--hover-ink);
  }
  .select-toggle :global(svg) {
    width: 14px;
    height: 14px;
  }
  .edit-hint {
    flex-basis: 100%;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .edit-hint :global(svg) {
    width: 12px;
    height: 12px;
    flex: none;
  }
  .building {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 16px;
    background: var(--pulse-now-bg);
    border-bottom: 1px solid var(--blue-line);
    font-size: 13px;
    flex: none;
  }
  .building .btn {
    margin-left: auto;
  }
  .elapsed {
    font: 500 12px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 16px;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
    flex-wrap: wrap;
    flex: none;
  }
  .muted {
    color: var(--muted);
  }
  .mark-toggle {
    margin-left: auto;
    display: inline-flex;
    gap: 6px;
    align-items: center;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    position: relative;
  }
  /* session cards on the canvas, a gap between each */
  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .body.dim {
    opacity: 0.5;
  }
  .body :global(.session-body) {
    --row-pad-l: 24px;
  }
  .body :global(.exrow.flash) {
    animation: flash 1.6s cubic-bezier(0.16, 1, 0.3, 1);
    border-radius: 6px;
  }
  @keyframes flash {
    0% {
      background: var(--pulse-now-bg);
    }
    100% {
      background: transparent;
    }
  }
  .foot {
    padding: 11px 16px;
    border-top: 1px solid var(--line);
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--muted);
    flex: none;
  }
  .foot :global(svg) {
    width: 13px;
    height: 13px;
    flex: none;
  }
  .foot .btn {
    margin-left: auto;
    white-space: nowrap;
  }
  .foot .btn.disabled {
    opacity: 0.55;
    pointer-events: none;
  }
  .spinner {
    width: 11px;
    height: 11px;
    border-radius: 99px;
    border: 2px solid var(--blue-line);
    border-top-color: var(--blue);
    animation: spin 0.9s linear infinite;
    display: inline-block;
    flex: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 3s;
    }
    .body {
      transition: none;
    }
  }

  @media (max-width: 980px) {
    .pane {
      height: auto;
      box-shadow: var(--shadow-overlay);
    }
    .pane:not(.open) .summary,
    .pane:not(.open) .scroll,
    .pane:not(.open) .foot {
      display: none;
    }
    .pane:not(.open) .pane-head {
      border-bottom: 0;
      border-radius: 6px;
    }
    .scroll {
      max-height: 45vh;
    }
    .foot {
      flex-wrap: wrap;
    }
    .foot span {
      flex: 1 1 180px;
    }
    .pane-head {
      flex-wrap: nowrap;
      padding: 8px 12px;
    }
    .days,
    .edited {
      display: none;
    }
    .pane-head h2 {
      white-space: nowrap;
    }
    .select-toggle {
      padding-inline: 8px;
    }
    .pane:not(.open) .select-toggle {
      display: none;
    }
    .pane.open .select-toggle ~ .strip-toggle {
      margin-left: 0;
    }
    .strip-toggle {
      display: inline-flex;
      margin-left: auto;
      align-items: center;
      gap: 4px;
      background: none;
      border: 0;
      color: var(--blue);
      font: 500 13px/1 var(--font-ui);
      cursor: pointer;
      padding: 6px 2px;
      min-height: 32px;
      white-space: nowrap;
    }
    .strip-toggle :global(svg) {
      width: 14px;
      height: 14px;
    }
  }
</style>
