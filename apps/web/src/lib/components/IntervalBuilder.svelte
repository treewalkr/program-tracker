<script lang="ts" module>
  import { cardioTotals, recoveryCount, type CardioInterval, type CardioIntervalType, type HrZone } from "@pt/shared";
  import { formatDuration } from "$lib/ui/input/duration";
  import { INTERVAL_TYPE_LABEL } from "$lib/cardioForm";

  /** One block of the timeline: a rep or a recovery, in order. */
  export interface TimelinePart {
    kind: "easy" | "work" | "recovery";
    /** Seconds, or null for a distance-only part (drawn at a nominal width). */
    sec: number | null;
    label: string;
  }

  const kindOf = (t: CardioIntervalType): TimelinePart["kind"] =>
    t === "work" ? "work" : t === "active_recovery" || t === "passive_recovery" ? "recovery" : "easy";

  const partLabel = (p: { durationSec?: number; distanceM?: number }) =>
    p.durationSec != null ? formatDuration(p.durationSec) : p.distanceM ? `${p.distanceM} m` : "—";

  /** The session in order, reps and recoveries spelled out: 5 reps → 4 recoveries unless one comes after the last. */
  export function timeline(intervals: readonly CardioInterval[]): TimelinePart[] {
    const out: TimelinePart[] = [];
    for (const iv of intervals) {
      const reps = iv.repeat ?? 1;
      const recs = recoveryCount(iv);
      for (let r = 1; r <= reps; r++) {
        out.push({ kind: kindOf(iv.type), sec: iv.durationSec ?? null, label: partLabel(iv) });
        if (iv.recovery && r <= recs) out.push({ kind: "recovery", sec: iv.recovery.durationSec ?? null, label: partLabel(iv.recovery) });
      }
    }
    return out;
  }

  /** "Total 33:00 · work 10:00 · recovery 8:00", or the distance when a part has no time. */
  export function totalsLine(intervals: readonly CardioInterval[]): string {
    const t = cardioTotals({ intervals: [...intervals] });
    const parts = [t.durationSec != null ? `Total ${formatDuration(t.durationSec)}` : "Total time unknown (a part is distance-only)"];
    if (t.workSec) parts.push(`work ${formatDuration(t.workSec)}`);
    if (t.recoverySec) parts.push(`recovery ${formatDuration(t.recoverySec)}`);
    if (t.distanceM) parts.push(t.distanceM >= 1000 ? `${Math.round(t.distanceM / 10) / 100} km` : `${t.distanceM} m`);
    return parts.join(" · ");
  }

  export { INTERVAL_TYPE_LABEL };
</script>

