<script lang="ts">
  import type { ExerciseDto, ProgramExerciseDto } from "$lib/api/types";
  import { EXERCISE_ROLES, EXERCISE_ROLE_INFO, type ExerciseRole, removeSet } from "@pt/shared";
  import SetRowEditor from "./SetRowEditor.svelte";

  let {
    exercise = $bindable(),
    catalog,
    canMoveUp,
    canMoveDown,
    onmoveup,
    onmovedown,
    onremove,
    onaddset,
  }: {
    exercise: ProgramExerciseDto;
    catalog: ExerciseDto[];
    canMoveUp: boolean;
    canMoveDown: boolean;
    onmoveup: () => void;
    onmovedown: () => void;
    onremove: () => void;
    onaddset: () => void;
  } = $props();

  function onExerciseSelect(exerciseId: string) {
    exercise.exerciseId = exerciseId;
    exercise.exerciseName = catalog.find((c) => c.id === exerciseId)?.name ?? exerciseId;
  }

  function onRoleSelect(raw: string) {
    exercise.role = EXERCISE_ROLES.includes(raw as ExerciseRole) ? (raw as ExerciseRole) : undefined;
  }
</script>

<div class="exblock">
  <div class="exhead">
    <div class="main-pickers">
      <select
        class="select exsel"
        value={exercise.exerciseId}
        onchange={(e) => onExerciseSelect(e.currentTarget.value)}
        aria-label="Select exercise"
      >
        {#each catalog as ex (ex.id)}
          <option value={ex.id}>{ex.name}</option>
        {/each}
      </select>

      <select
        class="select role"
        value={exercise.role ?? ""}
        onchange={(e) => onRoleSelect(e.currentTarget.value)}
        aria-label="Exercise role"
        title="Session slot for this exercise"
      >
        <option value="">Role…</option>
        {#each EXERCISE_ROLES as r (r)}
          <option value={r} title={EXERCISE_ROLE_INFO[r].description}>{EXERCISE_ROLE_INFO[r].label}</option>
        {/each}
      </select>
    </div>

    <input
      class="input exnotes"
      type="text"
      maxlength="1000"
      placeholder="Exercise notes (cues, pauses)…"
      aria-label="Exercise notes"
      value={exercise.notes ?? ""}
      oninput={(e) => {
        exercise.notes = e.currentTarget.value || undefined;
      }}
    />

    <div class="head-actions">
      <button
        type="button"
        class="btn ghost icon-btn"
        disabled={!canMoveUp}
        onclick={onmoveup}
        aria-label="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        class="btn ghost icon-btn"
        disabled={!canMoveDown}
        onclick={onmovedown}
        aria-label="Move down"
      >
        ↓
      </button>
      <button
        type="button"
        class="btn ghost small"
        disabled={exercise.prescribedSets.length >= 20}
        onclick={onaddset}
      >
        + Set
      </button>
      <button
        type="button"
        class="btn ghost small"
        onclick={onremove}
      >
        Remove
      </button>
    </div>
  </div>

  {#if exercise.prescribedSets.length === 0}
    <p class="subtle nosets">No sets yet — add a working set.</p>
  {:else}
    <div class="setrows">
      {#each exercise.prescribedSets as _, idx (idx)}
        <SetRowEditor
          bind:set={exercise.prescribedSets[idx]}
          onremove={() => {
            exercise = removeSet(exercise, idx);
          }}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .exblock {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 10px 12px;
    background: var(--surface);
  }
  .exhead {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }
  .main-pickers {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .exsel {
    min-width: 180px;
    font-weight: 600;
  }
  .role {
    width: auto;
  }
  .exnotes {
    flex: 1;
    min-width: 140px;
  }
  .head-actions {
    display: flex;
    gap: 4px;
    align-items: center;
    margin-left: auto;
  }
  .icon-btn {
    padding: 2px 6px;
    min-width: 24px;
    font-weight: bold;
  }
  .nosets {
    margin: 4px 0 0;
  }
  .setrows {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
</style>
