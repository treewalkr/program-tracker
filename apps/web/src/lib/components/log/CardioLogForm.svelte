<script lang="ts" module>
  export type { CardioForm } from "$lib/cardioForm";

  /** Words the form shows — English by default; the client portal passes its own locale (any subset). */
  export interface CardioFormText {
    modality: string;
    modalityPlaceholder: string;
    duration: string;
    durationHint: string;
    rpe: string;
    rpeHint: string;
    distance: string;
    avgHr: string;
    maxHr: string;
    pain: string;
    painNote: string;
    more: string;
    calories: string;
    intervals: string;
    intervalsHint: string;
    rep: string;
    time: string;
    pace: string;
    load: string;
    skip: string;
    skipped: string;
    skipReason: string;
    undoSkip: string;
    reasons: Record<SkipReason, string>;
  }
</script>

<script lang="ts">
  import type { CardioMetric, SkipReason } from "@pt/shared";
  import { cardioFormCalc, SKIP_REASON_LABEL, type CardioForm, type CardioFormError, type IntervalResultRow } from "$lib/cardioForm";
  import { formatDuration } from "$lib/ui/input/duration";
  import InputDuration from "$lib/ui/InputDuration.svelte";
  import InputUnit from "$lib/ui/InputUnit.svelte";
  import InputField from "$lib/ui/InputField.svelte";
  import InputCell from "$lib/ui/InputCell.svelte";
  import SelectCombobox from "$lib/ui/SelectCombobox.svelte";
  import SelectStepper from "$lib/ui/SelectStepper.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import type { SelectOption } from "$lib/ui/select/options";

  const ENGLISH: CardioFormText = {
    modality: "Modality",
    modalityPlaceholder: "Running, Cycling, Rowing…",
    duration: "Duration",
    durationHint: "mm:ss, or h:mm:ss",
    rpe: "Session RPE",
    rpeHint: "How hard the whole session felt, 1–10",
    distance: "Distance",
    avgHr: "Average HR",
    maxHr: "Max HR",
    pain: "Pain or discomfort",
    painNote: "Where, and how bad?",
    more: "Calories and per-interval results",
    calories: "Calories",
    intervals: "Per interval",
    intervalsHint: "Optional. Leave blank what wasn't measured.",
    rep: "Rep",
    time: "Time",
    pace: "Pace",
    load: "Session load",
    skip: "Didn't do it",
    skipped: "Not done",
    skipReason: "Why?",
    undoSkip: "Did it after all",
    reasons: SKIP_REASON_LABEL,
  };

  const RPE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const rpeScale = (v: number) => (v <= 4 ? "low" : v <= 7 ? "mid" : "high") as "low" | "mid" | "high";

  interface Props {
    value: CardioForm;
    text?: Partial<CardioFormText>;
    /** `touch`: one column, 44px fields (the client portal). */
    variant?: "sheet" | "touch";
    /** The trainer's modalities (names) for the picker; absent = a free text field. */
    modalities?: { name: string; metric: CardioMetric }[];
    /** How pace shows for this modality. */
    metric?: CardioMetric;
    /** The field the last save attempt was missing. */
    problem?: CardioFormError | null;
  }

  let { value = $bindable(), text: given = {}, variant = "sheet", modalities, metric = "none", problem = null }: Props = $props();

  const text = $derived({ ...ENGLISH, ...given, reasons: { ...ENGLISH.reasons, ...given.reasons } });
  const calc = $derived(cardioFormCalc(value, metric));
  const load = $derived(calc.load != null && value.rpe != null && value.durationSec != null ? { au: calc.load, rpe: value.rpe, min: Math.round((value.durationSec / 60) * 10) / 10 } : null);

  const modalityOptions = $derived.by((): SelectOption[] => {
    const list = (modalities ?? []).map((m) => ({ value: m.name, label: m.name }));
    const v = value.modality.trim();
    return v && !list.some((o) => o.value.toLowerCase() === v.toLowerCase()) ? [...list, { value: v, label: v, tag: "This session" }] : list;
  });

  let skipping = $state(false);

  const cellNum = (v: number | null) => (v == null ? "" : String(v));
  function setCell(row: IntervalResultRow, key: "distanceKm" | "avgHr" | "rpe", raw: string) {
    const t = raw.trim().replace(",", ".");
    const n = t === "" ? null : Number(t);
    row[key] = n != null && Number.isFinite(n) ? n : null;
  }
</script>

