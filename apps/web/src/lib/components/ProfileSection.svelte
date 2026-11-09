<script lang="ts">
  import type { Snippet } from "svelte";
  import Panel from "$lib/ui/Panel.svelte";

  /**
   * One topic of a client profile as its own Primer Box: 14px/600 title with
   * a one-line muted purpose in the head, fields in the body. Stack several
   * inside a `.pf` form.
   */
  let { title, purpose, children }: { title: string; purpose?: string; children: Snippet } = $props();
</script>

<Panel {title} class="ps">
  {#snippet act()}
    {#if purpose}<span class="ps-purpose">{purpose}</span>{/if}
  {/snippet}
  <div class="panel-body ps-body">
    {@render children()}
  </div>
</Panel>

<style>
  .ps-purpose { font: 400 13px/1.3 var(--font-ui); color: var(--muted); }
  .ps-body { display: flex; flex-direction: column; gap: 14px; }
</style>
