<script lang="ts">
  import { fmtWeight, weightUnit } from "$lib/units.svelte";
  import type { ExerciseDto, ExerciseInput, PrescribedSetDto, ProgramExerciseDto } from "$lib/api/types";
  import { suggestRoleIn } from "$lib/roleLabels";
  import {
    isUniform,
    loadCell,
    parseRange,
    patchAll,
    repsLabel,
    restIssue,
    rpeCell,
    rpeIssue,
    setMode,
    withLoad,
    withMode,
    withRir,
    withRpe,
    withSetCount,
    withTempo,
    type SetMode,
  } from "$lib/programEdit";
  import { resolveLoadKg } from "@pt/shared";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import InputCell from "$lib/ui/InputCell.svelte";
  import InputNote from "$lib/ui/InputNote.svelte";
  import SelectCell from "$lib/ui/SelectCell.svelte";
  import type { SelectOption } from "$lib/ui/select/options";
  import { parseFigure } from "$lib/ui/input/figure";
  import ExercisePicker from "./ExercisePicker.svelte";
  import RolePicker from "./RolePicker.svelte";
  import GroupTag from "./GroupTag.svelte";

  /**
   * Inline editor for one exercise, opened from the read view. Identical sets
   * edit as one row; mixed sets get a per-set table. One column header row,
   * and only the fields the set mode needs.
   */
  let {
    exercise = $bindable(),
    catalog,
    canMoveUp,
    canMoveDown,
    onmoveup,
    onmovedown,
    onremove,
    onclose,
    oncreate,
    oneRepMaxKg = null,
    session,
    tag = null,
    onlink,
    onunlink,
    block = "main",
    onblock,
    oninvalid,
  }: {
    exercise: ProgramExerciseDto;
    /** The session's exercises (this one included) — picking an exercise with no role suggests one from its place. */
    session?: ProgramExerciseDto[];
    /** The client's 1RM for this exercise — "75%" loads show their kg; null = none on file. */
    oneRepMaxKg?: number | null;
    catalog: ExerciseDto[];
    canMoveUp: boolean;
    canMoveDown: boolean;
    onmoveup: () => void;
    onmovedown: () => void;
    onremove: () => void;
    /** Closes back to the read view. Omit to render as an always-open inline block (no Done, hairline border). */
    onclose?: () => void;
    /** Adds a new library exercise from the picker. */
    oncreate?: (input: ExerciseInput) => Promise<ExerciseDto>;
    /** Superset tag ("A1") when this exercise is in a group; its set count is then the group's rounds. */
    tag?: string | null;
    /** "Superset with next" — omit when there is no next exercise. */
    onlink?: () => void;
    /** Take this exercise out of its group. */
    onunlink?: () => void;
    /** The session block this slot sits in. */
    block?: "prep" | "main";
    /** Move it to the other block ("Move to main work" / "Move to movement prep"); omit when the move isn't allowed. */
    onblock?: () => void;
    /** An RPE cell holds text that can't be saved (it never reaches the doc), or null once cleared — lets the save bar hold. */
    oninvalid?: (message: string | null) => void;
  } = $props();

  const grouped = $derived(tag != null);

  // svelte-ignore state_referenced_locally
  let split = $state(!isUniform(exercise.prescribedSets));
  const sets = $derived(exercise.prescribedSets);
  const mode = $derived(setMode(sets[0]));
  const uniform = $derived(isUniform(sets));
  // svelte-ignore state_referenced_locally
  let showMore = $state(exercise.prescribedSets.some((s) => s.tempo || s.targetRir != null));
  /** "75% of 140 kg = 105 kg" per distinct %1RM in the exercise. */
  const percentNote = $derived.by(() => {
    const pcts = [...new Set(sets.map((s) => s.percent1rm).filter((p): p is number => p != null))];
    if (pcts.length === 0) return null;
    if (oneRepMaxKg == null) return "No 1RM on file for this lift: add it in the client's Settings to see the load.";
    return pcts.map((p) => `${p}% = ${fmtWeight(resolveLoadKg({ percent1rm: p }, oneRepMaxKg)!)}`).join(" · ") + ` (1RM ${fmtWeight(oneRepMaxKg)}, rounded to 2.5 kg)`;
  });
  const MODES: { id: SetMode; label: string; title: string }[] = [
    { id: "reps", label: "Reps", title: "Rep target or range, e.g. 8 or 6–10" },
    { id: "timed", label: "Timed", title: "Hold or carry for a number of seconds" },
    { id: "max", label: "Max", title: "As many reps as possible" },
  ];

  const setAll = (fn: (s: PrescribedSetDto) => PrescribedSetDto) => {
    exercise.prescribedSets = patchAll(sets, fn);
  };
  const setOne = (i: number, fn: (s: PrescribedSetDto) => PrescribedSetDto) => {
    exercise.prescribedSets = sets.map((s, j) => (j === i ? fn(s) : s));
  };

  const num = (raw: string) => (raw.trim() === "" ? null : Number(raw));
  /** A figure cell's text as a number field would hand it over: the number, or "" for blank or junk. */
  const fig = (raw: string) => String(parseFigure(raw) ?? "");
  const TYPES: SelectOption<PrescribedSetDto["type"]>[] = [
    { value: "working", label: "working" },
    { value: "backoff", label: "backoff" },
  ];

  function reps(s: PrescribedSetDto, raw: string): PrescribedSetDto {
    const r = parseRange(raw);
    if (!r) return s;
    if (mode === "max") return { ...s, reps: Math.round(r.max) };
    const max = Math.min(100, Math.max(1, Math.round(r.max)));
    return { ...s, reps: max, repsMin: r.min != null ? Math.round(r.min) : undefined };
  }
  const secs = (s: PrescribedSetDto, raw: string) => {
    const v = num(raw);
    return v && v >= 1 ? { ...s, durationSeconds: Math.round(v) } : s;
  };
  const rest = (s: PrescribedSetDto, raw: string) => ({ ...s, restSeconds: num(raw) ?? undefined });

  /** RPE text that didn't parse, by row ("all" or the set index): kept in the cell and marked, not silently dropped. */
  let badRpe = $state<Record<string, string>>({});
  function rpeInput(key: string, raw: string, apply: (fn: (s: PrescribedSetDto) => PrescribedSetDto) => void) {
    if (rpeIssue(raw)) {
      badRpe[key] = raw;
      return;
    }
    delete badRpe[key];
    apply((x) => withRpe(x, raw, mode));
  }
  // Switching between one row and per-set rows rebuilds the cells from the doc.
  $effect(() => {
    void split;
    badRpe = {};
  });
  const rowLabel = (key: string) => (key === "all" ? "" : `Set ${Number(key) + 1}: `);
  /** Plain messages under the table, one per bad cell. */
  const issues = $derived([
    ...Object.keys(badRpe).map((k) => `${rowLabel(k)}${rpeIssue(badRpe[k])}`),
    ...(split
      ? sets.flatMap((s, i) => (restIssue(s.restSeconds) ? [`Set ${i + 1}: ${restIssue(s.restSeconds)}`] : []))
      : restIssue(sets[0]?.restSeconds) ? [restIssue(sets[0]?.restSeconds)!] : []),
  ]);
  const rpeMessage = $derived(Object.keys(badRpe).length > 0 ? issues[0] : null);
  $effect(() => {
    oninvalid?.(rpeMessage);
    return () => oninvalid?.(null);
  });

  function pickExercise(ex: ExerciseDto) {
    exercise.exerciseId = ex.id;
    exercise.exerciseName = ex.name;
    if (!exercise.role) {
      const found = (session ?? []).findIndex((e) => e.id === exercise.id);
      const list = found === -1 ? [...(session ?? []), exercise] : session!;
      const at = found === -1 ? list.length - 1 : found;
      const slots = list.map((e, i) => (i === at ? { ...e, exerciseId: ex.id, exerciseName: ex.name } : e));
      exercise.role = suggestRoleIn(slots, at, catalog);
    }
  }
