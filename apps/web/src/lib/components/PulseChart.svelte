<script lang="ts">
  import type { WeekMetrics } from "@pt/shared";

  /**
   * Weekly volume bars (contributions ramp) with an average-RPE line
   * overlaid on a fixed 6–10 right axis. Purely presentational — week
   * metrics come from `blockPulse` in the owning page; the chart only
   * derives scales and ramp steps. Planned-only weeks render as dashed
   * stubs; the RPE line gaps over weeks without an RPE.
   */
  interface Props {
    weeks: WeekMetrics[];
    /** 1-indexed current block week — marked with the blue tick. */
    pulseWeek: number;
  }

  let { weeks, pulseWeek }: Props = $props();

  const W = 640;
  const H = 190;
  const PAD_L = 42;
  const PAD_R = 30;
  const PAD_T = 12;
  const PAD_B = 24;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const logged = $derived(weeks.filter((w) => !w.plannedOnly && w.tonnage > 0));
  const rawMax = $derived(Math.max(...weeks.map((w) => w.tonnage), 1));

  // Round the tonnage ceiling to 1 / 2 / 2.5 / 5 × 10^k for clean ticks.
  const tMax = $derived.by(() => {
    const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const f = rawMax / pow;
    const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
    return nice * pow;
  });

  const band = $derived(plotW / Math.max(weeks.length, 1));
  const barW = $derived(Math.min(34, band * 0.56));

  const xOf = (i: number) => PAD_L + band * i + band / 2;
  const yOf = (t: number) => PAD_T + plotH * (1 - t / tMax);
  // RPE plots on a fixed 6–10 domain, clamped into the plot area.
  const RPE_MIN = 6;
  const RPE_MAX = 10;
  const rpeY = (rpe: number) =>
    PAD_T + plotH * (1 - (Math.min(RPE_MAX, Math.max(RPE_MIN, rpe)) - RPE_MIN) / (RPE_MAX - RPE_MIN));
  const heatLevel = (w: WeekMetrics) => Math.max(1, Math.ceil((4 * w.tonnage) / tMax));

  // Contiguous runs of weeks carrying an RPE — the line gaps over nulls.
  const rpeRuns = $derived.by(() => {
    const runs: string[] = [];
    let run: string[] = [];
    weeks.forEach((w, i) => {
      if (w.avgRpe != null && !w.plannedOnly) {
        const x = xOf(i).toFixed(1);
        const y = rpeY(w.avgRpe).toFixed(1);
        run.push(`${run.length === 0 ? "M" : "L"}${x} ${y}`);
      } else if (run.length) {
        runs.push(run.join(" "));
        run = [];
      }
    });
    if (run.length) runs.push(run.join(" "));
    return runs;
  });
  const rpePoints = $derived(
    weeks.flatMap((w, i) => (w.avgRpe != null && !w.plannedOnly ? [{ i, rpe: w.avgRpe }] : []))
  );

  const fmtTonnage = (t: number) => (t >= 1000 ? `${(t / 1000).toFixed(1)}t` : `${Math.round(t)}kg`);

  const aria = $derived.by(() => {
    const first = logged[0];
    const last = logged[logged.length - 1];
    const range = first && last ? ` from ${fmtTonnage(first.tonnage)} to ${fmtTonnage(last.tonnage)}` : "";
    return `Weekly volume bars with average RPE per block week${range}; the table below lists the exact numbers.`;
  });
</script>

<svg
  viewBox="0 0 {W} {H}"
  role="img"
  aria-label={aria}
  preserveAspectRatio="xMidYMid meet"
>
  <!-- tonnage gridlines + left ticks (0 and max only — the half line stays unlabeled) -->
  {#each [0, 0.5, 1] as f (f)}
    <line
      x1={PAD_L}
      x2={W - PAD_R}
      y1={yOf(tMax * f)}
      y2={yOf(tMax * f)}
      class="grid"
    />
    {#if f !== 0.5}
      <text x={PAD_L - 8} y={yOf(tMax * f) + 3.5} class="tick" text-anchor="end">
        {f === 0 ? "0" : fmtTonnage(tMax)}
      </text>
    {/if}
  {/each}

  <!-- avg RPE right ticks (6–10) -->
  {#each [6, 8, 10] as r (r)}
    <text x={W - PAD_R + 8} y={rpeY(r) + 3.5} class="tick rpe" text-anchor="start">{r === RPE_MAX ? `RPE ${r}` : r}</text>
  {/each}

  <!-- volume bars -->
  {#each weeks as w, i (w.week)}
    {@const x = xOf(i)}
    {#if w.plannedOnly || w.tonnage === 0}
      <rect
        x={x - barW / 2}
        y={PAD_T + plotH - 6}
        width={barW}
        height={6}
        rx="2"
        class="stub"
      >
        <title>Week {w.week} — no logs yet{w.directive ? ` (${w.directive})` : ""}</title>
      </rect>
    {:else}
      {@const y = yOf(w.tonnage)}
      <rect
        x={x - barW / 2}
        y={y}
        width={barW}
        height={PAD_T + plotH - y}
        rx="3"
        class="bar d{heatLevel(w)}"
      >
        <title>Week {w.week} — {fmtTonnage(w.tonnage)}{w.avgRpe != null ? ` · avg RPE ${w.avgRpe}` : ""}{w.directive ? ` · ${w.directive}` : ""}</title>
      </rect>
    {/if}
  {/each}

  <!-- avg RPE line + dots -->
  {#each rpeRuns as d (d)}
    <path d={d} class="rpe-line" />
  {/each}
  {#each rpePoints as p (weeks[p.i].week)}
    <circle cx={xOf(p.i)} cy={rpeY(p.rpe)} r="3" class="rpe-dot">
      <title>Week {weeks[p.i].week} — avg RPE {p.rpe}</title>
    </circle>
  {/each}

  <!-- week labels + current-week marker -->
  {#each weeks as w, i (w.week)}
    {@const x = xOf(i)}
    <text x={x} y={H - 7} class="lbl" class:now={w.week === pulseWeek} text-anchor="middle">
      {w.week}
    </text>
    {#if w.week === pulseWeek}
      <rect x={x - band / 2 + 3} y={PAD_T + plotH} width={band - 6} height="2" class="nowtick" />
    {/if}
  {/each}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; }
  .grid { stroke: var(--line-soft); stroke-width: 1; }
  .tick { fill: var(--faint); font: 500 11px var(--font-mono); }
  .lbl { fill: var(--muted); font: 500 11px var(--font-mono); }
  .lbl.now { fill: var(--blue); font-weight: 600; }
  .nowtick { fill: var(--blue); }
  .bar { stroke: none; }
  .bar.d1 { fill: var(--done-1); }
  .bar.d2 { fill: var(--done-2); }
  .bar.d3 { fill: var(--done-3); }
  .bar.d4 { fill: var(--done-4); }
  .stub { fill: none; stroke: var(--line); stroke-dasharray: 3 3; }
  .tick.rpe { fill: var(--blue); opacity: 0.8; }
  .rpe-line { fill: none; stroke: var(--blue); stroke-width: 1.5; }
  .rpe-dot { fill: var(--blue); stroke: var(--bg); stroke-width: 1.5; }
</style>
