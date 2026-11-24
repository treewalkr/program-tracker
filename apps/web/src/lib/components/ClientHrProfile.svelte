<script lang="ts">
  import { HR_ZONE_METHODS, profileOn, type HrZone, type HrZoneMethod } from "@pt/shared";
  import type { HrProfileDto, HrProfileInputDto } from "$lib/api/types";
  import { HR_METHOD_HINT, HR_METHOD_LABEL, hrBackdateNote, hrDraftOf, hrDraftZones, hrInputOf, hrInputsLine, MAX_HR_UNTESTED, maxHrUntested, type HrDraft } from "$lib/hrProfile";
  import ProfileSection from "./ProfileSection.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import InputUnit from "$lib/ui/InputUnit.svelte";
  import InputDate from "$lib/ui/InputDate.svelte";
  import InputCell from "$lib/ui/InputCell.svelte";
  import Button from "$lib/ui/Button.svelte";
  import SkeletonRows from "$lib/ui/SkeletonRows.svelte";

  /**
   * The member's heart-rate profile: versioned, never edited in place. A new
   * version starts on a date, so sessions logged before it keep the zones
   * they were prescribed against. Saves on its own, like the deload rule.
   */
  interface Props {
    /** Every version, oldest first; null while loading. */
    versions: HrProfileDto[] | null;
    /** Today, YYYY-MM-DD (injectable for stories). */
    today: string;
    onsave: (input: HrProfileInputDto) => Promise<HrProfileDto>;
  }

  let { versions, today, onsave }: Props = $props();

  const current = $derived(versions ? profileOn(versions, today) : null);
  const upcoming = $derived((versions ?? []).filter((v) => v.effectiveFrom > today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom)));
  const nextVersion = $derived(Math.max(0, ...(versions ?? []).map((v) => v.version)) + 1);

  let editing = $state(false);
  let draft = $state<HrDraft>(hrDraftOf(null, ""));
  let busy = $state(false);
  let error = $state<string | null>(null);
  let showHistory = $state(false);

  const preview = $derived(hrDraftZones(draft));
  const backdated = $derived(editing ? hrBackdateNote(versions ?? [], draft.effectiveFrom) : null);
  /** Latest start first, the one in effect marked: the highest number isn't always the one that applies. */
  const byStart = $derived(
    [...(versions ?? [])].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.version - a.version)
  );
  const methods = HR_ZONE_METHODS.map((m) => ({ value: m, label: HR_METHOD_LABEL[m], title: HR_METHOD_HINT[m] }));

  function edit() {
    const from = upcoming.at(-1) ?? current;
    draft = hrDraftOf(from ? $state.snapshot(from) : null, today);
    error = null;
    editing = true;
  }

  function setMethod(m: HrZoneMethod) {
    // switching to custom starts from whatever the inputs give now
    if (m === "custom" && "zones" in preview) draft.zones = preview.zones.map((z) => ({ ...z }));
    draft.method = m;
  }

  function setZone(z: HrZone, key: "min" | "max", raw: string) {
    const n = Number(raw.trim());
    z[key] = Number.isInteger(n) && n > 0 ? n : 0;
  }

  async function save() {
    const out = hrInputOf($state.snapshot(draft));
    if ("error" in out) {
      error = out.error;
      return;
    }
    busy = true;
    error = null;
    try {
      await onsave(out.input);
      editing = false;
    } catch (e) {
      error = (e as Error).message || "Could not save";
    } finally {
      busy = false;
    }
  }

  const zoneRows = $derived<readonly HrZone[] | null>(editing ? ("zones" in preview ? preview.zones : draft.method === "custom" ? draft.zones : null) : (current?.zones ?? null));
</script>

