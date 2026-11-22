<script lang="ts">
  import { showWeight, storeWeight, weightUnit } from "$lib/units.svelte";
  import { VO2_FORMULAS, VO2_LIMITS, VO2_PROTOCOLS, type Vo2Member, type Vo2Protocol } from "@pt/shared";
  import type { AssessmentDto, AssessmentInput } from "$lib/api/types";
  import {
    assessmentInputs,
    assessmentSeries,
    emptyAssessmentForm,
    formulaLine,
    inputsText,
    liveEstimate,
    PROTOCOL_HINT,
    PROTOCOL_LABEL,
    PROTOCOL_SHORT,
    protocolsTested,
    type AssessmentForm,
  } from "$lib/assessments";
  import { dayMonth } from "$lib/cardioTab";
  import LiftChart from "./LiftChart.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import SelectDescribed from "$lib/ui/SelectDescribed.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import InputDate from "$lib/ui/InputDate.svelte";
  import InputUnit from "$lib/ui/InputUnit.svelte";
  import InputDuration from "$lib/ui/InputDuration.svelte";
  import InputNote from "$lib/ui/InputNote.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import SkeletonRows from "$lib/ui/SkeletonRows.svelte";
  import type { SelectOption } from "$lib/ui/select/options";

  /**
   * VO₂max field tests: a protocol, its inputs, and the estimate the shared
   * formula gives (the server stores the same one with its formula version).
   * History charts one protocol at a time; workout logs never feed it.
   */
  interface Props {
    member: Vo2Member & { firstName: string; weightKg: number | null };
    /** Newest first or any order; null while loading. */
    assessments: AssessmentDto[] | null;
    today: string;
    oncreate: (input: AssessmentInput) => Promise<AssessmentDto>;
    ondelete: (id: string) => Promise<void>;
  }

  let { member, assessments, today, oncreate, ondelete }: Props = $props();

  // svelte-ignore state_referenced_locally
  let form = $state<AssessmentForm>(emptyAssessmentForm(today, member.weightKg));
  let busy = $state(false);
  let error = $state<string | null>(null);
  let saved = $state<string | null>(null);

  const options: SelectOption<Vo2Protocol>[] = VO2_PROTOCOLS.map((p) => ({ value: p, label: PROTOCOL_LABEL[p], description: PROTOCOL_HINT[p] }));
  const estimate = $derived(liveEstimate(form, member));

  function setProtocol(p: Vo2Protocol) {
    form = { ...emptyAssessmentForm(form.testedOn, member.weightKg, p), notes: form.notes };
    saved = null;
  }

  async function save() {
    const inputs = assessmentInputs(form);
    if (!inputs || !estimate?.ok) return;
    busy = true;
    error = null;
    try {
      const row = await oncreate({ protocol: form.protocol, testedOn: form.testedOn, inputs, notes: form.notes.trim() || null });
      saved = `Saved: ${row.result} ml/kg/min on ${dayMonth(row.testedOn)}.`;
      picked = row.protocol;
      form = { ...emptyAssessmentForm(today, member.weightKg, form.protocol) };
    } catch (e) {
      error = (e as Error).message || "Could not save";
    } finally {
      busy = false;
    }
  }

  const tested = $derived(protocolsTested(assessments ?? []));
  let picked = $state<Vo2Protocol | null>(null);
  const shownProtocol = $derived(picked && tested.includes(picked) ? picked : (tested[0] ?? null));
  const series = $derived(shownProtocol ? assessmentSeries(assessments ?? [], shownProtocol) : []);
  const rows = $derived(
    shownProtocol ? [...(assessments ?? [])].filter((a) => a.protocol === shownProtocol).sort((a, b) => b.testedOn.localeCompare(a.testedOn)) : [],
  );
  const inputHead: Record<Vo2Protocol, string> = { cooper_12min: "Distance", run_1_5mile: "Time", rockport_walk: "Time · HR · weight" };
</script>

