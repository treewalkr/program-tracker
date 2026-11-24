<script lang="ts">
  import { untrack } from "svelte";
  import type { ExerciseDto } from "$lib/api/types";
  import {
    EQUIPMENT_OPTIONS,
    FUNCTIONAL_OPTIONS,
    MUSCLE_OPTIONS,
    formFrom,
    patternName,
    removeAction,
    similarNames,
    validateForm,
    type ExerciseForm,
  } from "$lib/exerciseLibrary";
  import Icon from "$lib/ui/Icon.svelte";
  import InputField from "$lib/ui/InputField.svelte";
  import InputNote from "$lib/ui/InputNote.svelte";
  import SelectCombobox from "$lib/ui/SelectCombobox.svelte";
  import SelectField from "$lib/ui/SelectField.svelte";
  import type { SelectOption } from "$lib/ui/select/options";
  import PatternChips from "./PatternChips.svelte";

  /**
   * Side panel that creates or edits one exercise. Library (seed) entries lock
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

  const muscleOptions: SelectOption[] = MUSCLE_OPTIONS.map((o) => ({ value: o.key, label: o.label }));
  const functionalOptions: SelectOption[] = [{ value: "", label: "Untagged" }, ...FUNCTIONAL_OPTIONS.map((o) => ({ value: o.key, label: o.label }))];

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
    !exercise && (prefill?.movementPatterns?.length || prefill?.equipment)
      ? [prefill.movementPatterns?.[0] && patternName(prefill.movementPatterns[0]), EQUIPMENT_OPTIONS.find((o) => o.key === prefill.equipment)?.label]
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
  let patternField = $state<HTMLElement>();
  $effect(() => {
    (exercise && locked ? patternField?.querySelector("button") : nameInput)?.focus({ preventScroll: true });
  });
</script>

<aside class="panel insp" aria-label={exercise ? `Edit ${exercise.name}` : "New exercise"}>
  <div class="panel-head">
    <h2>{exercise ? exercise.name : "New exercise"}</h2>
    {#if exercise}<span class="src" class:mine={exercise.custom}>{exercise.custom ? "Mine" : "Library"}</span>{/if}
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
        <Icon name="lock" />Library entry. You can tag its pattern and add a note. To change the name, muscles or equipment,
        duplicate it into your exercises.
      </p>
    {/if}

    <div class="f">
      <InputField
        label="Name"
        bind:value={form.name}
        bind:input={nameInput}
        maxlength={160}
        autocomplete="off"
        placeholder="e.g. Chest-Supported DB Row"
        disabled={locked}
        error={errors.name}
      />
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
      <span class="label">Primary muscle</span>
      <SelectCombobox
        label="Primary muscle"
        placeholder="Choose…"
        emptyText="No muscles match"
        options={muscleOptions}
        value={form.primaryMuscleGroup || undefined}
        disabled={locked}
        onchange={(m) => {
          form.primaryMuscleGroup = m;
          form.secondaryMuscleGroups = form.secondaryMuscleGroups.filter((x) => x !== m);
        }}
      />
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

    <div class="f" role="group" aria-labelledby="xf-pattern" aria-describedby="xf-pattern-hint" bind:this={patternField}>
      <span class="label" id="xf-pattern"
        >Movement patterns <span class="hint-inline"><span class="star-key" aria-hidden="true"><Icon name="star" /></span>primary drives balance and roles</span></span
      >
      <PatternChips bind:value={form.movementPatterns} />
      <p class="hint" id="xf-pattern-hint">Rotation here = trunk rotation as core work.</p>
    </div>

    <div class="f">
      <SelectField label="Functional movement" maxWidth="none" options={functionalOptions} bind:value={form.functionalMovement} describedby="xf-func-hint" />
      <p class="hint" id="xf-func-hint">Rotation here = the lift's rotational role (throws, chops).</p>
    </div>

    <div class="f">
      <InputNote label="Coaching note" hint="Shown in programs and to the AI" bind:value={form.note} rows={2} maxlength={280} placeholder="Setup, cues, regressions…" />
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
  .hint { margin: 6px 0 0; font-size: 12px; color: var(--muted); }
  .star-key :global(svg) { width: 11px; height: 11px; fill: currentColor; vertical-align: -1px; margin-right: 3px; }
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
  .src.mine { color: var(--blue); border-color: var(--blue-line); background: var(--pulse-now-bg); }
  .iconbtn {
    appearance: none; width: 28px; height: 28px; display: inline-grid; place-items: center; border: 0; border-radius: 6px;
    background: none; color: var(--muted); cursor: pointer;
  }
  .iconbtn:hover { background: var(--well-2); color: var(--ink); }
  .dupe {
    margin-top: 6px; font-size: 13px; color: var(--warn-ink); background: var(--warn-bg); border: 1px solid var(--warn-line);
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
