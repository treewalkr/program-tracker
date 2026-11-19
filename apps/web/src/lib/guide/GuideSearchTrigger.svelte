<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import { guideSearch, isMac, openGuideSearch, searchShortcut } from "./searchState.svelte";

  /**
   * Opens the guide search palette from a guide page: a wide field-shaped bar
   * on the Guide index, a compact button on each guide. Also owns `/`, which
   * opens the palette on guide pages only (Exercises uses `/` for its own field).
   */
  let { variant }: { variant: "bar" | "button" } = $props();

  const TEXT = {
    en: { bar: "Search the guides — try “sick”", button: "Search", label: "Search the guides" },
    th: { bar: "ค้นหาในคู่มือ ลอง “ป่วย”", button: "ค้นหา", label: "ค้นหาในคู่มือ" },
  } as const;
  const t = $derived(TEXT[i18n.locale]);
  /** The trigger: `/` focuses it first, so closing the palette returns there. */
  let el = $state<HTMLButtonElement>();
  const keys = isMac ? "Meta+K /" : "Control+K /";

  const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement && !!target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");

  function onwindowkey(e: KeyboardEvent) {
    if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || guideSearch.open || typing(e.target)) return;
    if (document.querySelector("dialog[open]")) return;
    e.preventDefault();
    el?.focus({ preventScroll: true });
    openGuideSearch();
  }

  /** A printable key on the focused bar starts the search with that character. */
  function onbarkey(e: KeyboardEvent) {
    if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey || e.key === " " || e.key === "/") return;
    e.preventDefault();
    openGuideSearch(e.key);
  }
</script>

<svelte:window onkeydown={onwindowkey} />

{#if variant === "bar"}
  <button bind:this={el} type="button" class="bar" lang={i18n.locale} aria-label={t.label} aria-keyshortcuts={keys} onclick={() => openGuideSearch()} onkeydown={onbarkey}>
    <Icon name="search" />
    <span class="ph">{t.bar}</span>
    <kbd aria-hidden="true">/</kbd>
    <kbd aria-hidden="true">{searchShortcut}</kbd>
  </button>
{:else}
  <button bind:this={el} type="button" class="btn small find" aria-label={t.label} aria-keyshortcuts={keys} onclick={() => openGuideSearch()}>
    <Icon name="search" />
    <span class="txt">{t.button}</span>
    <kbd aria-hidden="true">{searchShortcut}</kbd>
  </button>
{/if}

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    max-width: 1040px;
    height: 40px;
    margin: 8px 0 8px;
    padding: 0 10px 0 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--muted);
    font: 400 14px/1.4 var(--font-ui);
    text-align: left;
    cursor: text;
    box-sizing: border-box;
    transition: border-color 120ms ease-out;
  }
  .bar:hover {
    border-color: var(--line-strong);
  }
  .bar:focus-visible {
    outline: none;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }
  .bar :global(svg),
  .find :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
  }
  .ph {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .bar:lang(th) .ph {
    line-height: 1.8;
  }
  kbd {
    flex: none;
    font: 500 11px/1 var(--font-mono);
    padding: 2px 5px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: 4px;
    background: var(--surface);
    color: var(--muted);
  }
  .find kbd {
    padding: 1px 4px;
  }
  @media (max-width: 720px) {
    .bar kbd {
      display: none;
    }
    .find {
      padding: 3px 8px;
    }
    .find .txt,
    .find kbd {
      display: none;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bar {
      transition: none;
    }
  }
</style>
