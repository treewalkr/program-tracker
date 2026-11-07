<script lang="ts">
  import type { ProviderDto } from "$lib/api/types";
  import ProviderPicker from "./ProviderPicker.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import { effortSummary } from "$lib/effort";

  /** One-line model summary that opens the provider/model/effort picker in a popover. Escape, the close button or a tap outside closes it. */
  let {
    providers,
    providerId = $bindable(""),
    model = $bindable(""),
    effort = $bindable(""),
    hint = "Applies to this draft's next turns.",
  }: { providers: ProviderDto[]; providerId: string; model: string; effort: string; hint?: string } = $props();

  let open = $state(false);
  let btn = $state<HTMLButtonElement | null>(null);
  let root = $state<HTMLDivElement | null>(null);

  function close(refocus = true) {
    open = false;
    if (refocus) btn?.focus();
  }
  const provider = $derived(providers.find((p) => p.id === providerId) ?? null);
  const label = $derived(model || provider?.model || "model");
  const effortLabel = $derived(effort || provider?.defaultEffort || "");
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && open) close();
  }}
  onpointerdown={(e) => {
    // iPad has no Escape key: a tap anywhere outside closes the popover.
    if (open && root && !root.contains(e.target as Node)) close(false);
  }}
/>

<div class="ms" bind:this={root}>
  <button
    bind:this={btn}
    type="button"
    class="ms-btn"
    aria-expanded={open}
    aria-controls="ms-pop"
    title="Change model"
    onclick={() => (open = !open)}
  >
    <b>{label}</b>{#if effortLabel}<span> · {effortSummary(effortLabel)}</span>{/if}
    <Icon name="chevron" />
  </button>
  {#if open}
    <div class="ms-pop" id="ms-pop" role="dialog" aria-labelledby="ms-title">
      <div class="ms-head">
        <h3 id="ms-title">Model</h3>
        <button type="button" class="ms-close" aria-label="Close" title="Close" onclick={() => close()}>
          <Icon name="x" />
        </button>
      </div>
      <div class="ms-body">
        <ProviderPicker {providers} bind:providerId bind:model bind:effort idPrefix="ms" />
      </div>
      <p class="ms-hint">{hint}</p>
    </div>
  {/if}
</div>

<style>
  .ms {
    position: relative;
    min-width: 0; /* shrink in a narrow composer row instead of pushing Send out */
  }
  .ms-btn {
    font: 400 12px/1 var(--font-ui);
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: none;
    border: 1px solid transparent;
    border-radius: 6px;
    cursor: pointer;
    padding: 5px 6px;
    white-space: nowrap;
    max-width: 100%;
  }
  .ms-btn span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .ms-btn:hover,
  .ms-btn[aria-expanded="true"] {
    border-color: var(--line);
    color: var(--ink);
  }
  .ms-btn b {
    font: 500 12px/1 var(--font-mono);
    color: var(--ink);
  }
  .ms-btn :global(svg) {
    width: 12px;
    height: 12px;
    flex: none;
    transform: rotate(180deg); /* the popover opens upward */
    transition: transform 120ms ease-out;
  }
  .ms-btn[aria-expanded="true"] :global(svg) {
    transform: none;
  }
  .ms-pop {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    width: 300px;
    max-width: calc(100vw - 92px); /* room for the rail and page padding on a phone */
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: var(--shadow-overlay);
    z-index: 6;
  }
  .ms-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 6px 6px 12px;
    background: var(--well);
    border-bottom: 1px solid var(--line-soft);
    border-radius: 6px 6px 0 0;
  }
  .ms-head h3 {
    margin: 0;
    font: 600 13px/1.4 var(--font-ui);
    color: var(--ink);
  }
  .ms-close {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .ms-close :global(svg) {
    width: 14px;
    height: 14px;
  }
  .ms-close:hover {
    background: var(--well-2);
    color: var(--ink);
  }
  .ms-body {
    padding: 12px;
  }
  /* One column: model names are long, side-by-side selects truncate them. */
  .ms-body :global(.picker) {
    flex-direction: column;
    align-items: stretch;
  }
  .ms-body :global(.picker > div) {
    flex: none;
  }
  .ms-hint {
    margin: 0;
    padding: 0 12px 12px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--muted);
  }
  @media (prefers-reduced-motion: reduce) {
    .ms-btn :global(svg) {
      transition: none;
    }
  }
</style>
