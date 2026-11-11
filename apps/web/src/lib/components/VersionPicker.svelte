<script lang="ts">
  /**
   * Compact draft version switcher: one trigger ("v5 · latest ⌄") that opens
   * a listbox of every version, newest first — who made it (You / AI) and one
   * line on what changed. A running build shows as a disabled row on top.
   *
   * The list is a native popover (top layer, so the pane never clips it):
   * Esc or an outside tap closes it, arrows/Home/End move, Enter picks, and
   * focus returns to the trigger. Placed below the trigger, left edges
   * aligned, kept inside the viewport; above it when there's no room.
   */
  import { tick } from "svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import type { VersionRow } from "$lib/chatRefine";

  interface Props {
    /** Every version, oldest first (v1 = rows[0]). */
    rows: VersionRow[];
    /** Version shown. */
    current: number;
    /** Set while the next version builds. */
    building?: number | null;
    onpick: (version: number) => void;
  }

  let { rows, current, building = null, onpick }: Props = $props();

  const uid = $props.id();
  const listId = `versions-${uid}`;
  let trigger = $state<HTMLButtonElement>();
  let list = $state<HTMLDivElement>();
  let open = $state(false);
  let pos = $state({ top: 0, left: 0 });

  const latest = $derived(rows.length);
  const newestFirst = $derived([...rows].reverse());
  const isLatest = $derived(current === latest);

  const GAP = 4;
  const MARGIN = 8;

  function place() {
    if (!trigger || !list) return;
    const t = trigger.getBoundingClientRect();
    const w = list.offsetWidth;
    const h = list.offsetHeight;
    const left = Math.min(Math.max(MARGIN, t.left), window.innerWidth - w - MARGIN);
    const below = t.bottom + GAP;
    const top = below + h + MARGIN <= window.innerHeight ? below : Math.max(MARGIN, t.top - GAP - h);
    pos = { top, left };
  }

  const options = () => [...(list?.querySelectorAll<HTMLButtonElement>('[role="option"]:not([aria-disabled="true"])') ?? [])];

  function toggle() {
    if (open) return list?.hidePopover();
    list?.showPopover();
    place();
  }

  async function onToggle(e: ToggleEvent) {
    open = e.newState === "open";
    if (!open) {
      // Esc or a pick: focus back to the trigger. An outside tap leaves it where it landed.
      if (list?.contains(document.activeElement) || document.activeElement === document.body) trigger?.focus();
      return;
    }
    await tick();
    const all = options();
    (all.find((o) => o.getAttribute("aria-selected") === "true") ?? all[0])?.focus();
  }

  function pick(v: number) {
    list?.hidePopover();
    if (v !== current) onpick(v);
  }

  function onKey(e: KeyboardEvent) {
    const all = options();
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = Math.min(at + 1, all.length - 1);
    else if (e.key === "ArrowUp") next = Math.max(at - 1, 0);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = all.length - 1;
    else if (e.key === "Tab") {
      e.preventDefault();
      list?.hidePopover();
      return;
    }
    if (next !== null) {
      e.preventDefault();
      all[next]?.focus();
    }
  }

  // Keyboard users opening with ArrowDown/ArrowUp on the trigger, as with a select.
  function onTriggerKey(e: KeyboardEvent) {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !open) {
      e.preventDefault();
      toggle();
    }
  }

  // The page moving under an open list would strand it: scrolling or resizing closes it.
  $effect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "scroll" && list?.contains(e.target as Node)) return;
      list?.hidePopover();
    };
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, { capture: true });
    };
  });
</script>

<button
  type="button"
  class="trigger"
  class:open
  bind:this={trigger}
  aria-haspopup="listbox"
  aria-expanded={open}
  aria-controls={listId}
  aria-label="Draft version: v{current}, {isLatest ? 'latest' : 'older version'}. Change version"
  onclick={toggle}
  onkeydown={onTriggerKey}
