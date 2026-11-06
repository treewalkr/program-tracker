<script lang="ts">
  import type { ProviderDto } from "$lib/api/types";
  import ProviderPicker from "./ProviderPicker.svelte";

  /** One-line model summary that opens the provider/model/effort picker in a popover. Escape closes. */
  let {
    providers,
    providerId = $bindable(""),
    model = $bindable(""),
    effort = $bindable(""),
    hint = "Applies to this draft's next turns.",
  }: { providers: ProviderDto[]; providerId: string; model: string; effort: string; hint?: string } = $props();

  let open = $state(false);
  let btn = $state<HTMLButtonElement | null>(null);
  const provider = $derived(providers.find((p) => p.id === providerId) ?? null);
  const label = $derived(model || provider?.model || "model");
  const effortLabel = $derived(effort || provider?.defaultEffort || "");
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "Escape" && open) {
      open = false;
      btn?.focus();
    }
  }}
/>

<div class="ms">
  <button bind:this={btn} type="button" class="ms-btn" aria-expanded={open} aria-controls="ms-pop" onclick={() => (open = !open)}>
    <b>{label}</b>{#if effortLabel}<span> · {effortLabel} effort</span>{/if}
  </button>
  {#if open}
    <div class="ms-pop" id="ms-pop" role="dialog" aria-label="Model settings">
      <ProviderPicker {providers} bind:providerId bind:model bind:effort idPrefix="ms" />
      <p>{hint}</p>
    </div>
  {/if}
</div>

<style>
  .ms {
    position: relative;
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
  .ms-pop {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    width: 320px;
    max-width: calc(100vw - 32px);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 6px;
    box-shadow: var(--shadow-overlay);
    padding: 12px;
    display: grid;
    gap: 10px;
    z-index: 6;
  }
  .ms-pop p {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  @media (max-width: 560px) {
    .ms-pop {
      position: fixed;
      left: 12px;
      right: 12px;
      bottom: 110px;
      width: auto;
      max-width: none;
    }
  }
</style>
