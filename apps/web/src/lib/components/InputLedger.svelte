<script lang="ts">
  import type { LedgerRow } from "$lib/generateForm";

  /** "What the AI reads": one row per generation input, with a lamp; empty inputs link to where they're fixed. */
  let { rows, compact = false }: { rows: LedgerRow[]; compact?: boolean } = $props();
</script>

<ul class="gf-ledger" class:compact>
  {#each rows as r (r.key)}
    <li>
      <span class="lamp {r.lamp}" aria-hidden="true"></span>
      <span class="k">{r.key}</span>
      <span class="v">{r.value}{#if r.link} <a href={r.link.href}>{r.link.label}</a>{/if}</span>
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
  .compact li { grid-template-columns: 8px 1fr; padding: 7px 0; row-gap: 1px; }
  .compact .k { grid-column: 2; font-size: 12px; }
  .compact .v { grid-column: 2; }
</style>