<script lang="ts">
  import { zoneBpm, type CardioMetric, type HrBpmRange } from "@pt/shared";
  import { paceField } from "$lib/cardioTarget";
  import { units } from "$lib/units.svelte";
  import SelectCell from "$lib/ui/SelectCell.svelte";
  import InputCell from "$lib/ui/InputCell.svelte";
  import InputDuration from "$lib/ui/InputDuration.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import type { SelectOption } from "$lib/ui/select/options";

  interface Props {
    intervals: CardioInterval[];
    /** The member's bpm zones; null = zones show on their own. */
    zones?: readonly HrZone[] | null;
    /** How the modality reads a pace target (run /km, row /500 m, bike km/h, none). */
    metric?: CardioMetric;
    /** Called after any change, with the new list. */
    onchange?: (intervals: CardioInterval[]) => void;
  }

  let { intervals = $bindable([]), zones = null, metric = "pace", onchange }: Props = $props();

  /** The pace input in the modality's metric and the member's distance unit; null = no pace for this modality. */
  const pace = $derived(paceField(metric, units.distance));

  const TYPE_OPTIONS: SelectOption<CardioIntervalType>[] = (Object.keys(INTERVAL_TYPE_LABEL) as CardioIntervalType[]).map((t) => ({
    value: t,
    label: INTERVAL_TYPE_LABEL[t],
  }));
  const zoneOptions = $derived<SelectOption[]>([
    { value: "", label: "No zone" },
    ...[1, 2, 3, 4, 5].map((z) => {
      const b = zoneBpm(zones, z);
      return { value: String(z), label: `Z${z}`, hint: b ? `${b.min}–${b.max} bpm` : undefined };
    }),
  ]);
  const RECOVERY_OPTIONS: SelectOption<"active_recovery" | "passive_recovery">[] = [
    { value: "active_recovery", label: "Active" },
    { value: "passive_recovery", label: "Passive" },
  ];

  const parts = $derived(timeline(intervals));
  const widthOf = (p: TimelinePart) => p.sec ?? 60;
  const line = $derived(totalsLine(intervals));
  const recoveryNote = $derived.by(() => {
    const w = intervals.find((iv) => iv.type === "work" && iv.recovery && (iv.repeat ?? 1) > 1);
    if (!w) return null;
    const recs = recoveryCount(w);
    return `${w.repeat} reps → ${recs} ${recs === 1 ? "recovery" : "recoveries"}${w.recoveryAfterLast ? ", one after the last rep" : ", none after the last rep"}`;
  });

  function commit(next: CardioInterval[]) {
    intervals = next;
    onchange?.(next);
  }
  function patch(i: number, change: Partial<CardioInterval>) {
    const next = intervals.map((iv, j) => (j === i ? { ...iv, ...change } : iv));
    // only a work interval has a recovery between reps
    if (next[i].type !== "work") delete next[i].recovery;
    for (const k of Object.keys(change) as (keyof CardioInterval)[]) if (change[k] === undefined) delete next[i][k];
    commit(next);
  }
  const numOrUndef = (raw: string, int = true) => {
    const t = raw.trim().replace(",", ".");
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? (int ? Math.round(n) : n) : undefined;
  };
  function newId() {
    const ids = new Set(intervals.map((iv) => iv.id));
    let n = intervals.length + 1;
    while (ids.has(`i${n}`)) n++;
    return `i${n}`;
  }
  function add() {
    const last = intervals.at(-1);
    const type: CardioIntervalType = !last ? "warmup" : last.type === "warmup" ? "work" : last.type === "work" ? "cooldown" : "work";
    commit([...intervals, { id: newId(), type, repeat: 1, durationSec: type === "work" ? 120 : 300 }]);
  }
  function move(i: number, by: -1 | 1) {
    const j = i + by;
    if (j < 0 || j >= intervals.length) return;
    const next = [...intervals];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  }
  const remove = (i: number) => commit(intervals.filter((_, j) => j !== i));
  const recoveryOf = (iv: CardioInterval) => iv.recovery ?? { type: "passive_recovery" as const };
  /** A recovery patch that drops cleared keys. */
  function patchRecovery(i: number, change: Partial<NonNullable<CardioInterval["recovery"]>>) {
    const next = { ...recoveryOf(intervals[i]), ...change };
    for (const k of Object.keys(change) as (keyof typeof next)[]) if (change[k] === undefined) delete next[k];
    patch(i, { recovery: next });
  }
  const bpmNum = (raw: string) => {
    const n = numOrUndef(raw);
    return n != null && n >= 30 && n <= 240 ? n : undefined;
  };
  /** One end of a bpm band typed; the other end follows until it's typed too. Both ends cleared = no band. */
  function bandWith(band: HrBpmRange | undefined, end: "min" | "max", raw: string): HrBpmRange | undefined {
    const n = bpmNum(raw);
    const other = end === "min" ? band?.max : band?.min;
    if (n == null) return raw.trim() ? band : undefined;
    const o = other ?? n;
    return end === "min" ? { min: n, max: Math.max(n, o) } : { min: Math.min(n, o), max: n };
  }

  /** The builder's own width: under 600px (a half-width editor, a phone) the targets drop to a second line. */
  let width = $state(0);
  const narrow = $derived(width > 0 && width < 600);
  const cols = $derived(narrow ? 6 : 8);
</script>

