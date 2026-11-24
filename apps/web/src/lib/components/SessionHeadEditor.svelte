<script lang="ts">
  import type { CardioTemplateDto, CardioTemplateInput, CardioTemplatesDto, ModalityDto, ProgramSessionDto, SessionTypeDto, SessionTypeInput } from "$lib/api/types";
  import type { HrZone } from "@pt/shared";
  import CardioPrescriptionEditor from "./CardioPrescriptionEditor.svelte";
  import { defaultCardio, kindForType, switchSessionKind, type SessionKind } from "@pt/shared";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import SessionTypePicker from "./SessionTypePicker.svelte";
  import InputField from "$lib/ui/InputField.svelte";
  import InputNote from "$lib/ui/InputNote.svelte";
  import SelectField from "$lib/ui/SelectField.svelte";
  import type { SelectOption } from "$lib/ui/select/options";

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

  const DAYS: SelectOption[] = ["Any day", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label, i) => ({ value: String(i), label }));
  const cardio = () => (session.cardio ??= defaultCardio());
</script>

<div class="sessedit">
  <div class="row">
    <div class="grow-f">
      <InputField label="Session name" maxlength={160} bind:value={session.name} />
    </div>
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
    <SelectField label="Day" options={DAYS} value={String(session.weekday ?? 0)} onchange={(v) => onday(Number(v) || null)} />
  </div>
  <InputNote label="Notes" rows={2} maxlength={2000} value={session.notes ?? ""} oninput={(v) => (session.notes = v || undefined)} />

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
  .grow-f { flex: 1; min-width: 160px; }
  .foot { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .grow { flex: 1; }
</style>
