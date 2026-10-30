<script lang="ts">
  import type { ExerciseDto, ProgramSessionDto } from "$lib/api/types";
  import {
    addExercise,
    addSet,
    moveExercise,
    removeExercise,
    switchSessionKind,
    type SessionKind,
  } from "@pt/shared";
  import ExerciseBlockEditor from "./ExerciseBlockEditor.svelte";

  let {
    session = $bindable(),
    catalog,
    canMoveUp,
    canMoveDown,
    onmoveup,
    onmovedown,
    onremove,
  }: {
    session: ProgramSessionDto;
    catalog: ExerciseDto[];
    canMoveUp: boolean;
    canMoveDown: boolean;
    onmoveup: () => void;
    onmovedown: () => void;
    onremove: () => void;
  } = $props();

  function onKindChange(newKind: SessionKind) {
    session = switchSessionKind(session, newKind);
  }
</script>

<div class="session-editor">
  <div class="session-header">
    <input
      class="input sess-name"
      type="text"
      maxlength="160"
      placeholder="Session name…"
      aria-label="Session name"
      bind:value={session.name}
    />

    <select
      class="select kind-select"
      value={session.kind}
      onchange={(e) => onKindChange(e.currentTarget.value as SessionKind)}
      aria-label="Session kind"
    >
      <option value="lifting">Lifting</option>
      <option value="cardio">Cardio</option>
    </select>

    <input
      class="input sess-notes"
      type="text"
      maxlength="2000"
      placeholder="Session notes…"
      aria-label="Session notes"
      value={session.notes ?? ""}
      oninput={(e) => {
        session.notes = e.currentTarget.value || undefined;
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
        onclick={onremove}
      >
        Remove
      </button>
    </div>
  </div>

  {#if session.kind === "cardio"}
    <div class="cardio-edit-fields">
      <input
        class="input"
        placeholder="Modality (e.g. Bike, Run) *"
        value={session.cardio?.modality ?? ""}
        oninput={(ev) => {
          session.cardio = {
            ...(session.cardio ?? {
              modality: "",
              durationMin: null,
              hrZone: null,
              intensity: "",
              distanceKm: undefined,
              targetRpe: undefined,
            }),
            modality: ev.currentTarget.value,
          };
        }}
        maxlength="80"
        aria-label="Modality"
      />
      <div class="cardio-grid">
        <label class="mini">
          Duration
          <input
            class="input tnum"
            type="number"
            min="1"
            max="300"
            value={session.cardio?.durationMin ?? ""}
            oninput={(ev) => {
              if (session.cardio) session.cardio.durationMin = ev.currentTarget.value ? Number(ev.currentTarget.value) : null;
            }}
            placeholder="min"
          /> min
        </label>
        <label class="mini">
          Zone
          <input
            class="input tnum"
            type="number"
            min="1"
            max="5"
            value={session.cardio?.hrZone ?? ""}
            oninput={(ev) => {
              if (session.cardio) session.cardio.hrZone = ev.currentTarget.value ? Number(ev.currentTarget.value) : null;
            }}
            placeholder="1-5"
          />
        </label>
        <label class="mini">
          Intensity
          <input
            class="input"
            value={session.cardio?.intensity ?? ""}
            oninput={(ev) => {
              if (session.cardio) session.cardio.intensity = ev.currentTarget.value;
            }}
            placeholder="easy…"
            maxlength="60"
          />
        </label>
        <label class="mini">
          Distance
          <input
            class="input tnum"
            type="number"
            min="0"
            step="0.5"
            value={session.cardio?.distanceKm ?? ""}
            oninput={(ev) => {
              if (session.cardio) session.cardio.distanceKm = ev.currentTarget.value ? Number(ev.currentTarget.value) : undefined;
            }}
            placeholder="km"
          /> km
        </label>
        <label class="mini">
          RPE
          <input
            class="input tnum"
            type="number"
            min="1"
            max="10"
            value={session.cardio?.targetRpe ?? ""}
            oninput={(ev) => {
              if (session.cardio) session.cardio.targetRpe = ev.currentTarget.value ? Number(ev.currentTarget.value) : undefined;
            }}
            placeholder="1-10"
          />
        </label>
      </div>
    </div>
  {:else}
    <div class="exlist-edit">
      {#each session.exercises as _, ei (session.exercises[ei].id)}
        <ExerciseBlockEditor
          bind:exercise={session.exercises[ei]}
          {catalog}
          canMoveUp={ei > 0}
          canMoveDown={ei < session.exercises.length - 1}
          onmoveup={() => {
            session = moveExercise(session, ei, ei - 1);
          }}
          onmovedown={() => {
            session = moveExercise(session, ei, ei + 1);
          }}
          onremove={() => {
            session = removeExercise(session, ei);
          }}
          onaddset={() => {
            session.exercises[ei] = addSet(session.exercises[ei]);
          }}
        />
      {/each}
      <button
        type="button"
        class="btn ghost small add-ex"
        disabled={session.exercises.length >= 20}
        onclick={() => {
          const first = catalog[0];
          if (first) {
            session = addExercise(session, first.id, first.name);
          }
        }}
      >
        + Exercise
      </button>
    </div>
  {/if}
</div>

<style>
  .session-editor {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 12px;
    background: var(--surface);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .session-header {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .sess-name {
    font-weight: 600;
    min-width: 140px;
    max-width: 220px;
  }
  .kind-select {
    width: auto;
  }
  .sess-notes {
    flex: 1;
    min-width: 160px;
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
  .cardio-edit-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 4px 0;
  }
  .cardio-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .mini {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .mini .input {
    width: 58px;
    padding: 3px 6px;
    text-align: right;
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .exlist-edit {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .add-ex {
    align-self: flex-start;
  }
</style>
