<script lang="ts">
  import type { PrescribedSetDto } from "$lib/api/types";

  let { sets }: { sets: PrescribedSetDto[] } = $props();

  const chip = (s: PrescribedSetDto) => ({
    warm: s.type === "warm_up",
    main: `${s.reps}${s.amrap ? "+" : ""}`,
    sub: [
      s.targetRpe ? `RPE ${s.targetRpe}` : null,
      s.restSeconds ? `${Math.round(s.restSeconds / 60) ? `${Math.round((s.restSeconds / 60) * 10) / 10}m` : `${s.restSeconds}s`}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  });
</script>

<span class="chips">
  {#each sets as s (s.setNumber)}
    {@const c = chip(s)}
    <span class="setchip" class:warm={c.warm}>
      <span class="rep">{c.main}</span>
      {#if c.sub}<span class="sub">{c.sub}</span>{/if}
    </span>
  {/each}
</span>

<style>
  .chips {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 5px;
  }
</style>
