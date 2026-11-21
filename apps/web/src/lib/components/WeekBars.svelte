<script lang="ts">
  /**
   * One value per week as bars, with an optional dashed target line: the
   * Cardio tab's session load by week. Same scale, ticks and heat steps as
   * PulseChart, without its RPE axis. Each bar is labelled with its value and
   * week, so the chart reads without a table.
   */
  interface Week {
    label: string;
    value: number;
  }
  interface Props {
    weeks: Week[];
    /** Unit after a value in titles ("AU"). */
    unit: string;
    /** Weekly target; absent = no line. */
    target?: number | null;
    /** Index of the current week (marked in blue); default the last. */
    current?: number;
    /** Accessible summary; the default lists every week. */
    label?: string;
  }

  let { weeks, unit, target = null, current, label }: Props = $props();

  const W = 640;
  const H = 200;
  const PAD_L = 42;
  const PAD_R = 16;
  const PAD_T = 22;
  const PAD_B = 24;
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;

  const now = $derived(current ?? weeks.length - 1);
  const rawMax = $derived(Math.max(...weeks.map((w) => w.value), target ?? 0, 1));
  // 1 / 2 / 2.5 / 5 × 10^k, like PulseChart
  const tMax = $derived.by(() => {
    const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const f = rawMax / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  });
  const band = $derived(plotW / Math.max(weeks.length, 1));
  const barW = $derived(Math.min(40, band * 0.56));
  const xOf = (i: number) => PAD_L + band * i + band / 2;
  const yOf = (v: number) => PAD_T + plotH * (1 - v / tMax);
  const heat = (v: number) => Math.max(1, Math.ceil((4 * v) / tMax));

  const aria = $derived(label ?? `${weeks.map((w) => `${w.label}: ${w.value} ${unit}`).join(", ")}${target ? `. Target ${target} ${unit}.` : ""}`);
</script>

<svg viewBox="0 0 {W} {H}" role="img" aria-label={aria} preserveAspectRatio="xMidYMid meet">
  {#each [0, 0.5, 1] as f (f)}
    <line x1={PAD_L} x2={W - PAD_R} y1={yOf(tMax * f)} y2={yOf(tMax * f)} class="grid" />
    {#if f !== 0.5}<text x={PAD_L - 8} y={yOf(tMax * f) + 3.5} class="tick" text-anchor="end">{f === 0 ? "0" : tMax}</text>{/if}
  {/each}

  {#each weeks as w, i (i)}
    {@const x = xOf(i)}
    {#if w.value <= 0}
      <rect x={x - barW / 2} y={PAD_T + plotH - 4} width={barW} height="4" rx="2" class="stub"><title>{w.label} — nothing logged</title></rect>
    {:else}
      {@const y = yOf(w.value)}
      <rect x={x - barW / 2} {y} width={barW} height={PAD_T + plotH - y} rx="3" class="bar d{heat(w.value)}"><title>{w.label} — {w.value} {unit}</title></rect>
      <text {x} y={y - 6} class="val" class:now={i === now} text-anchor="middle">{w.value}</text>
    {/if}
    <text {x} y={H - 7} class="lbl" class:now={i === now} text-anchor="middle">{w.label}</text>
    {#if i === now}<rect x={x - band / 2 + 3} y={PAD_T + plotH} width={band - 6} height="2" class="nowtick" />{/if}
  {/each}

  {#if target}
    <line x1={PAD_L} x2={W - PAD_R} y1={yOf(target)} y2={yOf(target)} class="target" />
    <text x={W - PAD_R} y={yOf(target) - 5} class="target-lbl" text-anchor="end">target {target}</text>
  {/if}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; }
  .grid { stroke: var(--line-soft); stroke-width: 1; }
  .tick { fill: var(--faint); font: 500 11px var(--font-mono); }
  .lbl { fill: var(--muted); font: 500 11px var(--font-mono); }
  .val { fill: var(--muted); font: 600 11px var(--font-mono); }
  .now { fill: var(--blue); font-weight: 600; }
  .nowtick { fill: var(--blue); }
  .bar.d1 { fill: var(--done-1); }
  .bar.d2 { fill: var(--done-2); }
  .bar.d3 { fill: var(--done-3); }
  .bar.d4 { fill: var(--done-4); }
  .stub { fill: none; stroke: var(--line); stroke-dasharray: 3 3; }
  .target { stroke: var(--ink); stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.55; }
  .target-lbl { fill: var(--muted); font: 500 11px var(--font-mono); }
</style>
