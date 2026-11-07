<script lang="ts">
  import type { ExerciseDto, ExerciseInput, PrescribedSetDto, ProgramExerciseDto } from "$lib/api/types";
  import { EXERCISE_ROLES, EXERCISE_ROLE_INFO, type ExerciseRole } from "@pt/shared";
  import {
    isUniform,
    parseRange,
    patchAll,
    repsLabel,
    setMode,
    withMode,
    withSetCount,
    type SetMode,
  } from "$lib/programEdit";
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
  }: {
    exercise: ProgramExerciseDto;
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
  const kg = (s: PrescribedSetDto, raw: string) => ({ ...s, targetWeightKg: num(raw) });
  const rpe = (s: PrescribedSetDto, raw: string) => ({ ...s, targetRpe: num(raw) ?? undefined });
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
  <td><input class="input cell" type="number" min="0" step="2.5" placeholder="—" aria-label="Load kg" value={s.targetWeightKg ?? ""} onchange={(e) => apply((x) => kg(x, e.currentTarget.value))} /></td>
  <td><input class="input cell" type="number" min="1" max="10" step="0.5" placeholder="—" aria-label="RPE" value={s.targetRpe ?? ""} onchange={(e) => apply((x) => rpe(x, e.currentTarget.value))} /></td>
  <td><input class="input cell" type="number" min="0" max="600" step="15" placeholder="—" aria-label="Rest seconds" value={s.restSeconds ?? ""} onchange={(e) => apply((x) => rest(x, e.currentTarget.value))} /></td>
{/snippet}

<div class="exedit" class:inline={!onclose}>
  <div class="head">
    <select
      class="select role"
      value={exercise.role ?? ""}
      onchange={(e) => {
        const v = e.currentTarget.value;
        exercise.role = EXERCISE_ROLES.includes(v as ExerciseRole) ? (v as ExerciseRole) : undefined;
      }}
      aria-label="Role"
    >
      <option value="">No role</option>
      {#each EXERCISE_ROLES as r (r)}
        <option value={r}>{EXERCISE_ROLE_INFO[r].label}</option>
      {/each}
    </select>
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
        <th>kg</th>
        <th>RPE</th>
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

  <p class="setsnote">
    {#if split}
      <button type="button" class="link" disabled={sets.length >= 20} onclick={() => (exercise.prescribedSets = withSetCount(sets, sets.length + 1))}>+ Set</button>
      {#if uniform}· <button type="button" class="link" onclick={() => (split = false)}>Edit as one row</button>
      {:else}· <button type="button" class="link" onclick={() => { setAll((s) => ({ ...sets[0], setNumber: s.setNumber })); split = false; }}>Make all like set 1</button>{/if}
    {:else}
      {sets.length} identical {sets.length === 1 ? "set" : "sets"} ·
      <button type="button" class="link" onclick={() => (split = true)}>Set each one separately</button>
    {/if}
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
  .role { width: auto; font-size: 12.5px; padding: 4px 8px; }
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