<div class="as-grid">
  <Panel title="New assessment">
    <div class="panel-body form">
      <SelectDescribed label="Protocol" {options} value={form.protocol} onchange={setProtocol} />
      <div class="row">
        <div class="date"><InputDate label="Date" {today} max={today} bind:value={form.testedOn} /></div>
        {#if form.protocol === "cooper_12min"}
          <InputUnit label="Distance covered" unit="m" step={10} min={VO2_LIMITS.cooperDistanceM.min} max={VO2_LIMITS.cooperDistanceM.max} bind:value={form.distanceM} />
        {:else if form.protocol === "run_1_5mile"}
          <InputDuration label="Finishing time" bind:value={form.timeSec} min={VO2_LIMITS.run15TimeSec.min} max={VO2_LIMITS.run15TimeSec.max} hint="mm:ss" />
        {:else}
          <InputDuration label="Walk time" bind:value={form.timeSec} min={VO2_LIMITS.rockportTimeSec.min} max={VO2_LIMITS.rockportTimeSec.max} hint="mm:ss" />
          <InputUnit label="Finishing HR" unit="bpm" min={VO2_LIMITS.rockportHr.min} max={VO2_LIMITS.rockportHr.max} bind:value={form.heartRate} hint="From a monitor, or a 15-second count × 4 straight away" />
          <InputUnit label="Weight" unit={weightUnit()} step={0.5} min={Math.floor(showWeight(20))} max={Math.ceil(showWeight(300))} bind:value={() => (form.weightKg == null ? null : showWeight(form.weightKg)), (v) => (form.weightKg = v == null ? null : storeWeight(v))} hint={member.weightKg != null ? "From the profile" : null} />
        {/if}
      </div>
      {#if form.protocol === "rockport_walk"}
        <p class="facts">
          Age and sex come from the profile:
          {#if member.sex && member.birthDate}<b>{member.sex}, born {member.birthDate}</b> ✓{:else}<b class="bad">{!member.sex ? "sex" : "birth date"} not recorded</b> — add it in Settings first.{/if}
        </p>
      {/if}
      <InputNote label="Notes" optional rows={1} maxlength={500} placeholder="Track, weather, how it felt" bind:value={form.notes} />

      <div class="est" class:bad={estimate && !estimate.ok} aria-live="polite">
        <span class="est-lb">Estimated VO₂max</span>
        {#if !estimate}
          <span class="est-v muted">—</span>
          <span class="est-f">Fill in the test to see the estimate.</span>
        {:else if estimate.ok}
          <span class="est-v">{estimate.value} <span class="u">ml/kg/min</span></span>
          <span class="est-f">{formulaLine(form.protocol)}</span>
          {#if estimate.warning}<span class="est-f warn" role="status">{estimate.warning}</span>{/if}
        {:else}
          <span class="est-f">{estimate.error}</span>
        {/if}
      </div>

      <div class="acts">
        {#if error}<p class="err" role="alert">{error}</p>{:else if saved}<p class="ok" role="status">{saved}</p>{/if}
        <Button variant="primary" type="button" disabled={busy || !estimate?.ok} onclick={save}>{busy ? "Saving…" : "Save assessment"}</Button>
      </div>
      <p class="caveat">{VO2_FORMULAS[form.protocol].population}</p>
    </div>
  </Panel>

  <Panel title="History" count={assessments ? String(assessments.length) : undefined}>
    {#snippet act()}
      {#if tested.length > 1 && shownProtocol}
        <Segmented label="Protocol shown" items={tested.map((p) => ({ value: p, label: PROTOCOL_SHORT[p] }))} value={shownProtocol} onchange={(p) => (picked = p)} />
      {/if}
    {/snippet}
    {#if !assessments}
      <SkeletonRows rows={3} dense />
    {:else if !shownProtocol}
      <EmptyState>No field tests yet. Save one on the left; it shows here with its trend.</EmptyState>
    {:else}
      <div class="panel-body hist">
        {#if series.length}
          <LiftChart name={PROTOCOL_LABEL[shownProtocol]} {series} unit="ml/kg/min" measure="Estimated VO₂max" per="test" />
        {/if}
        <table class="tbl">
          <thead><tr><th>Date</th><th>{inputHead[shownProtocol]}</th><th class="r">Estimate</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {#each rows as a (a.id)}
              <tr>
                <td>{dayMonth(a.testedOn)} {a.testedOn.slice(0, 4)}</td>
                <td class="mono">{inputsText(a)}</td>
                <td class="r mono strong">{a.result}</td>
                <td class="r"><ConfirmButton label="Delete" confirmLabel="Delete this test?" onconfirm={() => ondelete(a.id)} small variant="ghost" class="danger" /></td>
              </tr>
            {/each}
          </tbody>
        </table>
        <p class="caveat">These are field-test estimates, not lab results. The chart shows one protocol at a time, and workout logs never feed it.</p>
      </div>
    {/if}
  </Panel>
</div>

<style>
  .as-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 3fr); gap: 16px; align-items: start; }
  .form { display: grid; gap: 14px; }
  .row { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
  .row > :global(*) { flex: 1 1 140px; }
  .row .date { flex: 1 1 240px; }
  .facts { margin: 0; font-size: 13px; color: var(--muted); }
  .facts b { color: var(--ink); font-weight: 600; }
  .facts b.bad { color: var(--bad); }
  .est { display: grid; gap: 2px; padding: 12px 14px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); }
  .est-lb { font: 500 12px var(--font-ui); color: var(--muted); }
  .est-v { font: 600 24px/1.2 var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); }
  .est-v .u { font: 400 13px var(--font-ui); color: var(--muted); }
  .est-v.muted { color: var(--faint); }
  .est-f { font: 400 12px var(--font-mono); color: var(--muted); overflow-wrap: anywhere; }
  .est.bad .est-f { color: var(--bad); font-family: var(--font-ui); font-size: 13px; }
  .est-f.warn { color: var(--warn-ink); font-family: var(--font-ui); font-size: 13px; }
  .acts { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  .acts p { margin: 0 auto 0 0; font-size: 12px; }
  .err { color: var(--bad); }
  .ok { color: var(--good); }
  .caveat { margin: 0; font-size: 12px; color: var(--muted); }
  .hist { display: grid; gap: 14px; }
  .tbl { width: 100%; border-collapse: collapse; font-size: 13px; }
  .tbl th { font: 500 12px var(--font-ui); color: var(--muted); text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); }
  .tbl td { padding: 4px 8px; border-bottom: 1px solid var(--line-soft); }
  .tbl td:first-child { white-space: nowrap; }
  .tbl .r { text-align: right; }
  .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .strong { font-weight: 600; color: var(--ink); }
  @media (max-width: 900px) {
    .as-grid { grid-template-columns: 1fr; }
  }
</style>
