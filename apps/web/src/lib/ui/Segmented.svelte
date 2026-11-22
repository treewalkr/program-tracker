<script lang="ts" generics="T extends string">
  /**
   * A small hairline segmented control (ARIA radiogroup): one choice of a few,
   * the picked one filled Inverted Ink,
   * e.g. "Moves apply to: every week · week 3 only". Controlled: the parent
   * owns `value` and updates it in `onchange`. Arrow keys move the choice.
   * Under 720px or on a touch screen the choices wrap as separate 44px targets.
   */
  interface Item {
    value: T;
    label: string;
    /** Tooltip with the longer story behind the choice. */
    title?: string;
  }

  interface Props {
    items: Item[];
    value: T;
    onchange: (value: T) => void;
    /** Accessible name of the group. */
    label: string;
    /** Visible lead-in word before the choices ("Moves apply to"). */
    lead?: string;
    disabled?: boolean;
  }

  let { items, value, onchange, label, lead, disabled = false }: Props = $props();

  let group = $state<HTMLDivElement>();

  function onkeydown(e: KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = items.findIndex((x) => x.value === value);
    const next = items[(i + step + items.length) % items.length];
    onchange(next.value);
    group?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[items.indexOf(next)]?.focus();
  }
</script>

<div class="segmented" role="radiogroup" aria-label={label} bind:this={group}>
  {#if lead}<span class="subtle lead" aria-hidden="true">{lead}</span>{/if}
  {#each items as it (it.value)}
    <button
      type="button"
      role="radio"
      aria-checked={it.value === value}
      tabindex={it.value === value ? 0 : -1}
      class:on={it.value === value}
      title={it.title}
      {disabled}
      onclick={() => onchange(it.value)}
      {onkeydown}>{it.label}</button
    >
  {/each}
</div>

<style>
  .segmented { display: inline-flex; align-items: center; gap: 0; font-size: 12.5px; }
  .lead { margin-right: 8px; }
  button {
    border: 1px solid var(--line);
    background: none;
    font: 500 12px var(--font-ui);
    color: var(--muted);
    padding: 3px 10px;
    cursor: pointer;
    white-space: nowrap;
  }
  button + button { margin-left: -1px; }
  button:first-of-type { border-radius: var(--radius) 0 0 var(--radius); }
  button:last-of-type { border-radius: 0 var(--radius) var(--radius) 0; }
  button:only-of-type { border-radius: var(--radius); }
  button:hover:not(:disabled):not(.on) { color: var(--ink); background: var(--well); }
  /* Selected fills Inverted Ink like the toggle chips, so it reads at a glance in light and dark. */
  button.on { background: var(--hover-ink); border-color: var(--hover-ink); color: var(--on-ink); font-weight: 600; position: relative; }
  button:focus-visible { position: relative; z-index: 1; outline: 2px solid var(--focus); outline-offset: 1px; }
  button:disabled { cursor: default; opacity: 0.6; }
  /* A phone or a touch screen: the choices wrap instead of pushing the page wide
     (four HR methods were 459px on a 390px screen), each a separate 44px target. */
  @media (max-width: 720px), (pointer: coarse) {
    .segmented { display: flex; flex-wrap: wrap; gap: 6px; max-width: 100%; }
    .lead { flex-basis: 100%; margin: 0; }
    button { min-height: 44px; padding: 6px 14px; font-size: 14px; }
    button + button { margin-left: 0; }
    button, button:first-of-type, button:last-of-type { border-radius: var(--radius); }
  }
</style>
