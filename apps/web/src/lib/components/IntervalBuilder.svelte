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
  import { zoneBpm } from "@pt/shared";
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
    /** Called after any change, with the new list. */
    onchange?: (intervals: CardioInterval[]) => void;
  }

  let { intervals = $bindable([]), zones = null, onchange }: Props = $props();

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
</script>

<div class="ib">
  <div class="scroll">
    <table class="sheet">
      <thead>
        <tr>
          <th class="ord"><span class="sr-only">Order</span></th>
          <th>Type</th>
          <th class="r">Repeat</th>
          <th class="r">Time</th>
          <th class="r">Distance m</th>
          <th>Target</th>
          <th class="r">RPE</th>
          <th><span class="sr-only">Remove</span></th>
        </tr>
      </thead>
      <tbody>
        {#each intervals as iv, i (iv.id)}
          {@const name = `interval ${i + 1}`}
          {@const bpm = iv.hrBpm ?? zoneBpm(zones, iv.hrZone)}
          <tr class="row-{kindOf(iv.type)}">
            <td class="ord">
              <button type="button" class="icon-btn" aria-label="Move {name} up" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="arrow-up" size={12} /></button>
              <button type="button" class="icon-btn" aria-label="Move {name} down" disabled={i === intervals.length - 1} onclick={() => move(i, 1)}><Icon name="arrow-down" size={12} /></button>
            </td>
            <td class="type"><SelectCell label="Type of {name}" options={TYPE_OPTIONS} value={iv.type} onchange={(t) => patch(i, { type: t })} /></td>
            <td class="r w-rep"><InputCell label="Repeats of {name}" figure value={String(iv.repeat ?? 1)} oncommit={(v) => patch(i, { repeat: Math.min(50, Math.max(1, numOrUndef(v) ?? 1)) })} /></td>
            <td class="r w-time"><InputDuration label="Time of {name}" cell step={15} value={iv.durationSec ?? null} onchange={(s) => patch(i, { durationSec: s && s > 0 ? s : undefined })} /></td>
            <td class="r w-dist"><InputCell label="Distance in metres of {name}" figure placeholder="—" value={iv.distanceM != null ? String(iv.distanceM) : ""} oncommit={(v) => patch(i, { distanceM: numOrUndef(v) })} /></td>
            <td class="target">
              <span class="zone"><SelectCell label="HR zone of {name}" options={zoneOptions} value={iv.hrZone != null ? String(iv.hrZone) : ""} onchange={(z) => patch(i, { hrZone: z ? Number(z) : undefined })} /></span>
              {#if bpm}<span class="bpm">{bpm.min}–{bpm.max} bpm</span>{/if}
            </td>
            <td class="r w-rpe"><InputCell label="RPE of {name}" figure placeholder="—" value={iv.rpe != null ? String(iv.rpe) : ""} oncommit={(v) => { const n = numOrUndef(v, false); patch(i, { rpe: n != null ? Math.min(10, Math.max(1, n)) : undefined }); }} /></td>
            <td><button type="button" class="icon-btn" aria-label="Remove {name}" onclick={() => remove(i)}><Icon name="x" size={12} /></button></td>
          </tr>
          {#if iv.type === "work"}
            <tr class="rec">
              <td></td>
              {#if iv.recovery}
                <td class="rec-type"><span class="arrow" aria-hidden="true">↳</span><SelectCell label="Recovery type after {name}" options={RECOVERY_OPTIONS} value={recoveryOf(iv).type} onchange={(t) => patch(i, { recovery: { ...recoveryOf(iv), type: t } })} /></td>
                <td class="r muted mono">between · {recoveryCount(iv)}×</td>
                <td class="r w-time"><InputDuration label="Recovery time after {name}" cell step={15} value={iv.recovery.durationSec ?? null} onchange={(s) => patch(i, { recovery: { ...recoveryOf(iv), durationSec: s && s > 0 ? s : undefined } })} /></td>
                <td class="r w-dist"><InputCell label="Recovery distance after {name}" figure placeholder="—" value={iv.recovery.distanceM != null ? String(iv.recovery.distanceM) : ""} oncommit={(v) => patch(i, { recovery: { ...recoveryOf(iv), distanceM: numOrUndef(v) } })} /></td>
                <td colspan="2">
                  <ToggleChip on={iv.recoveryAfterLast ?? false} onclick={() => patch(i, { recoveryAfterLast: iv.recoveryAfterLast ? undefined : true })}>Also after the last rep</ToggleChip>
                </td>
                <td><button type="button" class="icon-btn" aria-label="Remove the recovery after {name}" onclick={() => patch(i, { recovery: undefined, recoveryAfterLast: undefined })}><Icon name="x" size={12} /></button></td>
              {:else}
                <td colspan="7"><button type="button" class="link" onclick={() => patch(i, { recovery: { type: "active_recovery", durationSec: 120 } })}>+ Recovery between reps</button></td>
              {/if}
            </tr>
          {/if}
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td></td>
          <td colspan="7"><Button small type="button" onclick={add}>+ Add interval</Button></td>
        </tr>
      </tfoot>
    </table>
  </div>

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
