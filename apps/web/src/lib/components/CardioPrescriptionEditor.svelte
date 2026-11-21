<script lang="ts" module>
  import { cardioIssues, cardioTotals, type CardioPrescription } from "@pt/shared";
  import { formatDuration } from "$lib/ui/input/duration";

  /** The line under the editor: what blocks a save, or the workload it has. */
  export function workloadLine(rx: CardioPrescription): { ok: boolean; text: string } {
    const issues = cardioIssues(rx);
    if (issues.length) return { ok: false, text: issues.map((s) => s[0].toUpperCase() + s.slice(1)).join(". ") + "." };
    const t = cardioTotals(rx);
    const what = t.durationSec != null ? formatDuration(t.durationSec) : t.distanceM >= 1000 ? `${t.distanceM / 1000} km` : `${t.distanceM} m`;
    return {
      ok: true,
      text: t.untimedDistance
        ? `Has a workload (${what}). A distance-only part adds distance, never a guessed time.`
        : `Has a workload (${what}).`,
    };
  }
</script>

<script lang="ts">
  import { distanceUnit, showDistance, showPace, storeDistance, storePace } from "$lib/units.svelte";
  import { fromCardioTemplate, zoneBpm, type HrZone } from "@pt/shared";
  import type { CardioTemplateDto, CardioTemplateInput, CardioTemplatesDto, ModalityDto } from "$lib/api/types";
  import IntervalBuilder from "./IntervalBuilder.svelte";
  import SelectCombobox from "$lib/ui/SelectCombobox.svelte";
  import SelectStepper from "$lib/ui/SelectStepper.svelte";
  import SelectField from "$lib/ui/SelectField.svelte";
  import InputUnit from "$lib/ui/InputUnit.svelte";
  import InputDuration from "$lib/ui/InputDuration.svelte";
  import InputField from "$lib/ui/InputField.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import type { SelectOption } from "$lib/ui/select/options";

  interface Props {
    cardio: CardioPrescription;
    /** The trainer's modalities (archived ones stay out of the picker). */
    modalities?: ModalityDto[];
    /** Built-in presets and saved templates; null while loading. */
    templates?: CardioTemplatesDto | null;
    /** The member's bpm zones in effect now; null = zones show on their own. */
    zones?: readonly HrZone[] | null;
    /** Save the current prescription as a template; absent = no button. */
    onsavetemplate?: (input: CardioTemplateInput) => Promise<CardioTemplateDto>;
  }

  let { cardio = $bindable(), modalities = [], templates = null, zones = null, onsavetemplate }: Props = $props();

  type Choice = { id: string; name: string; summary?: string; prescription: Omit<CardioPrescription, "modality"> & { modality?: string }; own: boolean };
  const choices = $derived<Choice[]>([
    ...(templates?.presets ?? []).filter((p) => !p.hidden).map((p) => ({ id: p.key, name: p.name, summary: p.summary, prescription: p.prescription, own: false })),
    ...(templates?.templates ?? []).filter((t) => !t.archivedAt).map((t) => ({ id: t.id, name: t.name, prescription: t.prescription, own: true })),
  ]);

  function apply(c: Choice) {
    const next = fromCardioTemplate({ id: c.id, prescription: c.prescription }, cardio.modality);
    // the session keeps its modality; the template only brings the shape
    cardio = { ...next, ...(cardio.modalityId ? { modalityId: cardio.modalityId } : {}) };
  }

  const modalityOptions = $derived.by((): SelectOption[] => {
    const live = modalities.filter((m) => !m.archivedAt).map((m) => ({ value: m.name, label: m.name, tag: m.presetKey ? undefined : "Custom" }));
    const v = cardio.modality.trim();
    return v && !live.some((o) => o.value.toLowerCase() === v.toLowerCase()) ? [...live, { value: v, label: v, tag: "This session" }] : live;
  });
  function pickModality(name: string) {
    const row = modalities.find((m) => m.name.toLowerCase() === name.toLowerCase());
    cardio.modality = name;
    if (row) cardio.modalityId = row.id;
    else delete cardio.modalityId;
  }

  const zoneOptions = $derived<SelectOption[]>([
    { value: "", label: "No zone" },
    ...[1, 2, 3, 4, 5].map((z) => {
      const b = zoneBpm(zones, z);
      return { value: String(z), label: b ? `Z${z} · ${b.min}–${b.max} bpm` : `Z${z}` };
    }),
  ]);

  const hasIntervals = $derived((cardio.intervals?.length ?? 0) > 0);
  const line = $derived(workloadLine(cardio));

  function buildIntervals() {
    const min = cardio.durationMin ?? 30;
    cardio.intervals = [
      { id: "i1", type: "warmup", repeat: 1, durationSec: 600, ...(cardio.hrZone ? { hrZone: Math.min(2, cardio.hrZone) } : {}) },
      { id: "i2", type: "work", repeat: 1, durationSec: Math.max(60, (min - 15) * 60), ...(cardio.hrZone ? { hrZone: cardio.hrZone } : {}) },
      { id: "i3", type: "cooldown", repeat: 1, durationSec: 300 },
    ];
  }
  function dropIntervals() {
    const t = cardioTotals(cardio);
    const next = { ...cardio };
    delete next.intervals;
    if (t.durationSec) next.durationMin = Math.min(300, Math.max(1, Math.round(t.durationSec / 60)));
    cardio = next;
  }

  let naming = $state(false);
  let templateName = $state("");
  let savingTemplate = $state(false);
  let templateNote = $state<string | null>(null);
  async function saveTemplate() {
    if (!onsavetemplate || !templateName.trim()) return;
    savingTemplate = true;
    templateNote = null;
    try {
      const { modality: _m, modalityId: _id, templateId, ...shape } = $state.snapshot(cardio) as CardioPrescription;
      const saved = await onsavetemplate({ name: templateName.trim(), prescription: shape, basedOn: templateId ?? null });
      cardio.templateId = saved.id;
      templateNote = `Saved as “${saved.name}”.`;
      naming = false;
      templateName = "";
    } catch (e) {
      templateNote = (e as Error).message;
    } finally {
      savingTemplate = false;
    }
  }
