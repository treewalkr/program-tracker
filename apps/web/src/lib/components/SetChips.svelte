<script lang="ts">
  import type { PrescribedSetDto } from "$lib/api/types";

  let { sets }: { sets: PrescribedSetDto[] } = $props();

  const chip = (s: PrescribedSetDto) => ({
    warm: s.type === "warm_up",
    main: `${s.targetWeightKg != null ? `${s.targetWeightKg}kg × ` : ""}${s.reps}${s.amrap ? "+" : ""}`,
    rpe: s.targetRpe ?? null,
    sub: [
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
      {#if c.rpe}<span class="sub rpe" class:rpe-mid={c.rpe >= 7} class:rpe-high={c.rpe >= 9}>@{c.rpe}</span>{/if}
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
  /* RPE scale — same thresholds as the Rpe component (≤6 green · 7–8 amber · 9–10 red);
     colors tuned AA on the chip's #f4f5f2 background at 12–13px semibold */
  .rpe { color: #3f6339; font-weight: 600; }
  .rpe-mid { color: #7a520d; }
  .rpe-high { color: #a63a29; }
</style>
