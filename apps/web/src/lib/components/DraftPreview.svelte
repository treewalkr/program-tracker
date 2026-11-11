<script lang="ts">
  import type { SlotChange } from "@pt/shared";
  import { changeSummary, type VersionView } from "$lib/chatRefine";
  import { draftSessionTags } from "$lib/draftReview";
  import SessionCard, { type SlotMark } from "$lib/components/SessionCard.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Draft pane beside the chat. Shows one version of the draft (switchable),
   * marks the exercise slots that changed from the version before it (amber
   * when the change was not in the proposal), and — while a new version
   * builds — keeps the current one visible, dimmed, with elapsed time and
   * Cancel. Approving happens only on the review page. On narrow screens the
   * pane collapses to its head row (`open` toggles it).
   */
  interface Props {
    view: VersionView;
    /** Newest version number (the switcher shows 1…latest). */
    latest: number;
    /** Changes outside the proposal, for the shown version; empty if none or not proposal-built. */
    unproposed?: SlotChange[];
    /** Set while a new version builds. */
    building?: { next: number; elapsed: string } | null;
    reviewHref: string;
    onview: (version: number) => void;
    oncancel?: () => void;
    /** Narrow screens: expanded or collapsed to the head row. */
    open?: boolean;
  }

  let {
    view,
    latest,
    unproposed = [],
    building = null,
    reviewHref,
    onview,
    oncancel,
    open = $bindable(false),
  }: Props = $props();

  let showChanges = $state(true);

  const versions = $derived(Array.from({ length: latest }, (_, i) => i + 1));
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;

  const keyOf = (c: SlotChange) => `${c.day}:${c.beforeSlot}:${c.afterSlot}:${c.kind}`;
  const unproposedKeys = $derived(new Set(unproposed.map(keyOf)));

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
    <h2>Draft v{view.version}</h2>
    <div class="vswitch" role="group" aria-label="Draft version">
      {#each versions as v (v)}
        <button type="button" aria-pressed={view.version === v} onclick={() => onview(v)}>v{v}</button>
      {/each}
      {#if building}
        <button type="button" disabled><span class="spinner" aria-hidden="true"></span>v{building.next}</button>
      {/if}
    </div>
    <span class="counter days">{plural(view.sessions.length, "session")}</span>
    {#if view.version !== latest}<span class="pill neutral">older version</span>{/if}
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

  <div class="summary">
    {#if view.version > 1}
      <strong>{plural(view.changes.length, "change")}</strong>
      <span class="muted">since v{view.version - 1}{view.changes.length ? ` · ${changeSummary(view.changes)}` : ""}</span>
    {:else}
      <span class="muted">First draft</span>
    {/if}
    <label class="mark-toggle"><input type="checkbox" bind:checked={showChanges} /> Mark changes</label>
  </div>

  <div class="scroll">
    <div class="body" class:dim={building !== null}>
      {#each view.sessions as s, i (i)}
        <div class="session-slot" data-day={i + 1}>
          <SessionCard name={s.name} tag={tags[i]} kind={s.kind} cardio={s.cardio} exercises={s.exercises} marks={marksByDay[i]} />
        </div>
      {/each}
    </div>
  </div>

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
  .vswitch {
    display: inline-flex;
    border: 1px solid var(--line);
    border-radius: 6px;
    overflow: hidden;
    background: var(--surface);
  }
  .vswitch button {
    font: 500 12px/1 var(--font-mono);
    padding: 5px 8px;
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .vswitch button + button {
    border-left: 1px solid var(--line);
  }
  .vswitch button[aria-pressed="true"] {
    background: var(--hover-ink);
    color: var(--on-ink);
  }
  .vswitch button:disabled {
    cursor: default;
    color: var(--blue);
    background: var(--pulse-now-bg);
  }
  .strip-toggle {
    display: none;
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
  .body {
    transition: opacity 0.35s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .body.dim {
    opacity: 0.5;
  }
  .body :global(.session-body) {
    --row-pad-l: 24px;
  }
  .session-slot + .session-slot {
    border-top: 1px solid var(--line);
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
    .days {
      display: none;
    }
    .vswitch button {
      padding: 7px 9px;
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
