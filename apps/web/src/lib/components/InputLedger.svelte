<script lang="ts">
  import type { LedgerRow } from "$lib/generateForm";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  /**
   * "What the AI reads": one row per generation input, with a lamp; empty inputs link to where they're fixed.
   * `loading`: the keys render, lamps and values shimmer (pass rows with empty values).
   */
  let { rows, compact = false, loading = false }: { rows: LedgerRow[]; compact?: boolean; loading?: boolean } = $props();
  const VALUE_W = ["78%", "92%", "56%", "70%", "84%", "48%", "88%", "62%"];
</script>

<ul class="gf-ledger" class:compact>
  {#each rows as r, i (r.key)}
    <li>
      {#if loading}
        <Skeleton shape="round" w="8px" h="8px" />
        <span class="k">{r.key}</span>
        <span class="v skel-v"><Skeleton shape="line" h="11px" w={VALUE_W[i % VALUE_W.length]} /></span>
      {:else}
        <span class="lamp {r.lamp}" aria-hidden="true"></span>
        <span class="k">{r.key}</span>
        <span class="v">{r.value}{#if r.link}{" "}<a href={r.link.href}>{r.link.label}</a>{/if}</span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .gf-ledger { list-style: none; margin: 0; padding: 0; }
  .gf-ledger li {
    display: grid;
    grid-template-columns: 8px 9.5rem 1fr;
    gap: 10px;
    align-items: baseline;
    padding: 8px 0;
    border-top: 1px solid var(--line-soft);
    font-size: 13px;
  }
  .gf-ledger li:first-child { border-top: 0; }
  .lamp { display: inline-block; width: 8px; height: 8px; border-radius: 99px; flex: none; transform: translateY(-1px); }
  .k { color: var(--muted); }
  .v { min-width: 0; overflow-wrap: anywhere; }
  .v a { white-space: nowrap; }
  .skel-v { display: flex; align-items: center; min-height: 1lh; }
  .compact li { grid-template-columns: 8px 1fr; padding: 7px 0; row-gap: 1px; }
  .compact .k { grid-column: 2; font-size: 12px; }
  .compact .v { grid-column: 2; }
</style>
