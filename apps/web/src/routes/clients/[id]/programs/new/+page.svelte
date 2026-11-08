<script lang="ts">
  import { roleLabels } from "$lib/roleLabelStore.svelte";
  import { uuid } from "$lib/uuid";
  import { clearDraft, readDraft, writeDraft } from "$lib/localDraft";
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type {
    ClientDto,
    ExerciseDto,
    ExerciseInput,
    PeriodizationSchemeDto,
    PrescribedSetDto,
    SessionTypeDto,
    SessionTypeInput,
  } from "$lib/api/types";
  import {
    defaultCardio,
    oneRepMaxKg,
    placeSessions,
    sessionTag,
    sortExercisesByRole,
    stampWeeks,
    type ProgramSession,
    type WeekDirective,
    type WeekMetric,
    type WeekPlan,
  } from "@pt/shared";
  import { weekPlanLabel } from "$lib/format";
  import type { CustomWeekRow, DraftForm, SessionRow } from "$lib/programForm";
  import ExerciseEditor from "$lib/components/ExerciseEditor.svelte";
  import SessionTypePicker from "$lib/components/SessionTypePicker.svelte";
  import DirChip from "$lib/components/DirChip.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PasteImport from "$lib/components/PasteImport.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let catalog = $state<ExerciseDto[]>([]);
  /** New exercise from the picker: save to the library, keep the catalog in sync. */
  async function addToLibrary(input: ExerciseInput) {
    const created = await api.createExercise(input);
    catalog.push(created);
    return created;
  }

  let types = $state<SessionTypeDto[]>([]);
  /** New type from the picker: save it, keep every session's picker in sync. */
  async function addType(input: SessionTypeInput) {
    const created = await api.createSessionType(input);
    types.push(created);
    return created;
  }

  let name = $state("");
  let description = $state("");
  let plannedWeeks = $state(4);
  let phase = $state("accumulation");
  let nextPhase = $state("deload");
  let usePhasing = $state(true);
  let schemes = $state<PeriodizationSchemeDto[]>([]);
  let saving = $state(false);
  let error = $state<string | null>(null);
  /** Build by hand (the editor) or Paste notes (read a plain-text program into it). */
  let mode = $state<"hand" | "paste">("hand");
  let filledFrom = $state<string | null>(null);

  /** "Use this": the reviewed import becomes the form; the trainer finishes it here. */
  function useImport(form: DraftForm) {
    applyForm(form);
    mode = "hand";
    restoredAt = null;
    filledFrom = form.name;
    window.scrollTo({ top: 0 });
  }

  const newRow = (): SessionRow => ({
    key: uuid(),
    name: "",
    kind: "lifting",
    cardio: defaultCardio(),
    exercises: [],
  });

  let sessions = $state<SessionRow[]>([newRow()]);

  /** seq per kind in list order — "Session 1", "Session 2", "Cardio 1"… */
  const seqs = $derived.by(() => {
    const n = { lifting: 0, cardio: 0 };
    return sessions.map((s) => ++n[s.kind]);
  });

  /**
   * Days aren't picked here: sessions are spread over the client's training
   * days on save, and the trainer rearranges them on the program's calendar.
   */
  const placement = $derived.by(() => {
    const patternOf = (exId: string) => catalog.find((c) => c.id === exId)?.movementPattern ?? null;
    const draft = sessions.map((s, i) => ({
      id: s.key,
      name: s.name || "x",
      seq: seqs[i],
      order: 0,
      kind: s.kind,
      exercises: s.exercises.map((e, ei) => ({ id: e.id, exerciseId: e.exerciseId, order: ei, prescribedSets: [] })),
      cardio: null,
    })) as ProgramSession[];
    const placed = placeSessions(draft, client, patternOf);
    return new Map(placed.map((p) => [p.id, p.weekday ?? null]));
  });


  let schemeMode = $state<"saved" | "custom" | "none">("saved");
  let selectedSchemeId = $state<string>("");
  let customWeeks = $state<CustomWeekRow[]>([
    { directive: "base", metric: "", deltaPercent: null },
    { directive: "+volume", metric: "overall_volume", deltaPercent: 5 },
    { directive: "+intensity", metric: "intensity", deltaPercent: 2.5 },
    { directive: "transition", metric: "", deltaPercent: null },
  ]);
  let schemeName = $state("");

  // —— local draft: every field is kept on this device until Save ——————————
  const draftKey = $derived(`pt.draft.new-program.${id}`);
  /** Off until the page has loaded (and restored), and again once saved. */
  let autosave = $state(false);
  /** The form as loaded; matching it means there's nothing worth keeping. */
  let baseline = "";
  let restoredAt = $state<string | null>(null);
  let keptAt = $state<string | null>(null);
  let defaults: DraftForm | null = null;

  const formSnapshot = (): DraftForm =>
    $state.snapshot({
      name, description, plannedWeeks, phase, nextPhase, usePhasing,
      schemeMode, selectedSchemeId, customWeeks, schemeName, sessions,
    });

  function applyForm(f: DraftForm) {
    name = f.name;
    description = f.description;
    plannedWeeks = f.plannedWeeks;
    phase = f.phase;
    nextPhase = f.nextPhase;
    usePhasing = f.usePhasing;
    schemeName = f.schemeName;
    customWeeks = f.customWeeks;
    sessions = f.sessions.length > 0 ? f.sessions : [newRow()];
    if (f.schemeMode === "saved" && !schemes.some((x) => x.id === f.selectedSchemeId)) {
      schemeMode = schemes.length > 0 ? "saved" : "none";
      selectedSchemeId = schemes[0]?.id ?? "";
    } else {
      schemeMode = f.schemeMode;
      selectedSchemeId = f.selectedSchemeId;
    }
  }

  function persist() {
    if (!autosave) return;
    const form = formSnapshot();
    const json = JSON.stringify(form);
    if (json === baseline && !restoredAt) {
      clearDraft(draftKey);
      keptAt = null;
    } else {
      keptAt = writeDraft(draftKey, form);
    }
  }

  let persistTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!autosave) return;
    JSON.stringify(formSnapshot()); // track every field, deeply
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, 400);
    return () => clearTimeout(persistTimer);
  });

  /** Throw the kept draft away and go back to a blank program. */
  function startOver() {
    clearDraft(draftKey);
    if (defaults) applyForm(structuredClone(defaults));
    sessions = [newRow()];
    restoredAt = null;
    keptAt = null;
    baseline = JSON.stringify(formSnapshot());
  }

  const clock = (iso: string) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return d.toLocaleString(undefined, sameDay ? { hour: "numeric", minute: "2-digit" } : { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };
  let savingScheme = $state(false);
  const DIRECTIVES: WeekDirective[] = ["base", "+volume", "+intensity", "deload", "transition", "test"];
  const METRICS: { value: WeekMetric; label: string }[] = [
    { value: "overall_volume", label: "Overall vol" },
    { value: "rep_volume", label: "Rep vol" },
    { value: "intensity", label: "Intensity" },
  ];

  const activeWeekPlans = $derived.by<WeekPlan[]>(() => {
    if (schemeMode === "custom") {
      return customWeeks.map((cw, i) => ({
        week: i + 1,
        directive: cw.directive,
        target: cw.metric ? { metric: cw.metric, deltaPercent: Number(cw.deltaPercent ?? 0) } : undefined,
      }));
    }
    if (schemeMode === "saved" && selectedScheme) {
      return selectedScheme.weeks;
    }
    return [];
  });

  const selectedScheme = $derived(
    schemeMode === "saved" ? (schemes.find((s) => s.id === selectedSchemeId) ?? null) : null
  );

  $effect(() => {
    if (activeWeekPlans.length > 0) {
      plannedWeeks = activeWeekPlans.length;
    }
  });

  function onSchemeSelect(value: string) {
    if (value === "custom" || value === "none") {
      schemeMode = value;
    } else {
      schemeMode = "saved";
      selectedSchemeId = value;
    }
  }

  async function saveScheme() {
    if (!schemeName.trim() || customWeeks.length < 2 || savingScheme) return;
    savingScheme = true;
    try {
      const created = await api.createScheme({
        name: schemeName.trim(),
        weeks: activeWeekPlans,
      });
      schemes = await api.schemes();
      schemeMode = "saved";
      selectedSchemeId = created.id;
      schemeName = "";
    } finally {
      savingScheme = false;
    }
  }

  async function removeScheme() {
    if (!selectedScheme) return;
    const gone = selectedScheme.id;
    await api.deleteScheme(gone);
    schemes = schemes.filter((s) => s.id !== gone);
    if (schemes.length > 0) selectedSchemeId = schemes[0].id;
    else schemeMode = "none";
  }

  /** Session label as the trainer sees it: their name, else the track tag. */
  const labelOf = (s: SessionRow, i: number) => s.name.trim() || sessionTag({ kind: s.kind, seq: seqs[i] });

  /** First thing standing between the trainer and Save — shown beside the disabled button. */
  const blocker = $derived.by<string | null>(() => {
    if (name.trim() === "") return "Name the program to save it.";
    for (const [i, s] of sessions.entries()) {
      if (s.kind === "lifting" && s.exercises.length === 0) return `${labelOf(s, i)} needs an exercise.`;
      if (s.kind === "cardio" && !s.cardio.modality.trim()) return `${labelOf(s, i)} needs a modality.`;
    }
    return null;
  });

  const MAX_SESSIONS = 14;

  function addSession() {
    if (sessions.length < MAX_SESSIONS) sessions.push(newRow());
  }

  function removeSession(key: string) {
    sessions = sessions.filter((s) => s.key !== key);
  }

  const newSet = (setNumber: number): PrescribedSetDto => ({
    setNumber,
    type: "working",
    reps: 8,
    amrap: false,
    targetWeightKg: null,
    targetRpe: 8,
    restSeconds: 150,
  });

  /** New exercises start as 3 identical working sets — the editor's one-row mode. */
  function addExercise(s: SessionRow) {
    const ex = catalog.find((c) => !c.archivedAt);
    s.exercises.push({
      id: uuid(),
      exerciseId: ex?.id ?? "",
      exerciseName: ex?.name,
      order: s.exercises.length,
      prescribedSets: [1, 2, 3].map(newSet),
    });
  }

  function moveExercise(s: SessionRow, from: number, to: number) {
    const [ex] = s.exercises.splice(from, 1);
    s.exercises.splice(to, 0, ex);
  }

  function toTemplateSessions(): ProgramSession[] {
    const used = new Map<number, number>();
    return sessions.map((s, si) => {
      const seq = seqs[si];
      const weekday = placement.get(s.key) ?? null;
      const order = used.get(weekday ?? 0) ?? 0;
      used.set(weekday ?? 0, order + 1);
      const type = types.find((t) => t.id === s.typeId && t.format === s.kind);
      const typed = type ? { typeId: type.id, typeName: type.name } : {};
      let session: ProgramSession;
      if (s.kind === "cardio") {
        session = {
          id: uuid(),
          name: s.name.trim() || `Cardio ${seq}`,
          seq,
          weekday,
          order,
          kind: "cardio",
          ...typed,
          exercises: [],
          cardio: {
            modality: s.cardio.modality.trim() || "Cardio",
            durationMin: s.cardio.durationMin != null && s.cardio.durationMin > 0 ? Number(s.cardio.durationMin) : null,
            hrZone: s.cardio.hrZone != null && s.cardio.hrZone >= 1 && s.cardio.hrZone <= 5 ? Number(s.cardio.hrZone) : null,
            intensity: s.cardio.intensity?.trim() || undefined,
            distanceKm: s.cardio.distanceKm != null && s.cardio.distanceKm > 0 ? Number(s.cardio.distanceKm) : undefined,
            targetRpe: s.cardio.targetRpe != null && s.cardio.targetRpe >= 1 ? Number(s.cardio.targetRpe) : undefined,
          },
        };
      } else {
        session = {
          id: uuid(),
          name: s.name.trim() || `Session ${seq}`,
          seq,
          weekday,
          order,
          kind: "lifting",
          ...typed,
          cardio: null,
          exercises: sortExercisesByRole($state.snapshot(s.exercises), roleLabels.all).map((e, ei) => ({
            ...e,
            id: uuid(),
            exerciseName: catalog.find((c) => c.id === e.exerciseId)?.name ?? e.exerciseName,
            order: ei,
          })),
        };
      }
      return session;
    });
  }

  async function save() {
    saving = true;
    error = null;
    try {
      const numWeeks = Number(plannedWeeks) || 4;
      const weeks = stampWeeks(toTemplateSessions(), numWeeks);

      const program = await api.createProgram({
        clientId: id,
        name: name.trim(),
        description: description.trim() || null,
        weeks,
        phasing: usePhasing
          ? {
              plannedWeeks: numWeeks,
              phase: phase.trim() || "block",
              nextPhase: nextPhase.trim() || null,
              weeks: activeWeekPlans.length > 0 ? activeWeekPlans : undefined,
            }
          : null,
      });
      autosave = false;
      clearTimeout(persistTimer);
      clearDraft(draftKey);
      await goto(`/programs/${program.id}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }

  onMount(async () => {
    const detail = await api.client(id);
    client = detail.client;
    [catalog, schemes, types] = await Promise.all([api.exercises(), api.schemes(), api.sessionTypes()]);
    if (schemes.length > 0) {
      schemeMode = "saved";
      selectedSchemeId = schemes[0].id;
    } else {
      schemeMode = "none";
    }
    await tick(); // let derived fields (scheme weeks → plannedWeeks) settle first
    defaults = formSnapshot();
    // an import still being read (or waiting for review) reopens Paste notes
    if (readDraft<{ importId: string | null }>(`pt.draft.paste-import.${id}`)?.data.importId) mode = "paste";
    const kept = readDraft<DraftForm>(draftKey);
    if (kept) {
      applyForm(kept.data);
      restoredAt = kept.savedAt;
    }
    await tick();
    baseline = JSON.stringify(formSnapshot());
    autosave = true;
  });
</script>

<svelte:head><title>New program · Program Tracker</title></svelte:head>
<svelte:window
  onpagehide={persist}
  onvisibilitychange={() => {
    if (document.visibilityState === "hidden") persist();
  }}
/>

{#if client === null}
  <Skeleton h="140px" />
{:else}
  <PageHead
    title={mode === "paste" ? "Draft a program from your notes" : "Write a program by hand"}
    sub={mode === "paste"
      ? "Paste a plan you already wrote. Review what was read, then finish it in the editor."
      : "Saved as a draft. Nothing goes live until you activate it."}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: "New program" }]}
  >
    {#snippet actions()}
      {#if mode === "hand"}
      {#if blocker && !saving}<span class="blocker" id="np-blocker">{blocker}</span>{/if}
      <Button
        variant="primary"
        onclick={save}
        disabled={saving || blocker !== null}
        aria-describedby={blocker ? "np-blocker" : undefined}
      >
        {saving ? "Saving…" : "Save as draft"}
      </Button>
      {/if}
    {/snippet}
  </PageHead>

  <div class="mode">
    <Tabs
      label="How to write it"
      idPrefix="np-mode"
      value={mode}
      onchange={(m) => (mode = m as "hand" | "paste")}
      items={[
        { id: "hand", label: "Build by hand" },
        { id: "paste", label: "Paste notes" },
      ]}
    />
  </div>

  {#if mode === "paste"}
  <div role="tabpanel" id="panel-paste" aria-labelledby="np-mode-paste">
    <PasteImport clientId={id} {catalog} trainingDays={client.trainingDays ?? null} base={formSnapshot} oncreate={addToLibrary} onuse={useImport} />
  </div>
  {:else}
  <div role="tabpanel" id="panel-hand" aria-labelledby="np-mode-hand">
  {#if filledFrom}
    <Note tone="ok" role="status" class="filled">
      Filled from your notes — {filledFrom}. Check the sets and exercises, then save it as a draft.
    </Note>
  {/if}

  {#if error}<p class="error save-error" role="alert">{error}</p>{/if}

  {#if restoredAt}
    <div class="kept restored" role="status">
      <Icon name="check" />
      <span>Picked up where you left off — unsaved work from <span class="num">{clock(restoredAt)}</span>.</span>
      <ConfirmButton label="Start over" confirmLabel="Discard it?" variant="danger" class="ghost" small onconfirm={startOver} />
    </div>
  {:else if keptAt}
    <p class="kept" role="status">Kept on this device as you type · <span class="num">{clock(keptAt)}</span></p>
  {/if}

  <div class="cols">
    <Panel title="Basics">
      <div class="panel-body basics-body">
        <div class="stack ident">
          <Field label="Name" htmlFor="np-name">
            <input class="input" id="np-name" placeholder="e.g. Strength Base B" bind:value={name} maxlength="120" />
          </Field>
          <Field label="Description" hint="optional" htmlFor="np-desc">
            <input class="input" id="np-desc" placeholder="Focus, notes to self…" bind:value={description} maxlength="300" />
          </Field>
        </div>

        <div class="phasing">
          <label class="check">
            <input type="checkbox" bind:checked={usePhasing} />
            <span>
              <span class="check-title">Periodization plan</span>
              <span class="subtle">Week directives and phase-change reminders.</span>
            </span>
          </label>

          {#if usePhasing}
            <div class="stack plan">
              <div class="plan-scheme">
                <Field label="Progression scheme" htmlFor="np-scheme">
                  <select
                    class="select"
                    id="np-scheme"
                    value={schemeMode === "saved" ? selectedSchemeId : schemeMode}
                    onchange={(e) => onSchemeSelect(e.currentTarget.value)}
                  >
                    {#each schemes as s (s.id)}
                      <option value={s.id}>{s.name}</option>
                    {/each}
                    <option value="custom">Custom — set each week</option>
                    <option value="none">None — no week directives</option>
                  </select>
                </Field>

                {#if schemeMode === "saved" && selectedScheme}
                  <div class="scheme-chips">
                    {#each selectedScheme.weeks as w (w.week)}
                      <DirChip directive={w.directive}>{weekPlanLabel(w)}</DirChip>
                    {/each}
                  </div>
                  <div class="scheme-meta">
                    <span class="subtle nowrap" title="Block length comes from the scheme"><span class="num">{activeWeekPlans.length}</span>-week block</span>
                    <ConfirmButton
                      label="Delete scheme"
                      confirmLabel="Really delete?"
                      variant="danger"
                      class="ghost"
                      small
                      onconfirm={removeScheme}
                    />
                  </div>
                {:else if schemeMode === "custom"}
                  <div class="week-rows">
                    {#each customWeeks as w, i (i)}
                      <div class="week-row">
                        <span class="wk">W{i + 1}</span>
                        <select class="select tiny" bind:value={w.directive} aria-label="Week {i + 1} directive">
                          {#each DIRECTIVES as opt (opt)}
                            <option value={opt}>{opt}</option>
                          {/each}
                        </select>
                        <select class="select tiny" bind:value={w.metric} aria-label="Week {i + 1} target">
                          <option value="">No target</option>
                          {#each METRICS as m (m.value)}
                            <option value={m.value}>{m.label}</option>
                          {/each}
                        </select>
                        {#if w.metric !== ""}
                          <input
                            class="input tiny-num"
                            type="number"
                            min="-100"
                            max="200"
                            placeholder="±%"
                            aria-label="Week {i + 1} change, percent"
                            bind:value={w.deltaPercent}
                          />
                        {/if}
                        <Button
                          variant="ghost"
                          small
                          disabled={customWeeks.length <= 2}
                          onclick={() => (customWeeks = customWeeks.filter((_, j) => j !== i))}
                          aria-label="Remove week {i + 1}"
                        >{#snippet icon()}<Icon name="x" />{/snippet}</Button>
                      </div>
                    {/each}
                    <Button
                      variant="ghost"
                      small
                      class="self-start"
                      onclick={() => customWeeks.push({ directive: "+volume", metric: "overall_volume", deltaPercent: 5 })}
                    >+ Add week</Button>
                    <div class="save-row">
                      <input class="input" placeholder="Scheme name, e.g. 5-week peak" aria-label="Scheme name" bind:value={schemeName} />
                      <Button
                        small
                        disabled={savingScheme || !schemeName.trim() || customWeeks.length < 2}
                        onclick={saveScheme}
                      >{savingScheme ? "Saving…" : "Save scheme"}</Button>
                    </div>
                  </div>
                {/if}
              </div>

              <div class="stack plan-side">
              {#if activeWeekPlans.length === 0}
                <Field label="Block length" htmlFor="np-weeks">
                  <select class="select" id="np-weeks" bind:value={plannedWeeks}>
                    {#each [3, 4, 5, 6, 8] as w (w)}<option value={w}>{w} weeks</option>{/each}
                  </select>
                </Field>
              {/if}

              <div class="pair">
                <Field label="This phase" htmlFor="np-phase">
                  <input class="input" id="np-phase" bind:value={phase} maxlength="40" />
                </Field>
                <Field label="Next phase" htmlFor="np-next">
                  <input class="input" id="np-next" bind:value={nextPhase} maxlength="40" />
                </Field>
              </div>
              </div>
            </div>
          {/if}
        </div>
      </div>
    </Panel>

    <div class="builder-col">
      {#each sessions as s, si (s.key)}
        {@const tag = sessionTag({ kind: s.kind, seq: seqs[si] })}
        <section class="panel" aria-label={labelOf(s, si)}>
          <div class="panel-head sess-head">
            <span class="track" class:cardio={s.kind === "cardio"}>{tag}</span>
            <input
              class="sess-name"
              bind:value={s.name}
              placeholder="Add a name"
              maxlength="60"
              aria-label="{tag} name"
            />
            <SessionTypePicker
              small
              value={s.typeId}
              format={s.kind}
              {types}
              label="{tag} type"
              onpick={(t) => {
                s.typeId = t.id;
                s.kind = t.format;
              }}
              oncreate={addType}
            />
            {#if sessions.length > 1}
              <ConfirmButton
                label="Remove"
                confirmLabel="Remove {tag}?"
                variant="danger"
                class="ghost"
                small
                onconfirm={() => removeSession(s.key)}
              />
            {/if}
          </div>

          <div class="panel-body sess-body">

            {#if s.kind === "cardio"}
              <div class="cardio">
                <label class="f grow">
                  <span>Modality</span>
                  <input class="input" placeholder="Bike, Run, Rower…" bind:value={s.cardio.modality} maxlength="80" />
                </label>
                <label class="f">
                  <span>Minutes</span>
                  <input class="input num" type="number" min="1" max="300" bind:value={s.cardio.durationMin} />
                </label>
                <label class="f">
                  <span>HR zone</span>
                  <input class="input num" type="number" min="1" max="5" bind:value={s.cardio.hrZone} />
                </label>
                <label class="f">
                  <span>km</span>
                  <input class="input num" type="number" min="0" step="0.5" placeholder="—" bind:value={s.cardio.distanceKm} />
                </label>
                <label class="f">
                  <span>RPE</span>
                  <input class="input num" type="number" min="1" max="10" placeholder="—" bind:value={s.cardio.targetRpe} />
                </label>
                <label class="f grow">
                  <span>Intensity</span>
                  <input class="input" placeholder="easy, 85% FTP…" bind:value={s.cardio.intensity} maxlength="60" />
                </label>
              </div>
            {:else if s.exercises.length === 0}
              <EmptyState>
                No exercises yet.
                {#snippet actions()}
                  <Button small onclick={() => addExercise(s)}>+ Add exercise</Button>
                {/snippet}
              </EmptyState>
            {:else}
              <div class="exlist">
                {#each s.exercises as e, ei (e.id)}
                  <ExerciseEditor
                    bind:exercise={s.exercises[ei]}
                    session={s.exercises}
                    {catalog}
                    oneRepMaxKg={oneRepMaxKg(client.oneRepMaxes, e.exerciseId)}
                    oncreate={addToLibrary}
                    canMoveUp={ei > 0}
                    canMoveDown={ei < s.exercises.length - 1}
                    onmoveup={() => moveExercise(s, ei, ei - 1)}
                    onmovedown={() => moveExercise(s, ei, ei + 1)}
                    onremove={() => s.exercises.splice(ei, 1)}
                  />
                {/each}
                <Button small class="self-start" onclick={() => addExercise(s)}>+ Add exercise</Button>
              </div>
            {/if}
          </div>
        </section>
      {/each}

      <div class="builder-foot">
        <Button onclick={addSession} disabled={sessions.length >= MAX_SESSIONS}>+ Add session</Button>
        {#if sessions.length >= MAX_SESSIONS}<span class="subtle">{MAX_SESSIONS} sessions is the weekly limit.</span>{/if}
      </div>
      <p class="subtle hint">
        {#if client.trainingDays?.length}
          Sessions land on {client.name.split(" ")[0]}'s training days. Rearrange them on the calendar after saving.
        {:else}
          Sessions start unscheduled. Place them on the calendar after saving.
        {/if}
      </p>
      <p class="subtle hint">
        Prefer help? <a href={`/clients/${id}/generate`}>Generate with AI</a> instead.
      </p>
    </div>
  </div>
  </div>
  {/if}
{/if}

<style>
  .cols { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap: 16px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .stack :global(.label) { margin-bottom: 6px; }

  .blocker { font-size: 13px; color: var(--muted); }
  .mode { margin: -6px 0 16px; }
  .mode :global(.tabs) { margin: 0; }
  :global(.filled) { margin: 0 0 16px; }
  .save-error { margin: -8px 0 16px; }
  .kept { margin: -8px 0 16px; font-size: 12px; color: var(--muted); }
  .kept.restored {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 6px 6px 12px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--well);
    font-size: 13px;
    color: var(--ink);
  }
  .kept.restored > :global(svg) { width: 14px; height: 14px; flex: none; color: var(--good); }
  .kept.restored > span { flex: 1; min-width: 0; }

  /* —— basics —— */
  .basics-body { display: flex; flex-direction: column; gap: 14px; }
  .phasing { border-top: 1px solid var(--line-soft); padding-top: 14px; display: flex; flex-direction: column; gap: 14px; }
  .check { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; }
  .check input { margin-top: 3px; }
  .check > span { display: flex; flex-direction: column; gap: 2px; }
  .check-title { font: 500 14px var(--font-ui); color: var(--ink); }
  .scheme-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
  .scheme-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 8px; margin-top: 6px; }
  .nowrap { white-space: nowrap; }
  .scheme-meta .num { font-family: var(--font-mono); color: var(--ink); }
  .week-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
  .week-row { display: flex; align-items: center; gap: 6px; }
  .week-row .select { flex: 1; min-width: 0; }
  .tiny-num { width: 60px; padding: 3px 6px; text-align: right; font-family: var(--font-mono); font-size: 12.5px; }
  .wk { font: 500 12px var(--font-mono); width: 24px; color: var(--muted); }
  .save-row { display: flex; gap: 8px; align-items: center; }
  .save-row .input { flex: 1; min-width: 0; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .select.tiny { width: auto; padding: 3px 6px; font-size: 12.5px; }

  /* —— sessions —— */
  .builder-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .sess-head { flex-wrap: nowrap; }
  .track { font: 500 12px/1 var(--font-mono); color: var(--muted); white-space: nowrap; }
  .track.cardio { color: var(--good); }
  .sess-name {
    flex: 1;
    min-width: 0;
    font: 600 14px/1.3 var(--font-ui);
    color: var(--ink);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 3px 8px;
    margin-left: -4px;
  }
  .sess-name::placeholder { color: var(--muted); font-weight: 400; }
  .sess-name:hover { border-color: var(--line); }
  .sess-name:focus { background: var(--surface); border-color: var(--blue); outline: none; box-shadow: 0 0 0 3px var(--focus-ring); }

  .sess-body { display: flex; flex-direction: column; gap: 14px; }
  .cardio { display: flex; gap: 10px; flex-wrap: wrap; align-items: end; }
  .f { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  .f.grow { flex: 1; min-width: 160px; }
  .f .input { font-size: 14px; }
  .num { width: 72px; text-align: right; font-family: var(--font-mono); }
  /* exercises are ruled rows, not boxes inside the session box */
  .exlist { display: flex; flex-direction: column; gap: 14px; }
  .exlist > :global(.exedit + .exedit) { padding-top: 14px; border-top: 1px solid var(--line-soft); }
  .sess-body :global(.empty) { padding: 18px; border: 1px dashed var(--line); border-radius: var(--radius); }

  .builder-foot { display: flex; align-items: center; gap: 10px; }
  :global(.self-start) { align-self: flex-start; }
  .hint { margin: 0; }

  @media (max-width: 1180px) {
    .cols { grid-template-columns: minmax(0, 1fr); }
  }
  /* stacked but roomy: identity on one row, the plan below it in two columns */
  @media (min-width: 761px) and (max-width: 1180px) {
    .ident { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; }
    .plan { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px 24px; align-items: start; }
  }
</style>
