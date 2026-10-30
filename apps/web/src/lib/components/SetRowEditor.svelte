<script lang="ts">
  import type { PrescribedSetDto } from "$lib/api/types";
  import { setRepsRange, setAmrap, setTimed } from "@pt/shared";

  let {
    set = $bindable(),
    onremove,
  }: {
    set: PrescribedSetDto;
    onremove: () => void;
  } = $props();
</script>

<div class="setrow">
  <span class="setno">{set.setNumber}</span>

  <select class="select tiny" bind:value={set.type} aria-label="Set type">
    <option value="working">working</option>
    <option value="backoff">backoff</option>
  </select>

  <label class="mini" title="Lower bound of a rep range (e.g. 6–10)">
    <input
      class="input tnum"
      type="number"
      min="0"
      max="100"
      placeholder="–"
      aria-label="Rep range min"
      value={set.repsMin ?? ""}
      disabled={set.amrap || set.durationSeconds != null}
      oninput={(e) => {
        const val = e.currentTarget.value.trim();
        const minVal = val === "" ? null : Number(val);
        set = setRepsRange(set, isNaN(minVal as number) ? null : minVal, set.reps);
      }}
    />
  </label>

  <label class="mini" title="Reps target (or upper bound)">
    <input
      class="input tnum"
      type="number"
      min="1"
      max="100"
      aria-label="Reps"
      value={set.reps}
      disabled={set.amrap || set.durationSeconds != null}
      oninput={(e) => {
        const val = e.currentTarget.value.trim();
        const maxVal = Number(val);
        if (!isNaN(maxVal)) {
          set = setRepsRange(set, set.repsMin ?? null, maxVal);
        }
      }}
    /> reps
  </label>

  <label class="mini chk" title="To failure (AMRAP)">
    <input
      type="checkbox"
      checked={set.amrap}
      onchange={(e) => {
        set = setAmrap(set, e.currentTarget.checked);
      }}
    /> max
  </label>

  <label class="mini" title="Timed set in seconds (e.g. 60 = 1 min)">
    <input
      class="input tnum"
      type="number"
      min="1"
      max="3600"
      step="15"
      placeholder="sec"
      aria-label="Timed seconds"
      value={set.durationSeconds ?? ""}
      disabled={set.amrap}
      oninput={(e) => {
        const val = e.currentTarget.value.trim();
        const sec = val === "" ? null : Number(val);
        set = setTimed(set, isNaN(sec as number) ? null : sec);
      }}
    />
  </label>

  <label class="mini">
    <input
      class="input tnum"
      type="number"
      min="0"
      step="2.5"
      placeholder="—"
      aria-label="Target weight kg"
      value={set.targetWeightKg ?? ""}
      oninput={(e) => {
        const val = e.currentTarget.value.trim();
        set.targetWeightKg = val === "" ? null : Number(val);
      }}
    /> kg
  </label>

  <label class="mini">
    <input
      class="input tnum"
      type="number"
      min="1"
      max="10"
      step="0.5"
      placeholder="RPE"
      aria-label="Target RPE"
      value={set.targetRpe ?? ""}
      oninput={(e) => {
        const val = e.currentTarget.value.trim();
        set.targetRpe = val === "" ? undefined : Number(val);
      }}
    /> RPE
  </label>

  <label class="mini">
    <input
      class="input tnum"
      type="number"
      min="0"
      step="15"
      placeholder="rest"
      aria-label="Rest seconds"
      value={set.restSeconds ?? ""}
      oninput={(e) => {
        const val = e.currentTarget.value.trim();
        set.restSeconds = val === "" ? undefined : Number(val);
      }}
    /> s rest
  </label>

  <button type="button" class="setx" onclick={onremove} aria-label="Remove set">
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
  </button>
</div>

<style>
  .setrow {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .setno {
    width: 16px;
    text-align: right;
    color: var(--faint);
    font-family: var(--font-mono);
    font-size: 12px;
  }
  .select.tiny {
    width: auto;
    padding: 3px 6px;
    font-size: 12.5px;
  }
  .mini {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--muted);
  }
  .mini.chk {
    cursor: pointer;
  }
  .mini .input {
    width: 58px;
    padding: 3px 6px;
    text-align: right;
    font-family: var(--font-mono);
    font-size: 12.5px;
  }
  .setx {
    border: none;
    background: none;
    color: var(--faint);
    cursor: pointer;
    padding: 2px;
    display: inline-flex;
  }
  .setx svg {
    width: 12px;
    height: 12px;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    fill: none;
  }
  .setx:hover {
    color: var(--bad);
  }
</style>
