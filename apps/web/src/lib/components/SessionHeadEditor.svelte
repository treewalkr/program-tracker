<script lang="ts">
  import type { ProgramSessionDto } from "$lib/api/types";
  import { defaultCardio, switchSessionKind, type SessionKind } from "@pt/shared";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";

  /** Inline editor for a session's name, kind, notes and cardio prescription. */
  let {
    session = $bindable(),
    canMoveUp,
    canMoveDown,
    onmoveup,
    onmovedown,
    onremove,
    onclose,
  }: {
    session: ProgramSessionDto;
    canMoveUp: boolean;
    canMoveDown: boolean;
    onmoveup: () => void;
    onmovedown: () => void;
    onremove: () => void;
    onclose: () => void;
  } = $props();

  const num = (raw: string) => (raw.trim() === "" ? undefined : Number(raw));
  const cardio = () => (session.cardio ??= defaultCardio());
</script>

<div class="sessedit">
  <div class="row">
    <label class="f grow">
      <span>Session name</span>
      <input class="input" maxlength="160" bind:value={session.name} />
    </label>
    <label class="f">
      <span>Kind</span>
      <select class="select" value={session.kind} onchange={(e) => (session = switchSessionKind(session, e.currentTarget.value as SessionKind))}>
        <option value="lifting">Lifting</option>
        <option value="cardio">Cardio</option>
      </select>
    </label>
  </div>
  <label class="f">
    <span>Notes</span>
    <textarea class="textarea" rows="2" maxlength="2000" value={session.notes ?? ""} oninput={(e) => (session.notes = e.currentTarget.value || undefined)}></textarea>
  </label>

  {#if session.kind === "cardio"}
    <div class="row">
      <label class="f grow">
        <span>Modality</span>
        <input class="input" maxlength="80" placeholder="Bike, Run, Rower…" value={session.cardio?.modality ?? ""} oninput={(e) => (cardio().modality = e.currentTarget.value)} />
      </label>
      <label class="f">
        <span>Minutes</span>
        <input class="input num" type="number" min="1" max="300" value={session.cardio?.durationMin ?? ""} oninput={(e) => (cardio().durationMin = num(e.currentTarget.value) ?? null)} />
      </label>
      <label class="f">
        <span>HR zone</span>
        <input class="input num" type="number" min="1" max="5" value={session.cardio?.hrZone ?? ""} oninput={(e) => (cardio().hrZone = num(e.currentTarget.value) ?? null)} />
      </label>
      <label class="f">
        <span>km</span>
        <input class="input num" type="number" min="0" step="0.5" value={session.cardio?.distanceKm ?? ""} oninput={(e) => (cardio().distanceKm = num(e.currentTarget.value))} />
      </label>
      <label class="f">
        <span>RPE</span>
        <input class="input num" type="number" min="1" max="10" value={session.cardio?.targetRpe ?? ""} oninput={(e) => (cardio().targetRpe = num(e.currentTarget.value))} />
      </label>
      <label class="f grow">
        <span>Intensity</span>
        <input class="input" maxlength="60" placeholder="easy, 85% FTP…" value={session.cardio?.intensity ?? ""} oninput={(e) => (cardio().intensity = e.currentTarget.value)} />
      </label>
    </div>
  {/if}

  <div class="foot">
    <button type="button" class="btn ghost small" disabled={!canMoveUp} onclick={onmoveup}>↑ Up</button>
    <button type="button" class="btn ghost small" disabled={!canMoveDown} onclick={onmovedown}>↓ Down</button>
    <ConfirmButton label="Remove session" confirmLabel="Really remove?" variant="danger" small onconfirm={onremove} />
    <span class="grow"></span>
    <button type="button" class="btn small" onclick={onclose}>Done</button>
  </div>
</div>

<style>
  .sessedit {
    border: 1px solid var(--accent-line, var(--focus));
    border-radius: var(--radius);
    background: var(--surface);
    padding: 12px;
    margin: 0 -12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
  .f { display: flex; flex-direction: column; gap: 4px; font-size: 11.5px; color: var(--muted); }
  .f.grow { flex: 1; min-width: 160px; }
  .num { width: 72px; text-align: right; font-family: var(--font-mono); }
  .foot { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .grow { flex: 1; }
</style>
