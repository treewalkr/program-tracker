<script lang="ts" module>
  import type { CardioFormError, PaceWords } from "$lib/cardioForm";
  import type { RangeWords } from "$lib/ui/input/duration";
  export type { CardioForm } from "$lib/cardioForm";

  /** Words the form shows — English by default; the client portal passes its own locale (any subset). */
  export interface CardioFormText {
    modality: string;
    modalityPlaceholder: string;
    duration: string;
    durationHint: string;
    /** Under 30 % of the planned time: `{planned}` is the plan as mm:ss. A warning, never a block. */
    underPlan: string;
    rpe: string;
    rpeHint: string;
    /** What each pair of RPE figures feels like (CR-10): 1–2, 3–4, 5–6, 7–8, 9–10. */
    rpeFeel: [string, string, string, string, string];
    distance: string;
    avgHr: string;
    maxHr: string;
    pain: string;
    painNote: string;
    /** Under the pain field (and on the portal's confirmation): when to stop. Blank on the coach's form. */
    painSafety: string;
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
    /** Shown under the field the last save was missing. */
    modalityError: string;
    maxHrError: string;
    /** "min" in the load line. */
    minutes: string;
    /** Interval names for the per-interval rows. */
    types: Record<CardioIntervalType, string>;
    /** A repeated interval's row: `{name}`, `{rep}`, `{reps}`. */
    repOf: string;
    /** The word after an optional field's label. */
    optional: string;
    /** Distance unit names as shown. */
    distanceUnits: Record<DistanceUnit, string>;
    /** A range error names its field and limits (shown under that field). */
    errors: Record<CardioFormError, string>;
    /** A time that isn't one ("Type a time like 35:10"). */
    junkTime: string;
    /** A field's own range message. */
    rangeWords: RangeWords;
    /** The pace, split and speed unit words. */
    paceWords: PaceWords;
    /** "kcal". */
    kcal: string;
    /** After the load figure: "AU" for the coach; blank for the member, who never sees the unit. */
    loadUnit: string;
    /** The RPE stepper's buttons; `{label}` is the field. */
    stepWords: { up: string; down: string };
  }
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import type { CardioIntervalType, CardioMetric, DistanceUnit, SkipReason } from "@pt/shared";
  import { distanceUnit, showDistance, storeDistance } from "$lib/units.svelte";
  import { CARDIO_FORM_ERROR, cardioFormCalc, PACE_WORDS_EN, INTERVAL_TYPE_LABEL, SKIP_REASON_LABEL, type CardioForm, type IntervalResultRow } from "$lib/cardioForm";
  import { farUnderPlan, formatDuration, RANGE_WORDS_EN } from "$lib/ui/input/duration";
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
  import { MediaQuery } from "svelte/reactivity";

  const ENGLISH: CardioFormText = {
    modality: "Modality",
    modalityPlaceholder: "Running, Cycling, Rowing…",
    duration: "Duration",
    durationHint: "mm:ss, or h:mm:ss",
    underPlan: "Much shorter than the planned {planned}. Check the time.",
    rpe: "Session RPE",
    rpeHint: "1–2 very easy · 3–4 can chat · 5–6 short sentences · 7–8 hard, a few words · 9–10 all-out. Rate the whole session about 30 min after.",
    rpeFeel: ["very easy", "can chat", "short sentences", "hard, a few words", "all-out"],
    distance: "Distance",
    avgHr: "Average HR",
    maxHr: "Max HR",
    pain: "Pain or discomfort",
    painNote: "Where, and how bad?",
    painSafety: "",
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
    modalityError: "Say what you did.",
    maxHrError: "Can't be below the average",
    minutes: "min",
    types: INTERVAL_TYPE_LABEL,
    repOf: "{name} {rep} of {reps}",
    optional: "optional",
    distanceUnits: { km: "km", mi: "mi" },
    errors: CARDIO_FORM_ERROR,
    junkTime: "Type a time like 35:10",
    rangeWords: RANGE_WORDS_EN,
    paceWords: PACE_WORDS_EN,
    kcal: "kcal",
    loadUnit: "AU",
    stepWords: { up: "Increase {label}", down: "Decrease {label}" },
  };

  const RPE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  // the --rpe-high red is for 9–10 (maximal): a prescribed hard 8 isn't an alarm
  const rpeScale = (v: number) => (v <= 4 ? "low" : v <= 8 ? "mid" : "high") as "low" | "mid" | "high";

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
    /** The planned session time in seconds, for the "much shorter than planned" warning. */
    plannedSec?: number | null;
    /** The modality as shown and typed (the portal shows preset names in Thai); stored names pass through. */
    showModality?: (stored: string) => string;
    storeModality?: (typed: string) => string;
    /** The page's note field, placed above "I didn't do this one" so it isn't missed. */
    notes?: Snippet;
  }

  let { value = $bindable(), text: given = {}, variant = "sheet", modalities, metric = "none", problem = null, plannedSec = null, showModality = (m) => m, storeModality = (m) => m, notes }: Props = $props();

  const text = $derived({ ...ENGLISH, ...given, reasons: { ...ENGLISH.reasons, ...given.reasons }, types: { ...ENGLISH.types, ...given.types }, distanceUnits: { ...ENGLISH.distanceUnits, ...given.distanceUnits }, errors: { ...ENGLISH.errors, ...given.errors }, rangeWords: { ...ENGLISH.rangeWords, ...given.rangeWords }, paceWords: { ...ENGLISH.paceWords, ...given.paceWords } });
  const errorOf = (e: CardioFormError) => (problem === e ? text.errors[e] : null);
  /** A problem inside the folded section opens it, so the named field is on screen. */
  let moreOpen = $state(false);
  $effect(() => {
    if (problem === "intervalRange" || problem === "caloriesRange") moreOpen = true;
  });
  const distLabel = $derived(text.distanceUnits[distanceUnit()]);
  /** "Work 3 of 5" in the form's language. */
  function rowLabel(row: IntervalResultRow): string {
    const reps = value.intervals.filter((r) => r.intervalId === row.intervalId).length;
    const name = text.types[row.type];
    return reps > 1 ? text.repOf.replace("{name}", name).replace("{rep}", String(row.rep)).replace("{reps}", String(reps)) : name;
  }
  const calc = $derived(cardioFormCalc(value, metric, text.paceWords));
  /** A logged time far under the plan is usually minutes read as seconds: say so, don't block. */
  const durationHint = $derived(farUnderPlan(value.durationSec, plannedSec) ? text.underPlan.replace("{planned}", formatDuration(plannedSec)) : text.durationHint);
  const load = $derived(calc.load != null && value.rpe != null && value.durationSec != null ? { au: calc.load, rpe: value.rpe, min: Math.round((value.durationSec / 60) * 10) / 10 } : null);

  const modalityOptions = $derived.by((): SelectOption[] => {
    const list = (modalities ?? []).map((m) => ({ value: m.name, label: m.name }));
    const v = value.modality.trim();
    return v && !list.some((o) => o.value.toLowerCase() === v.toLowerCase()) ? [...list, { value: v, label: v, tag: "This session" }] : list;
  });

  let skipping = $state(false);
  /** A phone or a touch screen: one card per rep instead of a 440px table that scrolls sideways. */
  const coarse = new MediaQuery("(max-width: 720px), (pointer: coarse)", false);
  const repCards = $derived(variant === "touch" || coarse.current);

  const cellNum = (v: number | null) => (v == null ? "" : String(v));
  function setCell(row: IntervalResultRow, key: "distanceKm" | "avgHr" | "rpe", raw: string) {
    const t = raw.trim().replace(",", ".");
    const n = t === "" ? null : Number(t);
    row[key] = n != null && Number.isFinite(n) ? (key === "distanceKm" ? storeDistance(n) : n) : null;
  }
