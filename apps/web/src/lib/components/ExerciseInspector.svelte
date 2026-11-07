<script lang="ts">
  import { untrack } from "svelte";
  import type { ExerciseDto } from "$lib/api/types";
  import {
    EQUIPMENT_OPTIONS,
    FUNCTIONAL_OPTIONS,
    MUSCLE_OPTIONS,
    PATTERN_OPTIONS,
    formFrom,
    patternName,
    removeAction,
    similarNames,
    validateForm,
    type ExerciseForm,
  } from "$lib/exerciseLibrary";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Side panel that creates or edits one exercise. Seed (WGER) entries lock
   * name, muscles and equipment. Save enables only after a change. Mount it
   * inside `{#key}` so each exercise starts from a fresh form.
   */
  interface Props {
    /** null = new exercise. */
    exercise: ExerciseDto | null;
    /** Prefill for a new exercise (from filters or the search box). */
    prefill?: Partial<ExerciseForm>;
    list: ExerciseDto[];
    onclose: () => void;
    onsave: (form: ExerciseForm) => Promise<void>;
    onremove: (e: ExerciseDto) => void;
    onrestore: (e: ExerciseDto) => void;
    ondelete: (e: ExerciseDto) => void;
    onduplicate: (e: ExerciseDto) => void;
    onopen: (id: string) => void;
  }

  let { exercise, prefill, list, onclose, onsave, onremove, onrestore, ondelete, onduplicate, onopen }: Props = $props();

  const initial = untrack(() => formFrom(exercise, prefill));
  let form = $state<ExerciseForm>(structuredClone(initial));
  let errors = $state<Partial<Record<keyof ExerciseForm, string>>>({});
  let saving = $state(false);
  let saveError = $state("");

  const locked = $derived(exercise !== null && !exercise.custom);
  const dirty = $derived(JSON.stringify(form) !== JSON.stringify(initial));
  const rm = $derived(exercise ? removeAction(exercise) : null);
  const dupes = $derived(locked ? { exact: null, similar: [] } : similarNames(list, form.name, exercise?.id));
  const prefilledFrom = untrack(() =>
    !exercise && (prefill?.movementPattern || prefill?.equipment)
      ? [prefill.movementPattern && patternName(prefill.movementPattern), EQUIPMENT_OPTIONS.find((o) => o.key === prefill.equipment)?.label]
          .filter(Boolean)
          .join(", ")
      : ""
  );

  function toggleSecondary(k: string) {
    const s = form.secondaryMuscleGroups;
    if (s.includes(k)) form.secondaryMuscleGroups = s.filter((x) => x !== k);
    else if (s.length < 4) form.secondaryMuscleGroups = [...s, k];
  }

  async function save(ev?: SubmitEvent) {
    ev?.preventDefault();
    if (exercise && !dirty) return;
    errors = validateForm(form, list, exercise?.id);
    if (Object.keys(errors).length) return;
    saving = true;
    saveError = "";
    try {
      await onsave($state.snapshot(form));
    } catch (err) {
      saveError = err instanceof Error ? err.message : "Couldn't save. Try again.";
    } finally {
      saving = false;
    }
  }

  let nameInput = $state<HTMLInputElement>();
  let patternSelect = $state<HTMLSelectElement>();
  $effect(() => {
    (exercise && locked ? patternSelect : nameInput)?.focus({ preventScroll: true });
  });
</script>