</script>

<div class="cpe">
  <div class="block">
    <span class="lbl">Start from a template</span>
    {#if templates}
      <div class="chips" role="group" aria-label="Cardio templates">
        {#each choices as c (c.id)}
          <ToggleChip on={cardio.templateId === c.id} title={c.summary} onclick={() => apply(c)}>{c.name}{#if c.own}<span class="own">yours</span>{/if}</ToggleChip>
        {/each}
      </div>
      <p class="hint">A copy lands in this session. Editing it never changes the template or anything already logged.</p>
    {:else}
      <p class="hint">Loading templates…</p>
    {/if}
  </div>

  <div class="grid">
    <div class="f">
      <span class="lbl">Modality</span>
      <SelectCombobox
        label="Modality"
        options={modalityOptions}
        placeholder="Running, Cycling, Rowing…"
        value={cardio.modality || undefined}
        onchange={pickModality}
        oncreate={pickModality}
        createLabel={(q) => `Use “${q}” for this session`}
      />
    </div>
    <div class="f">
      <span class="lbl">Session RPE target</span>
      <SelectStepper
        label="Session RPE target"
        values={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
        columns={5}
        start={5}
        value={cardio.targetRpe ?? null}
        onchange={(v) => (cardio.targetRpe = v)}
      />
    </div>
    <InputField label="Intensity" optional placeholder="easy, tempo, 85% FTP…" maxlength={60} value={cardio.intensity ?? ""} oninput={(v) => (cardio.intensity = v || undefined)} />
  </div>

  {#if !hasIntervals}
    <div class="grid targets">
      <InputUnit label="Duration" unit="min" step={5} min={1} max={300} value={cardio.durationMin ?? null} onchange={(v) => (cardio.durationMin = v != null && v > 0 ? Math.round(v) : null)} />
      <InputUnit label="Distance" unit={distanceUnit()} optional step={0.5} min={0} max={300} value={cardio.distanceKm != null ? showDistance(cardio.distanceKm) : null} onchange={(v) => (cardio.distanceKm = v != null && v > 0 ? storeDistance(v) : undefined)} />
      <InputDuration label="Pace" optional placeholder="m:ss /{distanceUnit()}" hint="per {distanceUnit()}" step={5} min={60} max={2900} value={cardio.paceSecPerKm != null ? showPace(cardio.paceSecPerKm) : null} onchange={(v) => (cardio.paceSecPerKm = v != null && v >= 60 ? storePace(v) : undefined)} />
      <SelectField label="HR zone" maxWidth="none" options={zoneOptions} value={cardio.hrZone != null ? String(cardio.hrZone) : ""} onchange={(z) => (cardio.hrZone = z ? Number(z) : null)} />
    </div>
  {/if}

  <div class="block">
    <div class="ivhead">
      <span class="lbl">Intervals</span>
      {#if hasIntervals}
        <Button small variant="ghost" type="button" onclick={dropIntervals}>Back to one steady block</Button>
      {/if}
    </div>
    {#if hasIntervals}
      <IntervalBuilder bind:intervals={cardio.intervals!} {zones} />
    {:else}
      <p class="hint">
        One steady block. <button type="button" class="link" onclick={buildIntervals}>Build intervals</button> for warm-up, reps and recovery.
      </p>
    {/if}
  </div>

  <p class="issues" class:bad={!line.ok} role={line.ok ? undefined : "alert"}>
    <Icon name={line.ok ? "check" : "x"} size={12} />
    {line.text}
  </p>

  {#if onsavetemplate}
    <div class="save-tpl">
      {#if naming}
        <div class="name"><InputField label="Template name" maxlength={80} bind:value={templateName} placeholder="Hill repeats" /></div>
        <Button small variant="primary" type="button" disabled={savingTemplate || !templateName.trim() || !line.ok} onclick={saveTemplate}>{savingTemplate ? "Saving…" : "Save template"}</Button>
        <Button small variant="ghost" type="button" onclick={() => (naming = false)}>Cancel</Button>
      {:else}
        <Button small type="button" disabled={!line.ok} onclick={() => ((naming = true), (templateNote = null))}>Save as template</Button>
      {/if}
      {#if templateNote}<span class="hint" role="status">{templateNote}</span>{/if}
    </div>
  {/if}
</div>

<style>
  .cpe { display: grid; gap: 14px; min-width: 0; }
  .block { display: grid; gap: 6px; min-width: 0; }
  .lbl { font: 500 12px var(--font-ui); color: var(--ink); }
  .hint { margin: 0; font: 400 12px/1.4 var(--font-ui); color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .own { margin-left: 6px; font-size: 11px; color: var(--muted); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; align-items: start; }
  .f { display: grid; gap: 4px; min-width: 0; }
  .ivhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .link { border: 0; background: none; padding: 0; color: var(--blue); font: inherit; cursor: pointer; }
  .link:hover { text-decoration: underline; }
  .issues { display: flex; gap: 6px; align-items: baseline; margin: 0; font-size: 13px; color: var(--muted); }
  .issues :global(svg) { color: var(--good); flex: none; }
  .issues.bad { color: var(--bad); font-weight: 500; }
  .issues.bad :global(svg) { color: var(--bad); }
  .save-tpl { display: flex; flex-wrap: wrap; align-items: end; gap: 8px; }
  .name { min-width: 220px; }
</style>