<ProfileSection title="Heart-rate zones" purpose="what Z1–Z5 mean in bpm for them">
  {#if !versions}
    <SkeletonRows rows={3} dense />
  {:else if editing}
    <Segmented label="Zone method" lead="Method" items={methods} value={draft.method} onchange={setMethod} disabled={busy} />
    <p class="hint">{HR_METHOD_HINT[draft.method]}</p>

    <div class="inputs">
      <div class="u"><InputUnit label="Resting HR" unit="bpm" min={30} max={120} optional={draft.method !== "karvonen"} bind:value={draft.restingHr} disabled={busy} /></div>
      <div class="u"><InputUnit label="Max HR" unit="bpm" min={100} max={240} optional={draft.method === "lthr" || draft.method === "custom"} bind:value={draft.maxHr} disabled={busy} /></div>
      <div class="d"><InputDate label="Max HR tested on" optional {today} max={today} hint="Blank = not tested" bind:value={draft.maxHrTestedOn} disabled={busy} /></div>
      <div class="u"><InputUnit label="LTHR" unit="bpm" min={80} max={230} optional={draft.method !== "lthr"} bind:value={draft.lthr} disabled={busy} /></div>
    </div>

    {@render table(zoneRows, draft.method === "custom")}
    {#if "missing" in preview}<p class="issue" role="status">{preview.missing}</p>{/if}

    <div class="foot">
      <div class="from">
        <InputDate label="Starts" {today} bind:value={draft.effectiveFrom} hint="Sessions before this keep their old zones" disabled={busy} />
        {#if backdated}<p class="warn" role="status">{backdated}</p>{/if}
      </div>
      <div class="acts">
        {#if error}<p class="err" role="alert">{error}</p>{/if}
        <Button small variant="ghost" type="button" disabled={busy} onclick={() => (editing = false)}>Cancel</Button>
        <Button small variant="primary" type="button" disabled={busy || "missing" in preview || !draft.effectiveFrom} onclick={save}>
          {busy ? "Saving…" : `Save as version ${nextVersion}`}
        </Button>
      </div>
    </div>
  {:else if !current && !upcoming.length}
    <div class="row">
      <p class="now">
        <span class="who">No zones yet</span>
        <span class="text">Cardio sessions show Z1–Z5 without bpm until you add a max HR, resting HR or LTHR.</span>
      </p>
      <Button small type="button" onclick={edit}>Add zones</Button>
    </div>
  {:else}
    <div class="row">
      <p class="now">
        {#if current}
          <span class="who own">{HR_METHOD_LABEL[current.method]} · version {current.version}, since {current.effectiveFrom}</span>
          <span class="text">{hrInputsLine(current)}</span>
        {:else}
          <span class="who">No zones in effect yet</span>
        {/if}
        {#each upcoming as u (u.id)}
          <span class="next">Version {u.version} ({HR_METHOD_LABEL[u.method]}) starts {u.effectiveFrom}</span>
        {/each}
      </p>
      <Button small type="button" onclick={edit}>New version</Button>
    </div>
    {@render table(current?.zones ?? null, false)}
    {#if maxHrUntested(current)}<p class="approx">{MAX_HR_UNTESTED}</p>{/if}
    {#if versions.length > 1}
      <button type="button" class="toggle" aria-expanded={showHistory} onclick={() => (showHistory = !showHistory)}>
        {showHistory ? "Hide" : "Show"} all {versions.length} versions
      </button>
      {#if showHistory}
        <ol class="history">
          {#each byStart as v (v.id)}
            <li>
              <span class="mono">v{v.version}</span>
              <span>{v.effectiveFrom}{#if v.id === current?.id}<span class="live">in effect</span>{/if}</span>
              <span>{HR_METHOD_LABEL[v.method]}</span>
              <span class="muted">{hrInputsLine(v)}</span>
            </li>
          {/each}
        </ol>
      {/if}
    {/if}
  {/if}
</ProfileSection>

{#snippet table(zones: readonly HrZone[] | null, editable: boolean)}
  <div class="scroll"><table class="zones" aria-label="Heart-rate zones">
    <thead><tr><th>Zone</th>{#each [1, 2, 3, 4, 5] as z (z)}<th class="r">Z{z}</th>{/each}</tr></thead>
    <tbody>
      <tr>
        <th scope="row">bpm</th>
        {#each [1, 2, 3, 4, 5] as n (n)}
          {@const z = zones?.find((x) => x.zone === n)}
          <td class="r num">
            {#if editable && z}
              <span class="pair">
                <InputCell label="Zone {n} min bpm" figure width={4} placeholder="min" bind:value={() => (z.min ? String(z.min) : ""), (v) => setZone(z, "min", v)} />
                <span class="dash">–</span>
                <InputCell label="Zone {n} max bpm" figure width={4} placeholder="max" bind:value={() => (z.max ? String(z.max) : ""), (v) => setZone(z, "max", v)} />
              </span>
            {:else if z}
              {z.min}–{z.max}
            {:else}
              <span class="muted">—</span>
            {/if}
          </td>
        {/each}
      </tr>
    </tbody>
  </table></div>
{/snippet}

<style>
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .now { margin: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; line-height: 1.5; }
  .who { font-size: 12px; font-weight: 600; color: var(--muted); }
  .who.own { color: var(--blue); }
  .text { color: var(--ink); }
  .next { font-size: 12px; color: var(--muted); }
  .hint { margin: -6px 0 0; font-size: 12px; color: var(--muted); }
  .inputs { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; }
  .inputs .u { flex: 1 1 130px; }
  .inputs .d { flex: 2 1 250px; }
  .scroll { overflow-x: auto; }
  .zones { width: 100%; border-collapse: collapse; font-size: 13px; }
  .zones th { font: 500 12px var(--font-ui); color: var(--muted); text-align: left; padding: 4px 8px; border-bottom: 1px solid var(--line); }
  .zones td { padding: 6px 8px; border-bottom: 1px solid var(--line-soft); white-space: nowrap; }
  .zones tbody th { border-bottom: 1px solid var(--line-soft); }
  .zones .r { text-align: right; }
  .num { font: 500 13px var(--font-mono); font-variant-numeric: tabular-nums; color: var(--ink); }
  .pair { display: inline-flex; align-items: center; gap: 2px; }
  .dash { color: var(--muted); }
  .muted { color: var(--muted); }
  .issue { margin: 0; font-size: 13px; color: var(--bad); }
  .foot { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .from { min-width: 250px; }
  .acts { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  .acts .err { margin: 0 auto 0 0; color: var(--bad); font-size: 12px; }
  .toggle { align-self: flex-start; border: 0; background: none; padding: 0; font: 500 12px var(--font-ui); color: var(--blue); cursor: pointer; }
  .toggle:hover { text-decoration: underline; }
  .history { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: 12px; }
  .history li { display: grid; grid-template-columns: 3ch 20ch 18ch 1fr; gap: 8px; }
  .live { margin-left: 6px; color: var(--blue); font-weight: 600; }
  .warn { margin: 6px 0 0; max-width: 46ch; font-size: 12px; color: var(--warn); }
  /* Touch has no hover to reveal a quiet cell: show the empty ones as fields. */
  @media (max-width: 720px), (pointer: coarse) {
    .pair :global(.cell:not(:focus):not([aria-invalid='true'])) { border-color: var(--line); background: var(--surface); }
  }
  .mono { font-family: var(--font-mono); }
  @media (max-width: 640px) {
    .zones { font-size: 12px; }
    .zones td, .zones th { padding: 4px; }
    .history li { grid-template-columns: 3ch 1fr; }
    .history li span:nth-child(n + 3) { grid-column: 2; }
  }
  .approx {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--warn);
  }
</style>