<aside class="panel insp" aria-label={exercise ? `Edit ${exercise.name}` : "New exercise"}>
  <div class="panel-head">
    <h2>{exercise ? exercise.name : "New exercise"}</h2>
    {#if exercise}<span class="src" class:mine={exercise.custom}>{exercise.custom ? "Mine" : "WGER"}</span>{/if}
    <button type="button" class="iconbtn" aria-label="Close" onclick={onclose}><Icon name="x" /></button>
  </div>

  <form class="body" novalidate onsubmit={save} id="exercise-form">
    {#if exercise}
      <div class="meta">
        <span>Used in <span class="fig">{exercise.usedIn}</span> program{exercise.usedIn === 1 ? "" : "s"}</span>
        <button type="button" class="linkbtn" onclick={() => onduplicate(exercise)}>Duplicate into my exercises</button>
      </div>
    {:else if prefilledFrom}
      <p class="ctx">Prefilled from your filters: {prefilledFrom}.</p>
    {/if}

    {#if locked}
      <p class="lockline">
        <Icon name="lock" />WGER library entry. You can tag its pattern and add a note. To change the name, muscles or equipment,
        duplicate it into your exercises.
      </p>
    {/if}

    <div class="f">
      <label class="label" for="xf-name">Name</label>
      <input
        bind:this={nameInput}
        class="input"
        id="xf-name"
        bind:value={form.name}
        maxlength="160"
        autocomplete="off"
        placeholder="e.g. Chest-Supported DB Row"
        disabled={locked}
        aria-invalid={Boolean(errors.name)}
      />
      {#if errors.name}<p class="err">{errors.name}</p>{/if}
      {#if dupes.similar.length && !errors.name}
        <div class="dupe">
          Already in the library:
          {#each dupes.similar as d, i (d.id)}{i ? ", " : " "}<button type="button" class="linkbtn" onclick={() => onopen(d.id)}
              >{d.name}</button
            >{/each}
        </div>
      {/if}
    </div>

    <div class="f">
      <label class="label" for="xf-primary">Primary muscle</label>
      <select
        class="select"
        id="xf-primary"
        bind:value={form.primaryMuscleGroup}
        disabled={locked}
        onchange={() => (form.secondaryMuscleGroups = form.secondaryMuscleGroups.filter((m) => m !== form.primaryMuscleGroup))}
      >
        <option value="" disabled>Choose…</option>
        {#each MUSCLE_OPTIONS as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
      </select>
      {#if errors.primaryMuscleGroup}<p class="err">{errors.primaryMuscleGroup}</p>{/if}
    </div>

    <div class="f">
      <span class="label">Secondary <span class="hint-inline">up to 4</span></span>
      <div class="chips">
        {#each MUSCLE_OPTIONS.filter((o) => o.key !== form.primaryMuscleGroup) as o (o.key)}
          {@const on = form.secondaryMuscleGroups.includes(o.key)}
          <button
            type="button"
            class="tchip"
            class:on
            aria-pressed={on}
            disabled={locked || (!on && form.secondaryMuscleGroups.length >= 4)}
            onclick={() => toggleSecondary(o.key)}>{o.label}</button
          >
        {/each}
      </div>
    </div>

    <div class="f">
      <span class="label" id="xf-eq">Equipment</span>
      <div class="chips" role="radiogroup" aria-labelledby="xf-eq">
        {#each EQUIPMENT_OPTIONS as o (o.key)}
          <button
            type="button"
            class="tchip"
            class:on={form.equipment === o.key}
            role="radio"
            aria-checked={form.equipment === o.key}
            disabled={locked}
            onclick={() => (form.equipment = o.key)}>{o.label}</button
          >
        {/each}
      </div>
      {#if errors.equipment}<p class="err">{errors.equipment}</p>{/if}
    </div>

    <div class="f">
      <label class="label" for="xf-pattern">Movement pattern</label>
      <select bind:this={patternSelect} class="select" id="xf-pattern" bind:value={form.movementPattern}>
        <option value="">Untagged</option>
        {#each PATTERN_OPTIONS as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
      </select>
    </div>

    <div class="f">
      <label class="label" for="xf-func">Functional movement</label>
      <select class="select" id="xf-func" bind:value={form.functionalMovement}>
        <option value="">Untagged</option>
        {#each FUNCTIONAL_OPTIONS as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
      </select>
    </div>

    <div class="f">
      <label class="label" for="xf-note">Coaching note <span class="hint-inline">shown in programs and to the AI</span></label>
      <textarea class="textarea" id="xf-note" bind:value={form.note} rows="2" maxlength="280" placeholder="Setup, cues, regressions…"
      ></textarea>
    </div>

    {#if exercise && rm}
      {#if exercise.archivedAt}
        <div class="rm">
          <p><b>{exercise.custom ? "Archived" : "Hidden"}</b>Out of pickers and AI drafts. Programs that use it keep it.</p>
          <button type="button" class="btn small" onclick={() => onrestore(exercise)}>{exercise.custom ? "Restore" : "Unhide"}</button>
          {#if exercise.custom && exercise.usedIn === 0}
            <button type="button" class="btn small danger" onclick={() => ondelete(exercise)}>Delete permanently</button>
          {/if}
        </div>
      {:else}
        <div class="rm">
          <p><b>{rm.label}</b>{rm.why}</p>
          <button type="button" class="btn small" class:danger={rm.kind === "delete"} onclick={() => onremove(exercise)}>{rm.label}</button>
        </div>
      {/if}
    {/if}
  </form>

  <div class="foot">
    <span class="dirty" role="status">{saveError || (exercise ? (dirty ? "Unsaved changes" : "No changes") : "")}</span>
    <button type="button" class="btn" onclick={onclose}>Cancel</button>
    <button type="submit" form="exercise-form" class="btn primary" disabled={saving || (exercise !== null && !dirty)}>
      {saving ? "Saving…" : exercise ? "Save" : "Create exercise"}
    </button>
  </div>
</aside>

<style>
  .insp { position: sticky; top: 16px; max-height: calc(100vh - 32px); display: flex; flex-direction: column; }
  .insp .panel-head { gap: 8px; }
  .insp h2 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
  .body { padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  .f { display: flex; flex-direction: column; min-width: 0; }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .tchip:disabled { opacity: 0.6; cursor: default; }
  .textarea { resize: vertical; font-family: var(--font-ui); }
  .err { margin-top: 4px; }
  .meta { display: flex; gap: 6px 14px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
  .ctx { margin: 0; font-size: 13px; color: var(--muted); }
  .fig { font: 500 12px var(--font-mono); font-variant-numeric: tabular-nums; }
  .hint-inline { font-weight: 400; color: var(--muted); font-size: 12px; margin-left: 4px; }
  .linkbtn { appearance: none; background: none; border: 0; padding: 0; font: inherit; color: var(--blue); cursor: pointer; }
  .linkbtn:hover { text-decoration: underline; }
  .src {
    font: 500 11px/1 var(--font-ui); padding: 2px 6px; border-radius: 99px; border: 1px solid var(--line);
    color: var(--muted); background: var(--surface);
  }
  .src.mine { color: var(--blue); border-color: #b6e3ff; background: #ddf4ff; }
  .iconbtn {
    appearance: none; width: 28px; height: 28px; display: inline-grid; place-items: center; border: 0; border-radius: 6px;
    background: none; color: var(--muted); cursor: pointer;
  }
  .iconbtn:hover { background: var(--well-2); color: var(--ink); }
  .dupe {
    margin-top: 6px; font-size: 13px; color: #4d3800; background: var(--warn-bg); border: 1px solid var(--warn-line);
    border-radius: 6px; padding: 6px 10px;
  }
  .lockline {
    display: flex; gap: 8px; align-items: flex-start; margin: 0; font-size: 13px; color: var(--muted);
    background: var(--well); border: 1px solid var(--line); border-radius: 6px; padding: 8px 12px;
  }
  .lockline :global(svg) { width: 14px; height: 14px; flex: none; margin-top: 3px; }
  .rm { border: 1px solid var(--line); border-radius: 6px; padding: 12px 14px; display: flex; gap: 8px 12px; align-items: center; flex-wrap: wrap; }
  .rm p { margin: 0; flex: 1 1 220px; font-size: 13px; color: var(--muted); }
  .rm b { color: var(--ink); font-weight: 600; display: block; font-size: 14px; }
  .foot {
    display: flex; gap: 8px; align-items: center; padding: 12px 16px; border-top: 1px solid var(--line);
    background: var(--surface); border-radius: 0 0 6px 6px;
  }
  .dirty { font-size: 12px; color: var(--muted); margin-right: auto; }

  @media (max-width: 1180px) {
    .insp {
      position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 100vw); max-height: none; z-index: 20;
      border-radius: 0; box-shadow: var(--shadow-overlay);
    }
  }
</style>