<div class="ib" bind:clientWidth={width}>
  <div class="scroll x-scroll">
    <table class="sheet" class:narrow>
      <thead>
        <tr>
          <th class="ord"><span class="sr-only">Order</span></th>
          <th>Type</th>
          <th class="r">Repeat</th>
          <th class="r">Time</th>
          <th class="r">{narrow ? "Dist. m" : "Distance m"}</th>
          {#if !narrow}
            <th>Target</th>
            <th class="r">RPE</th>
          {/if}
          <th><span class="sr-only">Remove</span></th>
        </tr>
      </thead>
      <tbody>
        {#each intervals as iv, i (iv.id)}
          {@const name = `interval ${i + 1}`}
          {@const bpm = iv.hrBpm ?? zoneBpm(zones, iv.hrZone)}
          {#snippet zoneCell()}
            <span class="zone"><SelectCell label="HR zone of {name}" options={zoneOptions} value={iv.hrZone != null ? String(iv.hrZone) : ""} onchange={(z) => patch(i, { hrZone: z ? Number(z) : undefined })} /></span>
            {#if bpm}<span class="bpm">{bpm.min}–{bpm.max} bpm</span>{/if}
          {/snippet}
          {#snippet targetsLine()}
            {#if pace}
              <span class="tg"><span class="lbl">Pace</span>{@render paceInput(`Pace of ${name}`, iv.paceSecPerKm, (v) => patch(i, { paceSecPerKm: v }))}</span>
            {/if}
            <span class="tg"><span class="lbl">HR</span>
            <span class="band">
              <InputCell label="Lowest bpm of {name}" figure width={4} placeholder="—" value={iv.hrBpm ? String(iv.hrBpm.min) : ""} oncommit={(v) => patch(i, { hrBpm: bandWith(iv.hrBpm, "min", v) })} />
              <span aria-hidden="true">–</span>
              <InputCell label="Highest bpm of {name}" figure width={4} placeholder="—" value={iv.hrBpm ? String(iv.hrBpm.max) : ""} oncommit={(v) => patch(i, { hrBpm: bandWith(iv.hrBpm, "max", v) })} />
              <span class="unit">bpm</span>
            </span></span>
            <span class="note"><InputCell label="Note for {name}" placeholder="Note" value={iv.notes ?? ""} oncommit={(v) => patch(i, { notes: v.trim() ? v.trim().slice(0, 280) : undefined })} /></span>
          {/snippet}
          {#snippet rpeCell()}
            <InputCell label="RPE of {name}" figure placeholder="—" value={iv.rpe != null ? String(iv.rpe) : ""} oncommit={(v) => { const n = numOrUndef(v, false); patch(i, { rpe: n != null ? Math.min(10, Math.max(1, n)) : undefined }); }} />
          {/snippet}
          <tr class="row-{kindOf(iv.type)} has-sub">
            <td class="ord">
              <button type="button" class="icon-btn" aria-label="Move {name} up" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="arrow-up" size={12} /></button>
              <button type="button" class="icon-btn" aria-label="Move {name} down" disabled={i === intervals.length - 1} onclick={() => move(i, 1)}><Icon name="arrow-down" size={12} /></button>
            </td>
            <td class="type"><SelectCell label="Type of {name}" options={TYPE_OPTIONS} value={iv.type} onchange={(t) => patch(i, { type: t })} /></td>
            <td class="r w-rep"><InputCell label="Repeats of {name}" figure value={String(iv.repeat ?? 1)} oncommit={(v) => patch(i, { repeat: Math.min(50, Math.max(1, numOrUndef(v) ?? 1)) })} /></td>
            <td class="r w-time"><InputDuration label="Time of {name}" cell step={15} value={iv.durationSec ?? null} onchange={(s) => patch(i, { durationSec: s && s > 0 ? s : undefined })} /></td>
            <td class="r w-dist"><InputCell label="Distance in metres of {name}" figure placeholder="—" value={iv.distanceM != null ? String(iv.distanceM) : ""} oncommit={(v) => patch(i, { distanceM: numOrUndef(v) })} /></td>
            {#if !narrow}
              <td class="target">{@render zoneCell()}</td>
              <td class="r w-rpe">{@render rpeCell()}</td>
            {/if}
            <td><button type="button" class="icon-btn" aria-label="Remove {name}" onclick={() => remove(i)}><Icon name="x" size={12} /></button></td>
          </tr>
          <!-- pace, bpm band and note sit on a line of their own; a narrow editor adds the zone and RPE to it, so no column is cut off -->
          <tr class="sub row-{kindOf(iv.type)}">
            <td></td>
            <td colspan={cols - 2}>
              <span class="sub-line">
                {#if narrow}
                  <span class="tg"><span class="lbl">Target</span>{@render zoneCell()}</span>
                  <span class="tg"><span class="lbl">RPE</span><span class="rpe">{@render rpeCell()}</span></span>
                {/if}
                {@render targetsLine()}
              </span>
            </td>
            <td></td>
          </tr>
          {#if iv.type === "work"}
            <tr class="rec">
              <td></td>
              {#if iv.recovery}
                <td class="rec-type"><span class="arrow" aria-hidden="true">↳</span><SelectCell label="Recovery type after {name}" options={RECOVERY_OPTIONS} value={recoveryOf(iv).type} onchange={(t) => patch(i, { recovery: { ...recoveryOf(iv), type: t } })} /></td>
                <td class="r muted mono">{narrow ? "" : "between · "}{recoveryCount(iv)}×</td>
                <td class="r w-time"><InputDuration label="Recovery time after {name}" cell step={15} value={iv.recovery.durationSec ?? null} onchange={(s) => patch(i, { recovery: { ...recoveryOf(iv), durationSec: s && s > 0 ? s : undefined } })} /></td>
                <td class="r w-dist"><InputCell label="Recovery distance after {name}" figure placeholder="—" value={iv.recovery.distanceM != null ? String(iv.recovery.distanceM) : ""} oncommit={(v) => patch(i, { recovery: { ...recoveryOf(iv), distanceM: numOrUndef(v) } })} /></td>
                {#if !narrow}
                  <td colspan="2"></td>
                {/if}
                <td><button type="button" class="icon-btn" aria-label="Remove the recovery after {name}" onclick={() => patch(i, { recovery: undefined, recoveryAfterLast: undefined })}><Icon name="x" size={12} /></button></td>
              {:else}
                <td colspan={cols - 1}><button type="button" class="link" onclick={() => patch(i, { recovery: { type: "active_recovery", durationSec: 120 } })}>+ Recovery between reps</button></td>
              {/if}
            </tr>
            {#if iv.recovery}
              {@const rec = iv.recovery}
              {@const recBpm = zoneBpm(zones, rec.hrZone)}
              <tr class="rec sub">
                <td></td>
                <td colspan={cols - 2}>
                  <span class="sub-line">
                    <span class="tg"><span class="lbl">Target</span>
                    <span class="zone"><SelectCell label="HR zone of the recovery after {name}" options={zoneOptions} value={rec.hrZone != null ? String(rec.hrZone) : ""} onchange={(z) => patchRecovery(i, { hrZone: z ? Number(z) : undefined })} /></span>
                    {#if recBpm}<span class="bpm">{recBpm.min}–{recBpm.max} bpm</span>{/if}</span>
                    {#if pace}
                      <span class="tg"><span class="lbl">Pace</span>{@render paceInput(`Pace of the recovery after ${name}`, rec.paceSecPerKm, (v) => patchRecovery(i, { paceSecPerKm: v }))}</span>
                    {/if}
                    <span class="after">{@render afterLast(iv, i)}</span>
                  </span>
                </td>
                <td></td>
              </tr>
            {/if}
          {/if}
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td></td>
          <td colspan={cols - 1}><Button small type="button" onclick={add}>+ Add interval</Button></td>
        </tr>
      </tfoot>
    </table>
  </div>

{#snippet paceInput(label: string, secPerKm: number | undefined, set: (v: number | undefined) => void)}
  {#if pace?.kind === "duration"}
    <span class="pace"><span class="pace-in"><InputDuration {label} cell step={5} min={pace.min} max={pace.max} placeholder="m:ss" value={secPerKm != null ? pace.show(secPerKm) : null} onchange={(v) => set(v != null && v > 0 ? pace.store(v) : undefined)} /></span><span class="unit">{pace.unit}</span></span>
  {:else if pace?.kind === "speed"}
    <span class="pace speed"><InputCell {label} figure width={5} placeholder="—" value={secPerKm != null ? String(pace.show(secPerKm)) : ""} oncommit={(v) => { const n = numOrUndef(v, false); set(n != null ? pace.store(n) : undefined); }} /><span class="unit">{pace.unit}</span></span>
  {/if}
{/snippet}

{#snippet afterLast(iv: CardioInterval, i: number)}
  <ToggleChip on={iv.recoveryAfterLast ?? false} onclick={() => patch(i, { recoveryAfterLast: iv.recoveryAfterLast ? undefined : true })}>Also after the last rep</ToggleChip>
{/snippet}

  <p class="total">{line}</p>
  {#if parts.length}
    <div class="tl" role="img" aria-label="Timeline: {line}">
      {#each parts as p, i (i)}
        <i class="k-{p.kind}" style:flex-grow={widthOf(p)} title={p.label}>{widthOf(p) >= 240 ? p.label : ""}</i>
      {/each}
    </div>
    <div class="key">
      <span class="k k-easy">Warm-up / cool-down</span>
      <span class="k k-work">Work</span>
      <span class="k k-recovery">Recovery</span>
      {#if recoveryNote}<span class="muted">{recoveryNote}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .ib { display: grid; gap: 8px; min-width: 0; }
  .scroll { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); }
  .sheet { width: 100%; min-width: 640px; border-collapse: collapse; font-size: 13px; }
  .sheet th { text-align: left; font: 500 12px var(--font-ui); color: var(--muted); padding: 6px 8px; border-bottom: 1px solid var(--line); background: var(--well); white-space: nowrap; }
  .sheet td { padding: 3px 8px; border-bottom: 1px solid var(--line-soft); white-space: nowrap; vertical-align: middle; }
  .sheet .r { text-align: right; }
  .ord { width: 1%; padding-right: 0 !important; }
  .type { min-width: 130px; }
  .w-rep { width: 6ch; }
  .w-time { width: 9ch; min-width: 8ch; }
  .w-dist { width: 9ch; }
  .w-rpe { width: 5ch; }
  .target { min-width: 150px; }
  .sheet.narrow .type { min-width: 0; width: 40%; }
  /* a phone-width editor: tighter gutters so the row fits without a sideways scroll */
  .sheet.narrow th, .sheet.narrow td { padding-left: 2px; padding-right: 2px; }
  .sheet.narrow tbody td:first-child { padding-left: 4px; }
  .sheet.narrow { min-width: 300px; }
  tr.has-sub td { border-bottom: 0; }
  tr.sub td { padding-top: 0; }
  .sub-line { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 6px; }
  .lbl { font: 500 12px var(--font-ui); color: var(--muted); }
  .sub-line .zone { min-width: 52px; }
  .band, .pace { display: inline-flex; align-items: center; gap: 2px; }
  .pace-in { display: inline-block; width: 8ch; }
  .unit { font: 400 12px var(--font-mono); color: var(--muted); margin-left: 2px; }
  .note { flex: 1 1 200px; min-width: 160px; }
  .after { margin-left: auto; }
  .tg { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; margin-right: 10px; }
  .rpe { display: inline-block; width: 6ch; }
  .zone { display: inline-block; min-width: 72px; }
  .bpm { margin-left: 6px; font: 400 12px var(--font-mono); color: var(--muted); }
  tr.row-work td.type { font-weight: 600; }
  tr.rec td { border-bottom-style: dashed; background: var(--well); }
  .rec-type { display: flex; align-items: center; gap: 4px; }
  .arrow { color: var(--muted); }
  .muted { color: var(--muted); }
  .mono { font: 400 12px var(--font-mono); }
  .total { margin: 0; font: 400 12px var(--font-mono); color: var(--ink); }
  tfoot td { border-bottom: 0; padding: 6px 8px; }
  .icon-btn { border: 0; background: transparent; color: var(--muted); padding: 3px; border-radius: 4px; cursor: pointer; display: inline-grid; place-items: center; }
  .icon-btn:hover:not(:disabled) { background: var(--well-2); color: var(--ink); }
  .icon-btn:disabled { opacity: 0.35; cursor: default; }
  .icon-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus-ring); }
  .link { border: 0; background: none; padding: 2px 0; color: var(--blue); font-size: 12px; cursor: pointer; }
  .link:hover { text-decoration: underline; }
  /* flat tints, one per part kind */
  .tl { display: flex; gap: 2px; height: 22px; border-radius: var(--radius); overflow: hidden; }
  .tl > i { display: grid; place-items: center; min-width: 3px; font: 500 11px var(--font-mono); font-style: normal; overflow: hidden; }
  .tl > .k-easy { background: var(--well-2); color: var(--muted); }
  .tl > .k-work { background: var(--blue); color: var(--on-ink); }
  .tl > .k-recovery { background: var(--good-bg); color: var(--good); }
  .key { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); }
  .k { display: inline-flex; align-items: center; gap: 6px; }
  .k::before { content: ""; width: 10px; height: 10px; border-radius: 2px; }
  .k.k-easy::before { background: var(--well-2); border: 1px solid var(--line); }
  .k.k-work::before { background: var(--blue); }
  .k.k-recovery::before { background: var(--good-bg); border: 1px solid var(--good-line); }
</style>
