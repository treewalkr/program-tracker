<script lang="ts">
  import type { CardioTemplateDto, CardioTemplateInput, CardioTemplatesDto, ModalityDto, ProgramSessionDto, SessionTypeDto, SessionTypeInput } from "$lib/api/types";
  import type { HrZone } from "@pt/shared";
  import CardioPrescriptionEditor from "./CardioPrescriptionEditor.svelte";
  import { defaultCardio, kindForType, switchSessionKind, type SessionKind } from "@pt/shared";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import SessionTypePicker from "./SessionTypePicker.svelte";

  /** Inline editor for a session's name, type (which sets its kind), notes and cardio prescription.
   *  Placement (day, order) lives on the week calendar, not here. */
  let {
    session = $bindable(),
    types,
    oncreatetype,
    ontype,
    nextSeqFor,
    onday,
    onremove,
    onclose,
    modalities = [],
    templates = null,
    zones = null,
    onsavetemplate,
  }: {
    session: ProgramSessionDto;
    /** Trainer's session types for the picker. */
    types: SessionTypeDto[];
    /** Saves a new type from the picker and returns it. */
    oncreatetype?: (input: SessionTypeInput) => Promise<SessionTypeDto>;
    /** After a type is picked (and the session updated) — e.g. to label the same session in other weeks. */
    ontype?: (type: SessionTypeDto) => void;
    /** Next free number on a kind's track, so a kind switch keeps keys unique. */
    nextSeqFor: (kind: SessionKind) => number;
    /** Move to a weekday (null = any day), appended to that day. Touch/keyboard fallback for the calendar. */
    onday: (weekday: number | null) => void;
    onremove: () => void;
    onclose: () => void;
    /** Cardio: the modality picker, the template chips, the member's bpm zones and "Save as template". */
    modalities?: ModalityDto[];
    templates?: CardioTemplatesDto | null;
    zones?: readonly HrZone[] | null;
    onsavetemplate?: (input: CardioTemplateInput) => Promise<CardioTemplateDto>;
  } = $props();

  const DAYS = ["Any day", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const cardio = () => (session.cardio ??= defaultCardio());
</script>

<div class="sessedit">
  <div class="row">
    <label class="f grow">
      <span>Session name</span>
      <input class="input" maxlength="160" bind:value={session.name} />
    </label>
    <div class="f">
      <span>Type</span>
      <SessionTypePicker
        value={session.typeId}
        format={session.kind}
        {types}
        onpick={(t) => {
          const kind = kindForType(t.format, session.kind);
          const switched = kind === session.kind ? session : switchSessionKind(session, kind, nextSeqFor(kind));
          session = { ...switched, typeId: t.id, typeName: t.name };
          ontype?.(t);
        }}
        oncreate={oncreatetype}
      />
    </div>
    <label class="f">
      <span>Day</span>
      <select class="select" value={String(session.weekday ?? 0)} onchange={(e) => onday(Number(e.currentTarget.value) || null)}>
        {#each DAYS as d, i (i)}<option value={String(i)}>{d}</option>{/each}
      </select>
    </label>
  </div>
  <label class="f">
    <span>Notes</span>
    <textarea class="textarea" rows="2" maxlength="2000" value={session.notes ?? ""} oninput={(e) => (session.notes = e.currentTarget.value || undefined)}></textarea>
  </label>

  {#if session.kind === "cardio"}
    <CardioPrescriptionEditor bind:cardio={() => cardio(), (v) => (session.cardio = v)} {modalities} {templates} {zones} {onsavetemplate} />
  {/if}

  <div class="foot">
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
  .foot { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .grow { flex: 1; }
</style>