>
  <span class="v">v{current}</span>
  <span class="mark" class:older={!isLatest}>{isLatest ? "latest" : "older"}</span>
  {#if building}<span class="spinner" aria-hidden="true"></span>{/if}
  <Icon name="chevron" />
</button>

<div
  class="list"
  id={listId}
  popover="auto"
  role="listbox"
  aria-label="Draft versions"
  tabindex="-1"
  bind:this={list}
  style:top="{pos.top}px"
  style:left="{pos.left}px"
  ontoggle={onToggle}
  onkeydown={onKey}
>
  {#if building}
    <div class="row building" role="option" aria-selected="false" aria-disabled="true">
      <span class="v">v{building}</span>
      <span class="by ai"><span class="spinner" aria-hidden="true"></span>AI</span>
      <span class="label">Building…</span>
    </div>
  {/if}
  {#each newestFirst as r (r.version)}
    <button
      type="button"
      class="row"
      role="option"
      aria-selected={r.version === current}
      tabindex="-1"
      title={r.label}
      onclick={() => pick(r.version)}
    >
      <span class="v">v{r.version}</span>
      <span class="by {r.by}">
        <Icon name={r.by === "you" ? "pencil" : "sparkle"} />{r.by === "you" ? "You" : "AI"}
      </span>
      <span class="label">{r.label}</span>
      <!-- The trigger already says "latest" while it is shown; the chip helps find it from an older one. -->
      <span>{#if r.version === latest && !isLatest}<span class="latest">latest</span>{/if}</span>
      <span class="tick" aria-hidden="true">{#if r.version === current}<Icon name="check" />{/if}</span>
    </button>
  {/each}
</div>

<style>
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 6px 0 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
    font: 500 12px/1 var(--font-ui);
    cursor: pointer;
    white-space: nowrap;
    flex: none;
  }
  .trigger:hover,
  .trigger.open {
    background: var(--well-2);
  }
  .trigger :global(svg) {
    width: 14px;
    height: 14px;
    color: var(--muted);
    transition: transform 140ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .trigger.open :global(svg) {
    transform: rotate(180deg);
  }
  .v {
    font: 600 12px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .mark {
    color: var(--muted);
  }
  .mark.older {
    color: var(--warn-ink);
  }

  .list {
    position: fixed;
    inset: auto;
    margin: 0;
    width: 340px;
    max-width: calc(100vw - 16px);
    max-height: min(360px, calc(100vh - 16px));
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 4px;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow-overlay);
  }
  .list:popover-open {
    animation: list-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .list:focus {
    outline: none;
  }
  @keyframes list-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }

  .row {
    display: grid;
    /* vN · who · label · latest · tick — fixed lead columns so labels line up. */
    grid-template-columns: 3.4ch 3.6em minmax(0, 1fr) auto 16px;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 34px;
    padding: 0 8px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--ink);
    font: 400 13px/1.2 var(--font-ui);
    text-align: left;
    cursor: pointer;
  }
  .row:focus {
    outline: none;
  }
  .row:hover,
  .row:focus-visible {
    background: var(--well-2);
  }
  .row[aria-selected="true"] .v {
    color: var(--blue);
  }
  .row.building {
    cursor: default;
    color: var(--muted);
    background: var(--pulse-now-bg);
    grid-template-columns: 3.4ch 3.6em minmax(0, 1fr);
  }
  .by {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .by :global(svg) {
    width: 12px;
    height: 12px;
  }
  .by.you {
    color: var(--ink);
  }
  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
  }
  .latest {
    font-size: 11px;
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 2px 6px;
  }
  .tick {
    display: inline-flex;
    color: var(--blue);
  }
  .tick :global(svg) {
    width: 14px;
    height: 14px;
  }

  .spinner {
    width: 10px;
    height: 10px;
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

  /* Touch: rows a thumb can hit. */
  @media (pointer: coarse) {
    .trigger {
      height: 32px;
    }
    .row {
      min-height: 44px;
      font-size: 14px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .list:popover-open {
      animation: none;
    }
    .spinner {
      animation-duration: 3s;
    }
    .trigger :global(svg) {
      transition: none;
    }
  }
</style>
