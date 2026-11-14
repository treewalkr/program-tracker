<script lang="ts" generics="T extends string">
  /**
   * A small hairline segmented control (ARIA radiogroup): one choice of a few,
   * e.g. "Moves apply to: every week · week 3 only". Controlled: the parent
   * owns `value` and updates it in `onchange`. Arrow keys move the choice.
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
  button + button { border-left: none; }
  button:first-of-type { border-radius: var(--radius) 0 0 var(--radius); }
  button:last-of-type { border-radius: 0 var(--radius) var(--radius) 0; }
  button:only-of-type { border-radius: var(--radius); }
  button:hover:not(:disabled):not(.on) { color: var(--ink); background: var(--well); }
  button.on { background: var(--well-2); color: var(--ink); font-weight: 600; }
  button:disabled { cursor: default; opacity: 0.6; }
</style>
