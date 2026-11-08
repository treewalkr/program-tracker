<script lang="ts">
  import type { ProgramPhasingDto, WeekDirective, WeekMetric } from "$lib/api/types";
  import { WEEK_DIRECTIVES, type ProgressionKind } from "@pt/shared";
  import { normalizePlan, planChanges, setProgression, validatePlanWeek, PROGRESSION_STEP, type PlanWeek } from "$lib/draftReview";
  import BlockPlanStrip from "./BlockPlanStrip.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Edit a draft's block plan by hand: per-week directive, % target, progression rule and note;
   * add or remove weeks; rename the phase. The strip above previews the result.
   * Out-of-range targets block Save; softer issues show as warnings.
   */
  interface Props {
    /** The plan being edited (left untouched — the editor works on a copy). */
    phasing: ProgramPhasingDto;
    /** Version number the save will create, e.g. 5. */
    nextVersion: number;
    saving?: boolean;
    error?: string | null;
    onsave: (phasing: ProgramPhasingDto) => void;
    oncancel: () => void;
  }

  let { phasing, nextVersion, saving = false, error = null, onsave, oncancel }: Props = $props();

  // svelte-ignore state_referenced_locally
  let edit = $state<ProgramPhasingDto>(normalizePlan(structuredClone($state.snapshot(phasing))));
  let selected = $state(1);

  const METRICS: [WeekMetric | "", string][] = [
    ["", "No target"],
    ["overall_volume", "Volume"],
    ["rep_volume", "Rep volume"],
    ["intensity", "Load"],
  ];

  const weeks = $derived(edit.weeks ?? []);
  const normalized = $derived(normalizePlan(edit));
  const changes = $derived(planChanges(phasing, normalized));
  const changedWeeks = $derived(new Set(changes.map((c) => c.week).filter((w): w is number => w !== null)));
  const blocked = $derived(weeks.some((w) => validatePlanWeek(w)?.kind === "err"));

  function setMetric(w: PlanWeek, metric: WeekMetric | "") {
    w.target = metric ? { metric, deltaPercent: w.target?.deltaPercent ?? (metric === "intensity" ? 2.5 : 5) } : undefined;
  }

  const PROGRESSIONS: [ProgressionKind | "", string][] = [
    ["", "None"],
    ["kg", "+kg"],
    ["percent", "+% 1RM"],
    ["sets", "+sets"],
  ];

  function setProgAmount(w: PlanWeek, value: string) {
    if (w.progression) w.progression.amount = value === "" ? Number.NaN : Number(value);
  }

  function setPct(w: PlanWeek, value: string) {
    if (w.target) w.target.deltaPercent = value === "" ? Number.NaN : Number(value);
  }

  function addWeek() {
    edit.weeks = [...weeks, { week: weeks.length + 1, directive: "+volume", target: { metric: "overall_volume", deltaPercent: 5 } }];
  }

  function removeLast() {
    edit.weeks = weeks.slice(0, -1);
    selected = Math.min(selected, edit.weeks.length);
  }
</script>

