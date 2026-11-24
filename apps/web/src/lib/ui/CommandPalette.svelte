<script lang="ts" module>
  export interface PaletteGroup<T> {
    id: string;
    label: string;
    items: T[];
  }
</script>

<script lang="ts" generics="T">
  import { tick, type Snippet } from "svelte";
  import Icon from "./Icon.svelte";

  /**
   * A ⌘K command palette: a search field over grouped results on a native
   * modal `<dialog>` (focus trap, Esc, top layer). It navigates rather than
   * holds a value, so it isn't one of the selects. Focus stays in the field
   * (combobox + aria-activedescendant); ↑↓ wrap, PageUp/PageDown jump 8,
   * Enter picks, ⌘/Ctrl+Enter picks for a new tab. Closing returns focus to
   * whatever opened it.
   */
  interface Props {
    open?: boolean;
    query?: string;
    /** Accessible name of the dialog, field and list. */
    label: string;
    placeholder?: string;
    groups: PaletteGroup<T>[];
    /** Stable id for an item (row ids, keyed each). */
    key: (item: T) => string;
    /** One row's content; the second argument is whether it's the active row. */
    row: Snippet<[T, boolean]>;
    onpick: (item: T, opts: { newTab: boolean }) => void;
    /** Shown in place of the list when no group has items. */
    empty?: Snippet;
    /** Footer key hints: [keys, what they do]. */
    hints?: [string, string][];
    /** Quiet text at the footer's right end. */
    note?: string;
    /** Read out politely when results change ("4 results"). */
    status?: string;
    /** Text for the Esc chip (the close button; touch screens show ✕ instead). */
    escLabel?: string;
    /** Accessible name of the close button. */
    closeLabel?: string;
    lang?: string;
  }

  let {
    open = $bindable(false),
    query = $bindable(""),
    label,
    placeholder = label,
    groups,
    key,
    row,
    onpick,
    empty,
    hints = [],
    note,
    status = "",
    escLabel = "esc",
    closeLabel = "Close",
    lang,
  }: Props = $props();

  const uid = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLDivElement>();
  let opener: HTMLElement | null = null;

  const flat = $derived(groups.flatMap((g) => g.items));
  /** Index of each group's first item in `flat`. */
  const starts = $derived(groups.reduce<number[]>((acc, g, i) => [...acc, i ? acc[i - 1] + groups[i - 1].items.length : 0], []));
  let active = $state(0);

  // New results: back to the top.
  $effect(() => {
    void flat;
    active = 0;
  });

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      void tick().then(() => {
        input?.focus();
        input?.setSelectionRange(query.length, query.length);
      });
    } else if (!open && dialog.open) {
      dialog.close();
    }
  });

  function restoreFocus() {
    open = false;
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    opener = null;
  }

  $effect(() => {
    if (!open || !list) return;
    list.querySelector(`#${CSS.escape(`${uid}-${active}`)}`)?.scrollIntoView({ block: "nearest" });
  });

  function pick(item: T | undefined, newTab: boolean) {
    if (item === undefined) return;
    // Opening in a new tab keeps the trainer's place: the palette stays.
    if (!newTab) {
      opener = null; // the new page decides focus
      open = false;
    }
    onpick(item, { newTab });
  }

  function onkeydown(e: KeyboardEvent) {
    const n = flat.length;
    if (e.isComposing) return;
    switch (e.key) {
      case "ArrowDown":
        if (n) active = (active + 1) % n;
        break;
      case "ArrowUp":
        if (n) active = (active - 1 + n) % n;
        break;
      case "PageDown":
        if (n) active = Math.min(n - 1, active + 8);
        break;
      case "PageUp":
        if (n) active = Math.max(0, active - 8);
        break;
      case "Enter":
        pick(flat[active], e.metaKey || e.ctrlKey);
        break;
      default:
        return;
    }
    e.preventDefault();
  }
</script>

<dialog
  bind:this={dialog}
  class="palette"
  aria-label={label}
  {lang}
  onclose={restoreFocus}
  onclick={(e) => {
    // A click on the backdrop (the dialog box itself, not its content) closes.
    if (e.target === dialog) open = false;
  }}