</script>

<div class="cardio-form" class:touch={variant === "touch"}>
  {#if value.skipped}
    <div class="skipped" role="status">
      <Pill>{text.skipped}</Pill>
      <span>{text.reasons[value.skipped]}</span>
      <Button small variant="ghost" type="button" onclick={() => (value.skipped = null)}>{text.undoSkip}</Button>
    </div>
    {#if value.skipped === "pain"}
      <!-- skipped for pain: where and how bad still reaches the coach -->
      <div class="pain-note"><InputField label={text.painNote} bind:value={value.painNote} maxlength={280} optional /></div>
      {#if text.painSafety}<p class="safety" role="note">{text.painSafety}</p>{/if}
    {/if}
    {@render notes?.()}
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
          <InputField label={text.modality} placeholder={text.modalityPlaceholder} bind:value={() => showModality(value.modality), (v) => (value.modality = storeModality(v))} maxlength={80} error={problem === "modality" ? text.modalityError : null} />
        {/if}
      </div>
      <InputDuration label={text.duration} bind:value={value.durationSec} min={1} max={18000} junkText={text.junkTime} rangeWords={text.rangeWords} hint={durationHint} error={problem === "duration" ? text.durationHint : errorOf("durationRange")} />
      <div class="lbl-field rpe-field">
        <span class="lbl">{text.rpe}</span>
        <SelectStepper label={text.rpe} values={RPE} columns={5} start={5} scale={rpeScale} bind:value={value.rpe} block stepWords={text.stepWords} describe={(v) => text.rpeFeel[Math.min(4, Math.floor((v - 1) / 2))]} />
        {#if problem === "rpe"}<p class="err">{text.rpeHint}</p>{:else}<p class="hint">{text.rpeHint}</p>{/if}
      </div>
      <InputUnit rangeWords={text.rangeWords} label={text.distance} unit={distLabel} bind:value={() => (value.distanceKm == null ? null : showDistance(value.distanceKm)), (v) => (value.distanceKm = v == null ? null : storeDistance(v))} step={0.1} min={0} max={300} optional={text.optional} error={errorOf("distanceRange")} />
      <InputUnit rangeWords={text.rangeWords} label={text.avgHr} unit="bpm" bind:value={value.avgHr} min={30} max={240} optional={text.optional} error={errorOf("avgHrRange")} />
      <InputUnit rangeWords={text.rangeWords} label={text.maxHr} unit="bpm" bind:value={value.maxHr} min={30} max={240} optional={text.optional} error={problem === "maxHr" ? text.maxHrError : errorOf("maxHrRange")} />
    </div>

    <div class="pain">
      <ToggleChip on={value.pain} onclick={() => (value.pain = !value.pain)}>{text.pain}</ToggleChip>
      {#if value.pain}
        <div class="pain-note"><InputField label={text.painNote} bind:value={value.painNote} maxlength={280} /></div>
        {#if text.painSafety}<p class="safety" role="note">{text.painSafety}</p>{/if}
      {/if}
    </div>

    {#if calc.pace || load}
      <p class="calc" aria-live="polite">
        {#if calc.pace}<span>{text.pace} <b>{calc.pace}</b></span>{/if}
        {#if load}<span>{text.load} <b>{load.au}{text.loadUnit ? ` ${text.loadUnit}` : ""}</b> <span class="muted">= {load.rpe} × {load.min} {text.minutes}</span></span>{/if}
      </p>
    {/if}

    <details class="more" bind:open={moreOpen}>
      <summary>{text.more}</summary>
      <div class="more-body">
        <InputUnit rangeWords={text.rangeWords} label={text.calories} unit={text.kcal} bind:value={value.calories} min={0} max={10000} optional={text.optional} width="auto" error={errorOf("caloriesRange")} />
        {#if value.intervals.length}
          <div class="ivs">
            <span class="lbl">{text.intervals}</span>
            {#if problem === "intervalRange"}<p class="err" role="alert">{text.errors.intervalRange}</p>{:else}<p class="hint">{text.intervalsHint}</p>{/if}
            {#if repCards}
              <ol class="reps">
                {#each value.intervals as row (row.key)}
                  {@const label = rowLabel(row)}
                  <li class="rep" class:work={row.type === "work"}>
                    <span class="rep-name">{label}</span>
                    <div class="rep-fields">
                      <InputDuration label={text.time} bind:value={row.durationSec} step={5} junkText={text.junkTime} rangeWords={text.rangeWords} />
                      <InputUnit rangeWords={text.rangeWords} label={distLabel} unit={distLabel} step={0.1} min={0} bind:value={() => (row.distanceKm == null ? null : showDistance(row.distanceKm)), (v) => (row.distanceKm = v == null ? null : storeDistance(v))} />
                      <InputUnit rangeWords={text.rangeWords} label={text.avgHr} unit="bpm" min={30} max={240} bind:value={row.avgHr} />
                      <InputUnit rangeWords={text.rangeWords} label="RPE" unit="/10" min={1} max={10} bind:value={row.rpe} />
                    </div>
                  </li>
                {/each}
              </ol>
            {:else}
            <div class="scroll">
              <table class="sheet">
                <thead>
                  <tr><th>{text.rep}</th><th class="r">{text.time}</th><th class="r">{distLabel}</th><th class="r">{text.avgHr}</th><th class="r">RPE</th></tr>
                </thead>
                <tbody>
                  {#each value.intervals as row (row.key)}
                    {@const label = rowLabel(row)}
                    <tr class:work={row.type === "work"}>
                      <td>{label}</td>
                      <td class="r num"><InputDuration label="{text.time} · {label}" bind:value={row.durationSec} cell step={5} junkText={text.junkTime} rangeWords={text.rangeWords} /></td>
                      <td class="r num"><InputCell label="{distLabel} · {label}" figure value={cellNum(row.distanceKm == null ? null : showDistance(row.distanceKm))} oncommit={(v) => setCell(row, "distanceKm", v)} /></td>
                      <td class="r num"><InputCell label="{text.avgHr} · {label}" figure value={cellNum(row.avgHr)} oncommit={(v) => setCell(row, "avgHr", v)} /></td>
                      <td class="r num"><InputCell label="RPE · {label}" figure value={cellNum(row.rpe)} oncommit={(v) => setCell(row, "rpe", v)} /></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
            {/if}
          </div>
        {/if}
      </div>
    </details>

    {@render notes?.()}

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
  .safety { flex-basis: 100%; margin: 0; padding: 8px 12px; border-left: 3px solid var(--warn); background: var(--warn-bg); color: var(--warn-ink); font: 500 13px/1.45 var(--font-ui); text-wrap: pretty; }
  .touch .safety { font-size: 14px; }
  .calc { display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0; font-size: 13px; color: var(--muted); }
  .calc b { font: 600 13px var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); }
  .muted { color: var(--muted); }
  .more { border-top: 1px solid var(--line-soft); padding-top: 10px; }
  .more summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .more summary:hover { color: var(--ink); }
  .more-body { display: grid; gap: 14px; padding-top: 12px; }
  .ivs { display: grid; gap: 4px; }
  .scroll { overflow-x: auto; }
  .sheet { width: 100%; min-width: 440px; border-collapse: collapse; font-size: 13px; }
  .sheet th { text-align: left; font: 500 12px var(--font-ui); color: var(--muted); padding: 4px 10px; border-bottom: 1px solid var(--line); white-space: nowrap; }
  .sheet td { padding: 3px 10px; border-bottom: 1px solid var(--line-soft); white-space: nowrap; }
  .sheet .r { text-align: right; }
  .sheet td.num { width: 11ch; }
  .sheet tr.work td:first-child { font-weight: 600; }
  .reps { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 10px; }
  .rep { display: grid; gap: 8px; padding: 10px 12px; border: 1px solid var(--line-soft); border-radius: var(--radius); }
  .rep-name { font: 500 13px var(--font-ui); color: var(--ink); }
  .rep.work .rep-name { font-weight: 600; }
  .rep-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .skip { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .reasons { display: flex; flex-wrap: wrap; gap: 6px; }
  .skipped { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 14px; }
  @media (max-width: 860px) {
    .grid { grid-template-columns: 1fr 1fr; }
    .wide { grid-column: 1 / -1; }
  }
  .touch { padding: 0; }
  .touch .grid { grid-template-columns: 1fr 1fr; }
  .touch .wide, .touch .rpe-field { grid-column: 1 / -1; }
  /* the portal reads one size up, at arm's length */
  .touch :global(.lbl) { font-size: 14px; }
  .touch .hint, .touch .calc, .touch .more summary { font-size: 14px; }
  .touch .calc b { font-size: 14px; }
</style>