</script>

{#snippet effort(s: PrescribedSetDto, key: string, apply: (fn: (s: PrescribedSetDto) => PrescribedSetDto) => void)}
  {#if mode === "timed"}
    <td><InputCell figure width={6} step={5} min={1} max={3600} label="Seconds" value={String(s.durationSeconds ?? "")} oncommit={(v) => apply((x) => secs(x, fig(v)))} /></td>
  {:else}
    <td><InputCell figure width={6} label={mode === "max" ? "Minimum reps" : "Reps"} placeholder={mode === "max" ? "any" : ""} value={mode === "max" ? String(s.reps || "") : repsLabel(s)} oncommit={(v) => apply((x) => reps(x, v || "0"))} /></td>
  {/if}
  <td><InputCell figure width={6} placeholder="—" label="Load: {weightUnit()}, or % of 1RM like 75%" value={loadCell(s)} oncommit={(v) => apply((x) => withLoad(x, v))} /></td>
  <td><InputCell figure width={6} placeholder="—" label={mode === "max" ? "Stop at RPE" : "RPE, or a range like 7–8"} invalid={badRpe[key] != null} value={badRpe[key] ?? rpeCell(s, mode)} oncommit={(v) => rpeInput(key, v, apply)} /></td>
  {#if showMore}
    <td><InputCell figure width={6} step={0.5} min={0} max={10} placeholder="—" label="Reps in reserve" value={String(s.targetRir ?? "")} oncommit={(v) => apply((x) => withRir(x, fig(v)))} /></td>
    <td><InputCell width={8} maxlength={7} placeholder="3-1-1-0" label="Tempo: eccentric, pause, concentric, top" value={s.tempo ?? ""} oncommit={(v) => apply((x) => withTempo(x, v))} /></td>
  {/if}
  <td><InputCell figure width={6} step={15} min={0} max={600} placeholder="—" label="Rest seconds" invalid={restIssue(s.restSeconds) != null} value={String(s.restSeconds ?? "")} oncommit={(v) => apply((x) => rest(x, fig(v)))} /></td>
{/snippet}

<div class="exedit" class:inline={!onclose}>
  <div class="head">
    {#if tag}<GroupTag {tag} />{/if}
    <RolePicker value={exercise.role} onpick={(r) => (exercise.role = r)} />
    <ExercisePicker value={exercise.exerciseId} {catalog} onpick={pickExercise} {oncreate} />
    <div class="seg" role="radiogroup" aria-label="Set mode">
      {#each MODES as m (m.id)}
        <button
          type="button"
          role="radio"
          aria-checked={mode === m.id}
          class:on={mode === m.id}
          title={m.title}
          onclick={() => setAll((s) => withMode(s, m.id))}>{m.label}</button
        >
      {/each}
    </div>
  </div>

  <div class="tablewrap x-scroll">
  <table class="settable" class:one={!split}>
    <thead>
      <tr>
        <th class:l={split}>{split ? "Set" : "Sets"}</th>
        {#if split}<th class="l inset">Type</th>{/if}
        <th>{mode === "timed" ? "Seconds" : mode === "max" ? "Min reps" : "Reps"}</th>
        <th title="{weightUnit()}, or % of 1RM like 75%">Load</th>
        <th title={mode === "max" ? "End the set at this RPE" : "One value or a range like 7–8"}>{mode === "max" ? "Stop RPE" : "RPE"}</th>
        {#if showMore}<th title="Reps in reserve">RIR</th><th title="Eccentric, pause, concentric, top; X = explosive">Tempo</th>{/if}
        <th>Rest s</th>
        {#if split}<th><span class="sr">Remove</span></th>{/if}
      </tr>
    </thead>
    <tbody>
      {#if split}
        {#each sets as s, i (i)}
          <tr>
            <td class="l n">{s.setNumber}</td>
            <td class="l">
              <SelectCell label="Set {s.setNumber} type" options={TYPES} value={s.type} onchange={(t) => setOne(i, (x) => ({ ...x, type: t }))} />
            </td>
            {@render effort(s, String(i), (fn) => setOne(i, fn))}
            <td>
              <button type="button" class="x" aria-label="Remove set {s.setNumber}" disabled={sets.length <= 1 || grouped} title={grouped ? "Rounds are set on the group" : undefined} onclick={() => (exercise.prescribedSets = withSetCount(sets.filter((_, j) => j !== i), sets.length - 1))}>×</button>
            </td>
          </tr>
        {/each}
      {:else}
        <tr>
          {#if grouped}
            <td><span class="fixed" title="Rounds are set on the group">{sets.length}</span></td>
          {:else}
            <td><InputCell figure width={6} step={1} min={1} max={20} label="Number of sets" value={String(sets.length)} oncommit={(v) => (exercise.prescribedSets = withSetCount(sets, Number(fig(v))))} /></td>
          {/if}
          {@render effort(sets[0], "all", setAll)}
        </tr>
      {/if}
    </tbody>
  </table>
  </div>

  {#if issues.length > 0}
    <ul class="issues" role="alert">
      {#each issues as m (m)}<li>{m}</li>{/each}
    </ul>
  {/if}

  {#if percentNote}<p class="setsnote pct" role="status">{percentNote}</p>{/if}

  <p class="setsnote">
    {#if grouped}
      Rounds set on the group ·
    {/if}
    {#if split}
      {#if !grouped}<button type="button" class="link" disabled={sets.length >= 20} onclick={() => (exercise.prescribedSets = withSetCount(sets, sets.length + 1))}>+ Set</button> ·{/if}
      {#if uniform}<button type="button" class="link" onclick={() => (split = false)}>Edit as one row</button>
      {:else}<button type="button" class="link" onclick={() => { setAll((s) => ({ ...sets[0], setNumber: s.setNumber })); split = false; }}>Make all like set 1</button>{/if}
    {:else}
      {#if !grouped}{sets.length} identical {sets.length === 1 ? "set" : "sets"} ·{/if}
      <button type="button" class="link" onclick={() => (split = true)}>Set each one separately</button>
    {/if}
    {#if !showMore && mode !== "timed"}· <button type="button" class="link" onclick={() => (showMore = true)}>+ RIR, tempo</button>{/if}
  </p>

  <InputNote
    label="Cue for the client"
    hideLabel
    rows={1}
    maxRows={7}
    maxlength={1000}
    placeholder="Cue for the client, e.g. 2s pause at the bottom (optional)"
    value={exercise.notes ?? ""}
    oninput={(v) => (exercise.notes = v || undefined)}
  />

  <div class="foot">
    <button type="button" class="btn ghost small" disabled={!canMoveUp} onclick={onmoveup} aria-label="Move exercise up">↑ Up</button>
    <button type="button" class="btn ghost small" disabled={!canMoveDown} onclick={onmovedown} aria-label="Move exercise down">↓ Down</button>
    {#if grouped && onunlink}
      <button type="button" class="btn ghost small" onclick={onunlink} title="Take this exercise out of the superset">Unlink</button>
    {:else if !grouped && onlink}
      <button type="button" class="btn ghost small" onclick={onlink} title="Do this and the next exercise back to back, as rounds">Superset with next</button>
    {/if}
    {#if onblock}
      <button
        type="button"
        class="btn ghost small"
        onclick={onblock}
        title={block === "prep" ? "Count it: sets, balance and progress read main work" : "Warm-up or activation before the main work — never counted"}
      >{block === "prep" ? "Move to main work" : "Move to movement prep"}</button>
    {/if}
    <span class="grow"></span>
    <ConfirmButton label="Remove exercise" confirmLabel="Really remove?" variant="danger" class="ghost" small onconfirm={onremove} />
    {#if onclose}
      <button type="button" class="btn small" onclick={onclose}>Done</button>
    {/if}
  </div>
</div>

<style>
  .exedit {
    border: 1px solid var(--accent-line, var(--focus));
    border-radius: var(--radius);
    background: var(--surface);
    padding: 12px;
    margin: 0 -12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* inline: a ruled row inside its session, no box of its own */
  .exedit.inline { border: none; border-radius: 0; background: none; padding: 0; margin: 0; }
  .head { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .seg button {
    border: none;
    background: none;
    font: 500 12px var(--font-ui);
    color: var(--muted);
    padding: 4px 10px;
    cursor: pointer;
  }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.on { background: var(--well-2); color: var(--ink); font-weight: 600; }

  .tablewrap { position: relative; overflow-x: auto; margin: 0 -4px; }
  .settable { border-collapse: collapse; width: max-content; max-width: 100%; }
  /* right edge of a label = right edge of the digits below (cell padding 6 + border 1) */
  .settable th { font: 500 11.5px var(--font-ui); color: var(--muted); text-align: right; padding: 0 5px 4px 4px; }
  .settable th.l { padding-left: 4px; text-align: left; }
  .settable th.inset { padding-left: 5px; }
  .settable td { padding: 2px 4px; text-align: right; }
  .settable .l { text-align: left; }
  .n { color: var(--faint); font: 12px var(--font-mono); width: 28px; }
  .fixed { display: inline-block; box-sizing: border-box; width: 64px; padding: 4px 1px 4px 6px; text-align: right; font: 12.5px var(--font-mono); color: var(--muted); }
  .issues { margin: -6px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--bad); }
  .setsnote.pct { margin: -6px 0 0; font-variant-numeric: tabular-nums; }
  .x { border: none; background: none; color: var(--faint); cursor: pointer; font-size: 15px; padding: 0 4px; }
  .x:hover:not(:disabled) { color: var(--bad); }
  .x:disabled { opacity: 0.3; cursor: default; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  .setsnote { margin: -4px 0 0; font-size: 12px; color: var(--muted); }
  .link { border: none; background: none; padding: 0; font: inherit; color: var(--blue); cursor: pointer; }
  .link:hover:not(:disabled) { text-decoration: underline; }
  .link:disabled { color: var(--faint); cursor: default; }
  .foot { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin: -2px 0 -4px; }
  .foot > :global(.btn.ghost:first-child) { margin-left: -8px; }
  .grow { flex: 1; }
  /* Phone width (and inside a superset's box): one row of five-plus cells
     would clip Rest off the right edge, so the single-row prescription wraps
     into label-over-field rows of three. Per-set tables keep scrolling. */
  .tablewrap { container-type: inline-size; }
  @container (max-width: 380px) {
    .settable.one,
    .settable.one :is(thead, tbody, tr) { display: contents; }
    .settable.one { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 4px; width: 100%; }
    .settable.one th:nth-child(n + 4) { padding-top: 8px; }
    .settable.one td { padding-inline: 6px; }
    .settable.one td :global(input) { max-width: calc(100% + 12px); }
    /* label's right edge on the digits' (the cell's padding 6 + border 1) */
    .settable.one th { padding-right: 7px; }
    .settable.one th:nth-child(1) { grid-area: 1 / 1; }
    .settable.one td:nth-child(1) { grid-area: 2 / 1; }
    .settable.one th:nth-child(2) { grid-area: 1 / 2; }
    .settable.one td:nth-child(2) { grid-area: 2 / 2; }
    .settable.one th:nth-child(3) { grid-area: 1 / 3; }
    .settable.one td:nth-child(3) { grid-area: 2 / 3; }
    .settable.one th:nth-child(4) { grid-area: 3 / 1; }
    .settable.one td:nth-child(4) { grid-area: 4 / 1; }
    .settable.one th:nth-child(5) { grid-area: 3 / 2; }
    .settable.one td:nth-child(5) { grid-area: 4 / 2; }
    .settable.one th:nth-child(6) { grid-area: 3 / 3; }
    .settable.one td:nth-child(6) { grid-area: 4 / 3; }
    .settable.one th:nth-child(7) { grid-area: 5 / 1; }
    .settable.one td:nth-child(7) { grid-area: 6 / 1; }
  }
  @media (max-width: 600px) {
    .fixed { width: 46px; padding-left: 4px; }
    .exedit { margin: 0 -8px; padding: 10px; }
    .exedit.inline { margin: 0; padding: 0; }
  }
</style>
