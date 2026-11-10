<script lang="ts">
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * One lift's trend over time: best e1RM per session day (kg), or the longest
   * hold (s) for a timed lift. Dates sit on a true time axis, so gaps between
   * sessions read as gaps. A crosshair snaps to the nearest day (pointer or
   * ← → keys) and shows its value; the same numbers are in a table for
   * screen readers.
   */
  interface Props {
    name: string;
    series: { date: string; value: number }[];
    unit: "kg" | "s";
    onclose: () => void;
  }

  let { name, series, unit, onclose }: Props = $props();

  /** Drawn at the container's pixel width so ticks stay 11px at any size. */
  let plotBox = $state(0);
  const W = $derived(Math.max(280, plotBox || 640));
  const H = 210;
  const PAD_L = 44;
  const PAD_R = 16;
  const PAD_T = 24;
  const PAD_B = 26;
  const plotW = $derived(W - PAD_L - PAD_R);
  const plotH = H - PAD_T - PAD_B;
  const DAY = 86_400_000;

  const measure = $derived(unit === "s" ? "Longest hold" : "Best e1RM");
  const t = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

  /** Round step 1 / 2 / 2.5 / 5 × 10^k so ticks land on readable numbers. */
  function niceStep(span: number, count: number): number {
    const raw = span / count;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pow;
  }

  const yDomain = $derived.by(() => {
    const vs = series.map((p) => p.value);
    let lo = Math.min(...vs);
    let hi = Math.max(...vs);
    if (hi - lo < 1) {
      lo -= 2.5;
      hi += 2.5;
    }
    const step = niceStep(hi - lo, 3);
    lo = Math.max(0, Math.floor(lo / step) * step);
    hi = Math.ceil(hi / step) * step;
    const ticks: number[] = [];
    for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 10) / 10);
    return { lo, hi, ticks };
  });

  const xDomain = $derived.by(() => {
    const t0 = t(series[0].date);
    const t1 = t(series[series.length - 1].date);
    // A single day gets a week either side so its point isn't on the edge.
    return t1 > t0 ? { t0, t1 } : { t0: t0 - 7 * DAY, t1: t1 + 7 * DAY };
  });

  const xOf = (iso: string) => PAD_L + ((t(iso) - xDomain.t0) / (xDomain.t1 - xDomain.t0)) * plotW;
  const yOf = (v: number) => PAD_T + (1 - (v - yDomain.lo) / (yDomain.hi - yDomain.lo)) * plotH;

  const longSpan = $derived(xDomain.t1 - xDomain.t0 > 300 * DAY);
  const dateTick = (ms: number) =>
    new Date(ms).toLocaleDateString("en-GB", longSpan ? { month: "short", year: "2-digit", timeZone: "UTC" } : { day: "numeric", month: "short", timeZone: "UTC" });
  const dateLong = (iso: string) =>
    new Date(t(iso)).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  /** Up to 5 evenly spaced date ticks across the time axis, fewer when narrow. */
  const xTicks = $derived.by(() => {
    // ~90px per label so dates never collide on a phone.
    const n = Math.min(5, Math.max(2, series.length), Math.max(2, Math.floor(plotW / 90)));
    return Array.from({ length: n }, (_, i) => xDomain.t0 + ((xDomain.t1 - xDomain.t0) * i) / (n - 1));
  });

  const pts = $derived(series.map((p) => ({ ...p, x: xOf(p.date), y: yOf(p.value) })));
  const path = $derived(pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "));

  /** The day under the crosshair; null = none (shows the latest in the readout). */
  let active = $state<number | null>(null);
  const shown = $derived(pts[active ?? pts.length - 1]);

  let svgEl = $state<SVGSVGElement | null>(null);
  function nearest(clientX: number) {
    if (!svgEl) return;
    const r = svgEl.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * W;
    let best = 0;
    for (let i = 1; i < pts.length; i++) if (Math.abs(pts[i].x - x) < Math.abs(pts[best].x - x)) best = i;
    active = best;
  }
  function onkey(e: KeyboardEvent) {
    const i = active ?? pts.length - 1;
    if (e.key === "ArrowLeft") active = Math.max(0, i - 1);
    else if (e.key === "ArrowRight") active = Math.min(pts.length - 1, i + 1);
    else if (e.key === "Home") active = 0;
    else if (e.key === "End") active = pts.length - 1;
    else if (e.key === "Escape") onclose();
    else return;
    e.preventDefault();
  }

  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  const change = $derived.by(() => {
    if (series.length < 2) return "";
    const d = series[series.length - 1].value - series[0].value;
    return `${d >= 0 ? "+" : "−"}${fmt(Math.abs(d))} ${unit} since ${dateTick(t(series[0].date))}`;
  });
</script>

<section class="lift-chart" aria-label="{name} — {measure} over time">
  <header>
    <div class="head-text">
      <h3>{name}</h3>
      <span class="sub">{measure} per session day, {unit === "s" ? "seconds" : "kg"}{change ? ` · ${change}` : ""}</span>
    </div>
    <div class="readout">
      <span class="val tnum">{fmt(shown.value)}<span class="u">{unit}</span></span>
      <span class="when">{dateLong(shown.date)}</span>
    </div>
    <button type="button" class="close" aria-label="Close {name} chart" onclick={onclose}><Icon name="x" size={14} /></button>
  </header>

  <div class="plot" bind:clientWidth={plotBox}>
  <!-- A slider over the session days: ← → step the crosshair, the value text reads the day. -->
  <svg
    bind:this={svgEl}
    viewBox="0 0 {W} {H}"
    role="slider"
    tabindex="0"
    aria-label="{name}: {measure} from {fmt(series[0].value)} to {fmt(series[series.length - 1].value)} {unit} over {series.length} session days"
    aria-valuemin={1}
    aria-valuemax={pts.length}
    aria-valuenow={(active ?? pts.length - 1) + 1}
    aria-valuetext="{dateLong(shown.date)}: {fmt(shown.value)} {unit}"
    onpointermove={(e) => nearest(e.clientX)}
    onpointerdown={(e) => nearest(e.clientX)}
    onpointerleave={() => (active = null)}
    onkeydown={onkey}
    onblur={() => (active = null)}
  >
    {#each yDomain.ticks as v (v)}
      <line x1={PAD_L} x2={W - PAD_R} y1={yOf(v)} y2={yOf(v)} class="grid" />
      <text x={PAD_L - 8} y={yOf(v) + 3.5} class="tick" text-anchor="end">{v}</text>
    {/each}
    <text x={PAD_L - 8} y={10} class="tick unit" text-anchor="end">{unit}</text>
    {#each xTicks as ms, i (i)}
      <text
        x={PAD_L + ((ms - xDomain.t0) / (xDomain.t1 - xDomain.t0)) * plotW}
        y={H - 8}
        class="tick"
        text-anchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
      >{dateTick(ms)}</text>
    {/each}

    {#if active !== null}
      <line x1={shown.x} x2={shown.x} y1={PAD_T} y2={PAD_T + plotH} class="cross" />
    {/if}
    <path d={path} class="line" />
    {#each pts as p, i (p.date)}
      <circle cx={p.x} cy={p.y} r={i === (active ?? -1) ? 5 : 4} class="dot" class:on={i === active} />
    {/each}
  </svg>
  </div>

  <table class="sr-only">
    <caption>{name} — {measure} ({unit}) per session day</caption>
    <thead><tr><th>Date</th><th>{measure} ({unit})</th></tr></thead>
    <tbody>
      {#each series as p (p.date)}<tr><td>{dateLong(p.date)}</td><td>{fmt(p.value)}</td></tr>{/each}
    </tbody>
  </table>
</section>

<style>
  .lift-chart { padding: 12px 16px 14px; border-top: 1px solid var(--line); }
  header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 6px; }
  .head-text { flex: 1; min-width: 0; }
  h3 { margin: 0; font: 600 14px/1.3 var(--font-ui); color: var(--ink); }
  .sub { font: 400 12px/1.4 var(--font-ui); color: var(--muted); }
  .readout { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; white-space: nowrap; }
  .val { font: 600 16px/1 var(--font-mono); color: var(--ink); }
  .u { font: 400 11px var(--font-ui); color: var(--faint); margin-left: 3px; }
  .when { font: 400 11.5px/1 var(--font-ui); color: var(--muted); }
  .close {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .close:hover { color: var(--ink); border-color: var(--line-strong); }
  .close:focus-visible, svg:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  svg { display: block; width: 100%; height: 210px; touch-action: pan-y; border-radius: 4px; }
  .grid { stroke: var(--line-soft); stroke-width: 1; }
  .tick { fill: var(--faint); font: 500 11px var(--font-mono); }
  .tick.unit { fill: var(--muted); }
  .cross { stroke: var(--line-strong); stroke-width: 1; }
  .line { fill: none; stroke: var(--blue); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
  .dot { fill: var(--blue); stroke: var(--surface); stroke-width: 2; }
</style>
