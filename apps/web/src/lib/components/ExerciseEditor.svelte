<script lang="ts">
  import type { ExerciseDto, ExerciseInput, PrescribedSetDto, ProgramExerciseDto } from "$lib/api/types";
  import { EXERCISE_ROLES, EXERCISE_ROLE_INFO, type ExerciseRole } from "@pt/shared";
  import {
    isUniform,
    loadCell,
    parseRange,
    patchAll,
    repsLabel,
    rpeCell,
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
  import ExercisePicker from "./ExercisePicker.svelte";

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
  }: {
    exercise: ProgramExerciseDto;
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
  } = $props();

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
    if (oneRepMaxKg == null) return "No 1RM on file for this lift: add it in the client's Settings to see the kg.";
    return pcts.map((p) => `${p}% = ${resolveLoadKg({ percent1rm: p }, oneRepMaxKg)} kg`).join(" · ") + ` (1RM ${oneRepMaxKg} kg, rounded to 2.5)`;
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

  function pickExercise(ex: ExerciseDto) {
    exercise.exerciseId = ex.id;
    exercise.exerciseName = ex.name;
  }
</script>

{#snippet effort(s: PrescribedSetDto, apply: (fn: (s: PrescribedSetDto) => PrescribedSetDto) => void)}
  {#if mode === "timed"}
    <td><input class="input cell" type="number" min="1" max="3600" step="5" aria-label="Seconds" value={s.durationSeconds ?? ""} onchange={(e) => apply((x) => secs(x, e.currentTarget.value))} /></td>
  {:else}
    <td><input class="input cell" inputmode="numeric" aria-label={mode === "max" ? "Minimum reps" : "Reps"} placeholder={mode === "max" ? "any" : ""} value={mode === "max" ? (s.reps || "") : repsLabel(s)} onchange={(e) => apply((x) => reps(x, e.currentTarget.value || "0"))} /></td>
  {/if}
  <td><input class="input cell" inputmode="decimal" placeholder="—" aria-label="Load: kg, or % of 1RM like 75%" value={loadCell(s)} onchange={(e) => apply((x) => withLoad(x, e.currentTarget.value))} /></td>
  <td><input class="input cell" inputmode="decimal" placeholder="—" aria-label={mode === "max" ? "Stop at RPE" : "RPE, or a range like 7–8"} value={rpeCell(s, mode)} onchange={(e) => apply((x) => withRpe(x, e.currentTarget.value, mode))} /></td>
  {#if showMore}
    <td><input class="input cell" type="number" min="0" max="10" step="0.5" placeholder="—" aria-label="Reps in reserve" value={s.targetRir ?? ""} onchange={(e) => apply((x) => withRir(x, e.currentTarget.value))} /></td>
    <td><input class="input cell tempo" maxlength="7" placeholder="3-1-1-0" aria-label="Tempo: eccentric, pause, concentric, top" value={s.tempo ?? ""} onchange={(e) => apply((x) => withTempo(x, e.currentTarget.value))} /></td>
  {/if}
  <td><input class="input cell" type="number" min="0" max="600" step="15" placeholder="—" aria-label="Rest seconds" value={s.restSeconds ?? ""} onchange={(e) => apply((x) => rest(x, e.currentTarget.value))} /></td>
{/snippet}

<div class="exedit" class:inline={!onclose}>
  <div class="head">
    <span class="rolepick" class:unset={!exercise.role} class:primary={exercise.role === "primary"}>
      <select
        value={exercise.role ?? ""}
        onchange={(e) => {
          const v = e.currentTarget.value;
          exercise.role = EXERCISE_ROLES.includes(v as ExerciseRole) ? (v as ExerciseRole) : undefined;
        }}
        aria-label="Role"
        title={exercise.role ? EXERCISE_ROLE_INFO[exercise.role].description : "The slot this exercise fills in the session"}
      >
        <option value="">No role</option>
        {#each EXERCISE_ROLES as r (r)}
          <option value={r}>{EXERCISE_ROLE_INFO[r].name}</option>
        {/each}
      </select>
    </span>
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

  <div class="tablewrap">
  <table class="settable">
    <thead>
      <tr>
        <th class:l={split}>{split ? "Set" : "Sets"}</th>
        {#if split}<th class="l inset">Type</th>{/if}
        <th>{mode === "timed" ? "Seconds" : mode === "max" ? "Min reps" : "Reps"}</th>
        <th title="kg, or % of 1RM like 75%">Load</th>
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
              <select class="select cell type" value={s.type} aria-label="Set {s.setNumber} type" onchange={(e) => setOne(i, (x) => ({ ...x, type: e.currentTarget.value as PrescribedSetDto["type"] }))}>
                <option value="working">working</option>
                <option value="backoff">backoff</option>
              </select>
            </td>
            {@render effort(s, (fn) => setOne(i, fn))}
            <td>
              <button type="button" class="x" aria-label="Remove set {s.setNumber}" disabled={sets.length <= 1} onclick={() => (exercise.prescribedSets = withSetCount(sets.filter((_, j) => j !== i), sets.length - 1))}>×</button>
            </td>
          </tr>
        {/each}
      {:else}
        <tr>
          <td><input class="input cell" type="number" min="1" max="20" aria-label="Number of sets" value={sets.length} onchange={(e) => (exercise.prescribedSets = withSetCount(sets, Number(e.currentTarget.value)))} /></td>
          {@render effort(sets[0], setAll)}
        </tr>
      {/if}
    </tbody>
  </table>
  </div>

  {#if percentNote}<p class="setsnote pct" role="status">{percentNote}</p>{/if}

  <p class="setsnote">
    {#if split}
      <button type="button" class="link" disabled={sets.length >= 20} onclick={() => (exercise.prescribedSets = withSetCount(sets, sets.length + 1))}>+ Set</button>
      {#if uniform}· <button type="button" class="link" onclick={() => (split = false)}>Edit as one row</button>
      {:else}· <button type="button" class="link" onclick={() => { setAll((s) => ({ ...sets[0], setNumber: s.setNumber })); split = false; }}>Make all like set 1</button>{/if}
    {:else}
      {sets.length} identical {sets.length === 1 ? "set" : "sets"} ·
      <button type="button" class="link" onclick={() => (split = true)}>Set each one separately</button>
    {/if}
    {#if !showMore && mode !== "timed"}· <button type="button" class="link" onclick={() => (showMore = true)}>+ RIR, tempo</button>{/if}
  </p>

  <textarea
    class="textarea notes"
    rows="1"
    maxlength="1000"
    placeholder="Cue for the client, e.g. 2s pause at the bottom (optional)"
    aria-label="Cue for the client"
    value={exercise.notes ?? ""}
    oninput={(e) => (exercise.notes = e.currentTarget.value || undefined)}
  ></textarea>

  <div class="foot">
    <button type="button" class="btn ghost small" disabled={!canMoveUp} onclick={onmoveup} aria-label="Move exercise up">↑ Up</button>
    <button type="button" class="btn ghost small" disabled={!canMoveDown} onclick={onmovedown} aria-label="Move exercise down">↓ Down</button>
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
  /* role: a pill like RoleChip that opens — dashed while unset, ink for the primary lift */
  .rolepick { position: relative; display: inline-flex; flex: none; color: var(--muted); }
  .rolepick select {
    appearance: none;
    min-width: 96px;
    font: 500 12.5px/1 var(--font-ui);
    color: inherit;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 5px 26px 5px 11px;
    cursor: pointer;
    transition: border-color 120ms ease, background-color 120ms ease;
  }
  .rolepick select:hover { border-color: var(--line-strong); background: var(--surface); }
  .rolepick select:focus-visible { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
  .rolepick::after {
    content: "";
    position: absolute;
    right: 11px;
    top: 50%;
    width: 5px;
    height: 5px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-70%) rotate(45deg);
    pointer-events: none;
  }
  .rolepick.unset select { background: transparent; border-style: dashed; }
  .rolepick.primary { color: var(--ink); }
  .rolepick.primary select { border-color: var(--line-strong); }
  .rolepick option { color: var(--ink); }
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
  .settable th { font: 500 11.5px var(--font-ui); color: var(--muted); text-align: right; padding: 0 11px 4px 4px; }
  .settable th.l { padding-left: 4px; text-align: left; }
  .settable th.inset { padding-left: 11px; }
  .settable td { padding: 2px 4px; text-align: right; }
  .settable .l { text-align: left; }
  .n { color: var(--faint); font: 12px var(--font-mono); width: 28px; }
  .cell { width: 64px; padding: 4px 6px; text-align: right; font: 12.5px var(--font-mono); }
  /* no spinner gutter: digits sit flush right under their label (↑↓ keys still step) */
  .cell[type="number"] { appearance: textfield; -moz-appearance: textfield; }
  .cell::-webkit-inner-spin-button,
  .cell::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  .cell.type { width: auto; text-align: left; font-family: var(--font-ui); }
  .cell.tempo { width: 76px; }
  .setsnote.pct { margin: -6px 0 0; font-variant-numeric: tabular-nums; }
  .x { border: none; background: none; color: var(--faint); cursor: pointer; font-size: 15px; padding: 0 4px; }
  .x:hover:not(:disabled) { color: var(--bad); }
  .x:disabled { opacity: 0.3; cursor: default; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

  .setsnote { margin: -4px 0 0; font-size: 12px; color: var(--muted); }
  .link { border: none; background: none; padding: 0; font: inherit; color: var(--blue); cursor: pointer; }
  .link:hover:not(:disabled) { text-decoration: underline; }
  .link:disabled { color: var(--faint); cursor: default; }
  .notes { width: 100%; min-height: 32px; resize: vertical; font-size: 13px; field-sizing: content; max-height: 160px; }
  .foot { display: flex; gap: 4px; align-items: center; flex-wrap: wrap; margin: -2px 0 -4px; }
  .foot > :global(.btn.ghost:first-child) { margin-left: -8px; }
  .grow { flex: 1; }
  @media (max-width: 600px) {
    .cell { width: 46px; padding: 4px; }
    .cell.type { max-width: 84px; }
    .exedit { margin: 0 -8px; padding: 10px; }
    .exedit.inline { margin: 0; padding: 0; }
  }
</style>