<div class="cardio-form" class:touch={variant === "touch"}>
  {#if value.skipped}
    <div class="skipped" role="status">
      <Pill>{text.skipped}</Pill>
      <span>{text.reasons[value.skipped]}</span>
      <Button small variant="ghost" type="button" onclick={() => (value.skipped = null)}>{text.undoSkip}</Button>
    </div>
  {:else}
    <div class="grid">
      <div class="wide">
        {#if modalities}
          <div class="lbl-field">
            <span class="lbl" id="c-modality-l">{text.modality}</span>
            <SelectCombobox
              label={text.modality}
              options={modalityOptions}
              placeholder={text.modalityPlaceholder}
              value={value.modality || undefined}
              onchange={(v) => (value.modality = v)}
              oncreate={(q) => (value.modality = q)}
              createLabel={(q) => `Use “${q}”`}
            />
            {#if problem === "modality"}<p class="err">Pick what they did.</p>{/if}
          </div>
        {:else}
          <InputField label={text.modality} placeholder={text.modalityPlaceholder} bind:value={value.modality} maxlength={80} error={problem === "modality" ? "Say what you did." : null} />
        {/if}
      </div>
      <InputDuration label={text.duration} bind:value={value.durationSec} min={1} max={18000} hint={text.durationHint} error={problem === "duration" ? text.durationHint : null} />
      <div class="lbl-field">
        <span class="lbl">{text.rpe}</span>
        <SelectStepper label={text.rpe} values={RPE} columns={5} start={5} scale={rpeScale} bind:value={value.rpe} />
        {#if problem === "rpe"}<p class="err">{text.rpeHint}</p>{:else}<p class="hint">{text.rpeHint}</p>{/if}
      </div>
      <InputUnit label={text.distance} unit="km" bind:value={value.distanceKm} step={0.1} min={0} max={300} optional />
      <InputUnit label={text.avgHr} unit="bpm" bind:value={value.avgHr} min={30} max={240} optional />
      <InputUnit label={text.maxHr} unit="bpm" bind:value={value.maxHr} min={30} max={240} optional error={problem === "maxHr" ? "Can't be below the average" : null} />
    </div>

    <div class="pain">
      <ToggleChip on={value.pain} onclick={() => (value.pain = !value.pain)}>{text.pain}</ToggleChip>
      {#if value.pain}
        <div class="pain-note"><InputField label={text.painNote} bind:value={value.painNote} maxlength={280} /></div>
      {/if}
    </div>

    {#if calc.pace || load}
      <p class="calc" aria-live="polite">
        {#if calc.pace}<span>{text.pace} <b>{calc.pace}</b></span>{/if}
        {#if load}<span>{text.load} <b>{load.au} AU</b> <span class="muted">= {load.rpe} × {load.min} min</span></span>{/if}
      </p>
    {/if}

    <details class="more">
      <summary>{text.more}</summary>
      <div class="more-body">
        <InputUnit label={text.calories} unit="kcal" bind:value={value.calories} min={0} max={10000} optional width="auto" />
        {#if value.intervals.length}
          <div class="ivs">
            <span class="lbl">{text.intervals}</span>
            <p class="hint">{text.intervalsHint}</p>
            <div class="scroll">
              <table class="sheet">
                <thead>
                  <tr><th>{text.rep}</th><th class="r">{text.time}</th><th class="r">km</th><th class="r">{text.avgHr}</th><th class="r">RPE</th></tr>
                </thead>
                <tbody>
                  {#each value.intervals as row (row.key)}
                    <tr class:work={row.type === "work"}>
                      <td>{row.label}</td>
                      <td class="r num"><InputDuration label="{text.time} · {row.label}" bind:value={row.durationSec} cell step={5} /></td>
                      <td class="r num"><InputCell label="km · {row.label}" figure value={cellNum(row.distanceKm)} oncommit={(v) => setCell(row, "distanceKm", v)} /></td>
                      <td class="r num"><InputCell label="{text.avgHr} · {row.label}" figure value={cellNum(row.avgHr)} oncommit={(v) => setCell(row, "avgHr", v)} /></td>
                      <td class="r num"><InputCell label="RPE · {row.label}" figure value={cellNum(row.rpe)} oncommit={(v) => setCell(row, "rpe", v)} /></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        {/if}
      </div>
    </details>

    <div class="skip">
      {#if skipping}
        <span class="lbl">{text.skipReason}</span>
        <div class="reasons" role="group" aria-label={text.skipReason}>
          {#each Object.keys(text.reasons) as r (r)}
            <ToggleChip onclick={() => ((value.skipped = r as SkipReason), (skipping = false))}>{text.reasons[r as SkipReason]}</ToggleChip>
          {/each}
        </div>
      {:else}
        <Button small variant="ghost" type="button" onclick={() => (skipping = true)}>{text.skip}</Button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .cardio-form { display: grid; gap: 14px; padding: 16px; }
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; align-items: start; }
  .wide { grid-column: span 1; }
  .lbl-field { display: grid; gap: 4px; min-width: 0; }
  .lbl { font: 500 12px var(--font-ui); color: var(--ink); }
  .hint { margin: 0; font: 400 12px/1.4 var(--font-ui); color: var(--muted); }
  .err { margin: 0; font: 500 13px/1.5 var(--font-ui); color: var(--bad); }
  .pain { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; }
  .pain-note { flex: 1; min-width: 220px; }
  .calc { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; font-size: 13px; color: var(--muted); }
  .calc b { font: 600 13px var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); }
  .muted { color: var(--muted); }
  .more { border-top: 1px solid var(--line-soft); padding-top: 10px; }
  .more summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .more summary:hover { color: var(--ink); }
  .more-body { display: grid; gap: 14px; padding-top: 12px; }
  .ivs { display: grid; gap: 4px; }
  .scroll { overflow-x: auto; }
  .sheet { width: 100%; border-collapse: collapse; font-size: 13px; }
  .sheet th { text-align: left; font: 500 12px var(--font-ui); color: var(--muted); padding: 4px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .sheet td { padding: 3px 10px; border-bottom: 1px solid var(--line-soft); white-space: nowrap; }
  .sheet .r { text-align: right; }
  .sheet td.num { width: 9ch; }
  .sheet tr.work td:first-child { font-weight: 600; }
  .skip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .reasons { display: flex; flex-wrap: wrap; gap: 6px; }
  .skipped { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; }
  @media (max-width: 860px) {
    .grid { grid-template-columns: 1fr 1fr; }
    .wide { grid-column: 1 / -1; }
  }
  .touch { padding: 0; }
  .touch .grid { grid-template-columns: 1fr 1fr; }
  .touch .wide { grid-column: 1 / -1; }
</style>
