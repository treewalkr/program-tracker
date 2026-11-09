<script lang="ts">
  /**
   * A lift's trend inline in a table row: a thin line over its daily points,
   * oldest → newest, with the latest point marked. Fewer than two points
   * renders nothing. Purely presentational — no axes; the chart has those.
   */
  interface Props {
    series: { date: string; value: number }[];
    unit: "kg" | "s";
    /** What the value is, for the label: "e1RM" or "Hold". */
    measure?: string;
    width?: number;
    height?: number;
  }

  let { series, unit, measure = unit === "s" ? "Hold" : "e1RM", width = 80, height = 20 }: Props = $props();

  const PAD = 3;
  const geom = $derived.by(() => {
    if (series.length < 2) return null;
    const vs = series.map((p) => p.value);
    const lo = Math.min(...vs);
    const hi = Math.max(...vs);
    const span = hi - lo || 1;
    const t0 = Date.parse(series[0].date);
    const tSpan = Date.parse(series[series.length - 1].date) - t0 || 1;
    const pts = series.map((p) => ({
      x: PAD + ((Date.parse(p.date) - t0) / tSpan) * (width - PAD * 2),
      // A flat series sits mid-height rather than on the floor.
      y: hi === lo ? height / 2 : PAD + (1 - (p.value - lo) / span) * (height - PAD * 2),
    }));
    return { line: pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" "), last: pts[pts.length - 1] };
  });

  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  const label = $derived(
    series.length >= 2 ? `${measure} ${fmt(series[0].value)} → ${fmt(series[series.length - 1].value)} ${unit}` : "",
  );
</script>

{#if geom}
  <svg class="spark" viewBox="0 0 {width} {height}" {width} {height} role="img" aria-label={label}>
    <title>{label}</title>
    <polyline points={geom.line} class="line" />
    <circle cx={geom.last.x} cy={geom.last.y} r="2.5" class="end" />
  </svg>
{/if}

<style>
  .spark { display: block; overflow: visible; }
  .line { fill: none; stroke: var(--muted); stroke-width: 1.5; stroke-linejoin: round; stroke-linecap: round; }
  .end { fill: var(--blue); stroke: var(--surface); stroke-width: 1.5; }
</style>
