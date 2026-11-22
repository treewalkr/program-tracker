<script lang="ts">
  import type { CardioPrescription, HrZone, ModalityLike } from "@pt/shared";
  import { intervalBreakdown, targetMetric } from "$lib/cardioTarget";
  import { units } from "$lib/units.svelte";

  /**
   * A cardio session's intervals, folded away under its one-line summary:
   * warm-up, work × reps, the recovery between them and cool-down, each with
   * its zone, bpm and pace. Renders nothing for a steady (interval-free) session.
   */
  interface Props {
    cardio: CardioPrescription | null | undefined;
    /** The member's bpm zones; null = zones show on their own. */
    zones?: readonly HrZone[] | null;
    /** The trainer's modalities, for the pace metric of a custom one. */
    modalities?: readonly Pick<ModalityLike, "name" | "metric">[];
    /** Start unfolded. */
    open?: boolean;
  }

  let { cardio, zones = null, modalities = [], open = false }: Props = $props();

  const lines = $derived(
    cardio?.intervals?.length
      ? intervalBreakdown(cardio.intervals, { zones, metric: targetMetric(cardio.modality, modalities), unit: units.distance })
      : []
  );
</script>

{#if lines.length}
  <details class="ivb" {open}>
    <summary>Interval breakdown <span class="n">{lines.length} parts</span></summary>
    <ol>
      {#each lines as l (l.key)}
        <li class="k-{l.kind}">
          <span class="name">{l.label}</span>
          <span class="amt">{l.amount}</span>
          <span class="tg">
            {#if l.zone}<b>{l.zone}</b>{/if}
            {#if l.bpm}<span>{l.bpm}</span>{/if}
            {#if l.pace}<span>{l.pace}</span>{/if}
            {#if l.rpe}<span>{l.rpe}</span>{/if}
          </span>
          {#if l.notes}<span class="note">{l.notes}</span>{/if}
        </li>
      {/each}
    </ol>
  </details>
{/if}

<style>
  .ivb { border: 1px solid var(--line); border-radius: var(--radius); background: var(--panel, transparent); font-size: 13px; }
  summary { cursor: pointer; padding: 6px 10px; font: 500 12px var(--font-ui); color: var(--ink); list-style-position: inside; }
  summary:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus-ring); border-radius: var(--radius); }
  .n { margin-left: 6px; color: var(--muted); font-weight: 400; }
  ol { list-style: none; margin: 0; padding: 0; border-top: 1px solid var(--line-soft); }
  li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 2px 12px;
    padding: 6px 10px 6px 12px;
    border-bottom: 1px solid var(--line-soft);
    border-left: 3px solid var(--well-2);
  }
  li:last-child { border-bottom: 0; }
  li.k-work { border-left-color: var(--blue); }
  li.k-recovery { border-left-color: var(--good-line); background: var(--well); }
  .name { font-weight: 500; }
  li.k-work .name { font-weight: 600; }
  .amt { font: 400 12px var(--font-mono); text-align: right; }
  .tg { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 2px 10px; font: 400 12px var(--font-mono); color: var(--muted); }
  .tg b { font-weight: 600; color: var(--ink); }
  .tg:empty { display: none; }
  .note { grid-column: 1 / -1; font-size: 12px; color: var(--muted); }
  @media (max-width: 720px) {
    summary { min-height: 44px; display: flex; align-items: center; }
  }
</style>