<div class="editor">
  <BlockPlanStrip phasing={normalized} bind:selected changed={changedWeeks} />

  <div class="top">
    <label>Phase<input class="input" maxlength="120" bind:value={edit.phase} /></label>
    <label>Next block<input class="input" maxlength="120" placeholder="optional" bind:value={edit.nextPhase} /></label>
    <span class="subtle">{weeks.length} weeks · sessions repeat every week · after approval, Block phasing → Preview progression writes weeks 2+ from these rules</span>
  </div>

  <table class="ed">
    <thead><tr><th>Week</th><th>Directive</th><th>Target</th><th>Progression</th><th>Note</th><th><span class="sr">Remove</span></th></tr></thead>
    <tbody>
      {#each weeks as w, i (i)}
        {@const v = validatePlanWeek(w)}
        <tr class:changed={changedWeeks.has(i + 1)}>
          <td class="w">W{i + 1}</td>
          <td>
            <select class="select dir" aria-label="Week {i + 1} directive" bind:value={w.directive}>
              {#each WEEK_DIRECTIVES as d (d)}<option value={d as WeekDirective}>{d}</option>{/each}
            </select>
          </td>
          <td class="tgt-cell">
            <div class="tgt">
              <select
                class="select met"
                aria-label="Week {i + 1} target metric"
                value={w.target?.metric ?? ""}
                onchange={(e) => setMetric(w, e.currentTarget.value as WeekMetric | "")}
              >
                {#each METRICS as [m, label] (m)}<option value={m}>{label}</option>{/each}
              </select>
              {#if w.target}
                <input
                  class="input pct"
                  type="number"
                  step="0.5"
                  aria-label="Week {i + 1} target percent"
                  value={Number.isFinite(w.target.deltaPercent) ? w.target.deltaPercent : ""}
                  oninput={(e) => setPct(w, e.currentTarget.value)}
                />
                <span class="vs">% vs {i === 0 ? "start" : `W${i}`}</span>
              {/if}
            </div>
            {#if v}<div class="msg {v.kind}">{v.text}</div>{/if}
          </td>
          <td class="prog-cell">
            {#if i === 0}
              <span class="vs" title="Week 1 is the base the later weeks progress from">base</span>
            {:else}
              <div class="tgt">
                <select
                  class="select met"
                  aria-label="Week {i + 1} progression vs W{i}"
                  value={w.progression?.kind ?? ""}
                  onchange={(e) => setProgression(w, e.currentTarget.value as ProgressionKind | "")}
                >
                  {#each PROGRESSIONS as [k, label] (k)}<option value={k}>{label}</option>{/each}
                </select>
                {#if w.progression}
                  <input
                    class="input pct"
                    type="number"
                    step={PROGRESSION_STEP[w.progression.kind]}
                    aria-label="Week {i + 1} progression amount"
                    value={Number.isFinite(w.progression.amount) ? w.progression.amount : ""}
                    oninput={(e) => setProgAmount(w, e.currentTarget.value)}
                  />
                  <span class="vs">{w.progression.kind === "kg" ? "kg" : w.progression.kind === "percent" ? "pts" : "sets"}</span>
                {/if}
              </div>
            {/if}
          </td>
          <td class="note-cell">
            <input class="input note" maxlength="500" placeholder="What this week should do" aria-label="Week {i + 1} note" bind:value={w.note} />
          </td>
          <td>
            {#if i === weeks.length - 1 && weeks.length > 1}
              <button type="button" class="rm" aria-label="Remove week {i + 1}" onclick={removeLast}><Icon name="x" /></button>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if error}<p class="err" role="alert">{error}</p>{/if}

  <div class="foot">
    <button type="button" class="btn small" onclick={addWeek} disabled={weeks.length >= 26}><Icon name="plus" /> Add week</button>
    <button type="button" class="btn primary" disabled={!changes.length || blocked || saving} onclick={() => onsave($state.snapshot(normalized))}>
      {saving ? "Saving…" : `Save as v${nextVersion}`}
    </button>
    <button type="button" class="btn ghost" onclick={oncancel} disabled={saving}>Cancel</button>
    <span class="hint"><Icon name="lock" />{changes.length ? `${changes.length} change${changes.length === 1 ? "" : "s"} · no AI involved · v${nextVersion - 1} stays in history` : "No changes yet"}</span>
  </div>
</div>

<style>
  .top {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    align-items: flex-end;
    margin: 14px 0 10px;
  }
  .top label {
    display: grid;
    gap: 4px;
    font: 500 12px/1 var(--font-ui);
  }
  .top .input {
    width: 200px;
  }
  .sr {
    position: absolute;
    left: -9999px;
  }
  table.ed {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }
  table.ed th {
    font: 600 12px/1.2 var(--font-ui);
    color: var(--muted);
    text-align: left;
    padding: 6px 8px;
    border-bottom: 1px solid var(--line);
  }
  table.ed td {
    padding: 6px 8px;
    border-bottom: 1px solid var(--line-soft);
    vertical-align: top;
  }
  .w {
    font: 600 12px/2.2 var(--font-mono);
    color: var(--muted);
    width: 44px;
  }
  tr.changed .w {
    color: var(--blue);
  }
  .ed :global(.select),
  .ed :global(.input) {
    padding: 4px 8px;
    font-size: 13px;
  }
  .dir {
    width: 130px;
  }
  .met {
    width: 128px;
  }
  .pct {
    width: 76px;
    text-align: right;
    font-family: var(--font-mono);
  }
  .tgt {
    display: flex;
    gap: 6px;
    align-items: center;
    white-space: nowrap;
  }
  .vs {
    color: var(--muted);
    font-size: 12px;
  }
  .note {
    width: 100%;
  }
  .msg {
    font-size: 12px;
    margin-top: 4px;
  }
  .msg.warn {
    color: var(--warn);
  }
  .msg.err,
  .err {
    color: var(--bad);
  }
  .err {
    font-size: 13px;
    margin: 10px 0 0;
  }
  .rm {
    background: none;
    border: 0;
    color: var(--muted);
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
  }
  .rm:hover {
    background: var(--well);
    color: var(--bad);
  }
  .rm :global(svg),
  .hint :global(svg),
  .foot .btn :global(svg) {
    width: 13px;
    height: 13px;
  }
  .foot {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .hint {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  @media (max-width: 1000px) {
    table.ed thead {
      display: none;
    }
    table.ed tr {
      display: grid;
      grid-template-columns: 44px 1fr auto;
      gap: 6px;
      padding: 8px 0;
      border-bottom: 1px solid var(--line-soft);
    }
    table.ed td {
      border: 0;
      padding: 0 4px;
    }
    .tgt-cell,
    .prog-cell,
    .note-cell {
      grid-column: 2 / 4;
    }
    .dir {
      width: 100%;
    }
    .hint {
      margin-left: 0;
      width: 100%;
    }
  }
</style>