>
  {#if open}
    <div class="bar">
      <Icon name="search" />
      <input
        bind:this={input}
        bind:value={query}
        type="text"
        role="combobox"
        aria-label={label}
        aria-expanded="true"
        aria-controls="{uid}-list"
        aria-autocomplete="list"
        aria-activedescendant={flat.length ? `${uid}-${active}` : undefined}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        enterkeyhint="go"
        {placeholder}
        {onkeydown}
      />
      <!-- The Esc hint doubles as the close button: a tap target on touch screens. -->
      <button type="button" class="close" aria-label={closeLabel} onclick={() => (open = false)}>
        <kbd aria-hidden="true">{escLabel}</kbd>
        <Icon name="x" />
      </button>
    </div>

    <div class="list" role="listbox" id="{uid}-list" aria-label={label} bind:this={list}>
      {#each groups as g, gi (g.id)}
        {#if g.items.length}
          <div role="group" aria-labelledby="{uid}-g{gi}">
            <div class="grp" id="{uid}-g{gi}">{g.label}<span class="cnt" aria-hidden="true">{g.items.length}</span></div>
            {#each g.items as item, j (key(item))}
              {@const i = starts[gi] + j}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                id="{uid}-{i}"
                role="option"
                tabindex="-1"
                aria-selected={i === active}
                class="opt"
                class:on={i === active}
                onpointerdown={(e) => e.preventDefault()}
                onpointermove={() => (active = i)}
                onclick={(e) => pick(item, e.metaKey || e.ctrlKey)}
              >
                <div class="cell">{@render row(item, i === active)}</div>
                <kbd class="enter" aria-hidden="true">↵</kbd>
              </div>
            {/each}
          </div>
        {/if}
      {/each}
      {#if !flat.length && empty}<div class="empty">{@render empty()}</div>{/if}
    </div>

    <p class="sr-only" aria-live="polite">{status}</p>

    {#if hints.length || note}
      <footer>
        {#each hints as [keys, what] (keys)}
          <span class="hint"><kbd>{keys}</kbd>{what}</span>
        {/each}
        {#if note}<span class="aside">{note}</span>{/if}
      </footer>
    {/if}
  {/if}
</dialog>

<style>
  .palette {
    width: min(640px, calc(100vw - 32px));
    max-width: none;
    max-height: none;
    margin: 12vh auto auto;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-overlay);
    overflow: hidden;
  }
  .palette[open] {
    display: flex;
    flex-direction: column;
    animation: palette-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .palette::backdrop {
    background: var(--scrim);
  }
  @keyframes palette-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 12px 0 16px;
    border-bottom: 1px solid var(--line);
    flex: none;
  }
  .bar :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--muted);
  }
  .bar input {
    flex: 1 1 auto;
    min-width: 0;
    height: 100%;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--ink);
    font: 400 var(--field-font, 15px)/1.4 var(--font-ui);
    outline: none;
  }
  .bar input::placeholder {
    color: var(--muted);
  }
  /* The field is the whole bar: show focus on the bar's hairline. */
  .bar:focus-within {
    box-shadow: inset 0 -2px 0 var(--blue);
  }

  kbd {
    font: 500 11px/1 var(--font-mono);
    padding: 2px 5px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--surface);
    color: var(--muted);
    white-space: nowrap;
  }

  .close {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--focus);
  }
  .bar .close :global(svg) {
    display: none;
  }
  /* Touch: no Esc key to hint at — a ✕ with a 44px target. */
  @media (hover: none) {
    .close {
      width: 44px;
      height: 44px;
      margin-right: -8px;
    }
    .close kbd {
      display: none;
    }
    .bar .close :global(svg) {
      display: block;
      width: 18px;
      height: 18px;
    }
  }

  .list {
    max-height: min(420px, 60vh);
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 0 6px;
    scroll-padding-top: 30px;
  }
  .grp {
    position: sticky;
    top: 0;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 16px 4px;
    background: var(--surface);
    font: 600 12px var(--font-ui);
    color: var(--muted);
  }
  .cnt {
    margin-left: auto;
    font: 500 11px var(--font-mono);
    background: var(--well-2);
    border-radius: 99px;
    padding: 0 6px;
  }
  .opt {
    position: relative;
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0 6px;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
  }
  .opt.on {
    background: var(--well-2);
  }
  .opt.on::before {
    content: "";
    position: absolute;
    left: -6px;
    top: 6px;
    bottom: 6px;
    width: 2px;
    border-radius: 2px;
    background: var(--blue);
  }
  .cell {
    flex: 1 1 auto;
    min-width: 0;
  }
  .enter {
    flex: none;
    visibility: hidden;
  }
  .opt.on .enter {
    visibility: visible;
  }
  .opt :global(mark) {
    background: var(--warn-bg);
    color: inherit;
    border-radius: 2px;
    font-weight: 600;
  }
  .empty {
    padding: 20px 16px 14px;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.55;
  }

  footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 14px;
    padding: 8px 16px;
    border-top: 1px solid var(--line);
    background: var(--well);
    font: 400 12px/1.4 var(--font-ui);
    color: var(--muted);
    flex: none;
  }
  .hint {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .aside {
    margin-left: auto;
  }

  .palette:lang(th) .bar input,
  .palette:lang(th) .empty {
    line-height: 1.8;
  }

  @media (max-width: 720px) {
    .palette {
      width: calc(100vw - 16px);
      margin-top: 8px;
    }
    .list {
      max-height: calc(100dvh - 48px - 16px - 48px);
    }
    .opt {
      min-height: 44px;
    }
    .hint {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .palette[open] {
      animation: none;
    }
  }
</style>
