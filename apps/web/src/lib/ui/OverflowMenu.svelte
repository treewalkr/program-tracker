<script module lang="ts">
  import type { IconName } from "./Icon.svelte";

  export interface OverflowItem {
    label: string;
    icon?: IconName;
    /** Shown after the label, muted: "pain or technique". */
    hint?: string;
    disabled?: boolean;
    tone?: "danger";
    onselect: () => void;
  }
</script>

<script lang="ts">
  /**
   * A "⋯ More" button that opens a short action menu (ARIA menu pattern). The
   * menu is a native popover: it sits in the top layer (no clipping by cards
   * or panels), closes on Esc or an outside tap, and is placed off the trigger
   * — below it, right edges aligned; above it when there's no room.
   */
  import { tick } from "svelte";
  import Icon from "./Icon.svelte";

  interface Props {
    items: OverflowItem[];
    /** The trigger's accessible name: "More actions for Bench press". */
    label: string;
    /** Visible trigger word beside the dots; omit for an icon-only trigger. */
    text?: string;
  }

  let { items, label, text }: Props = $props();

  const uid = $props.id();
  const menuId = `overflow-${uid}`;
  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let open = $state(false);
  let pos = $state({ top: 0, left: 0 });

  const GAP = 4;
  const MARGIN = 8;

  function place() {
    if (!trigger || !menu) return;
    const t = trigger.getBoundingClientRect();
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    const left = Math.min(Math.max(MARGIN, t.right - w), window.innerWidth - w - MARGIN);
    const below = t.bottom + GAP;
    const top = below + h + MARGIN <= window.innerHeight ? below : Math.max(MARGIN, t.top - GAP - h);
    pos = { top, left };
  }

  const enabled = () => [...(menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];

  function toggle() {
    if (open) return menu?.hidePopover();
    menu?.showPopover();
    // Placed in the same frame it opens: measured now, painted once, at the trigger.
    place();
  }

  async function onToggle(e: ToggleEvent) {
    open = e.newState === "open";
    if (!open) {
      // Esc or picking an item: focus goes back to the trigger. An outside tap leaves it where it landed.
      if (menu?.contains(document.activeElement) || document.activeElement === document.body) trigger?.focus();
      return;
    }
    await tick();
    enabled()[0]?.focus();
  }

  function pick(item: OverflowItem) {
    menu?.hidePopover();
    item.onselect();
  }

  function onKey(e: KeyboardEvent) {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: number | null = null;
    if (e.key === "ArrowDown") next = (at + 1) % list.length;
    else if (e.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else if (e.key === "Tab") {
      e.preventDefault();
      menu?.hidePopover();
      return;
    }
    if (next !== null) {
      e.preventDefault();
      list[next]?.focus();
    }
  }

  // The page moving under an open menu would strand it: scrolling or resizing closes it.
  $effect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e.type === "scroll" && menu?.contains(e.target as Node)) return;
      menu?.hidePopover();
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
  class="btn ghost small trigger"
  class:open
  class:icon-only={!text}
  bind:this={trigger}
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={menuId}
  aria-label={label}
  onclick={toggle}
>
  <Icon name="more" />
  {#if text}<span>{text}</span>{/if}
</button>

<div
  class="menu"
  id={menuId}
  popover="auto"
  role="menu"
  aria-label={label}
  tabindex="-1"
  bind:this={menu}
  style:top="{pos.top}px"
  style:left="{pos.left}px"
  ontoggle={onToggle}
  onkeydown={onKey}
>
  {#each items as item (item.label)}
    <button
      type="button"
      class="item"
      class:danger={item.tone === "danger"}
      role="menuitem"
      tabindex="-1"
      disabled={item.disabled}
      onclick={() => pick(item)}
    >
      {#if item.icon}<Icon name={item.icon} />{/if}
      <span class="label">{item.label}</span>
      {#if item.hint}<span class="hint">{item.hint}</span>{/if}
    </button>
  {/each}
</div>

<style>
  .trigger { gap: 6px; }
  .trigger.icon-only { padding-inline: 6px; }
  .trigger.open { background: var(--well-2); }
  .trigger :global(svg) { width: 16px; height: 16px; }

  .menu {
    position: fixed;
    inset: auto;
    margin: 0;
    min-width: 200px;
    max-width: calc(100vw - 16px);
    padding: 4px;
    color: var(--ink);
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow-overlay);
  }
  .menu:popover-open { animation: menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1); }
  .menu:focus { outline: none; }
  @keyframes menu-in {
    from { opacity: 0; transform: translateY(-4px); }
  }

  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--ink);
    font: 400 14px/1 var(--font-ui);
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
  }
  .item :global(svg) { flex: 0 0 auto; width: 16px; height: 16px; color: var(--muted); }
  .item:focus { outline: none; }
  .item:hover:not(:disabled),
  .item:focus-visible { background: var(--well-2); }
  .item:hover :global(svg),
  .item:focus-visible :global(svg) { color: var(--ink); }
  .item:disabled { color: var(--faint); cursor: default; }
  .item:disabled :global(svg) { color: var(--faint); }
  .item.danger { color: var(--bad); }
  .item.danger :global(svg) { color: var(--bad); }
  .hint { margin-left: auto; padding-left: 16px; font-size: 12px; color: var(--muted); }

  /* Touch: rows a thumb can hit. */
  @media (pointer: coarse) {
    .item { height: 44px; font-size: 15px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .menu:popover-open { animation: none; }
  }
</style>
