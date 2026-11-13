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
    dissolveGroup,
    exerciseUnits,
    groupTag,
    linkWithNext,
    moveUnit,
    normalizeGroups,
    oneRepMaxKg,
    setGroupRounds,
    unlink,
    placeSessions,
    sessionTag,
    stampAlternating,
    stampWeeks,
    type ProgramSession,
    type WeekPlan,
  } from "@pt/shared";
  import { SCHEME_PRESETS, schemePreset } from "@pt/shared";
  import { weekPlanLabel } from "$lib/format";
  import { rowsToWeekPlans } from "$lib/phasing";
  import WeekPlanRows from "$lib/components/WeekPlanRows.svelte";
  import { cloneSessionRows, exercisesForSave, type CustomWeekRow, type DraftForm, type SessionRow } from "$lib/programForm";
  import ExerciseEditor from "$lib/components/ExerciseEditor.svelte";
  import ExerciseGroup from "$lib/components/ExerciseGroup.svelte";
  import SessionTypePicker from "$lib/components/SessionTypePicker.svelte";
  import DirChip from "$lib/components/DirChip.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import SkeletonHead from "$lib/ui/SkeletonHead.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import ClientLoadError from "$lib/components/ClientLoadError.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PasteImport from "$lib/components/PasteImport.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  /** First load failed before the client arrived (e.g. 404): show that, not an endless skeleton. */
  let loadError = $state<unknown>(null);
  const onLoadError = (e: unknown) => {
    if (client !== null) throw e;
    loadError = e;
  };
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

  /** The template week — Week A when the block alternates. */
  let sessions = $state<SessionRow[]>([newRow()]);
  /** Alternate A/B (FB-013): the even-week routine; null = same every week. */
  let weekB = $state<SessionRow[] | null>(null);
  /** Week B as it was when Alternate was switched off, so switching back doesn't lose it (not kept on the device). */
  let parkedB: SessionRow[] | null = null;
  /** Which routine the session editor shows. */
  let editing = $state<"A" | "B">("A");
  /** The session list being edited. */
  const rows = $derived(editing === "B" && weekB ? weekB : sessions);

  /** seq per kind in list order — "Session 1", "Session 2", "Cardio 1"… */
  function seqsOf(list: SessionRow[]): number[] {
    const n = { lifting: 0, cardio: 0 };
    return list.map((s) => ++n[s.kind]);
  }
  const seqs = $derived(seqsOf(rows));

  /**
   * Days aren't picked here: sessions are spread over the client's training
   * days on save, and the trainer rearranges them on the program's calendar.
   * A and B weeks are placed each on their own.
   */
  function placementOf(list: SessionRow[], listSeqs: number[]) {
    const patternOf = (exId: string) => catalog.find((c) => c.id === exId)?.movementPattern ?? null;
    const draft = list.map((s, i) => ({
      id: s.key,
      name: s.name || "x",
      seq: listSeqs[i],
      order: 0,
      kind: s.kind,
      exercises: s.exercises.map((e, ei) => ({ id: e.id, exerciseId: e.exerciseId, order: ei, prescribedSets: [] })),
      cardio: null,
    })) as ProgramSession[];
    const placed = placeSessions(draft, client, patternOf);
    return new Map(placed.map((p) => [p.id, p.weekday ?? null]));
  }

  /** Weeks toggle: on, Week B starts as a copy of A (or what it was before it was switched off). */
  function setAlternate(on: boolean) {
    if (on === (weekB !== null)) return;
    if (on) {
      weekB = parkedB ?? cloneSessionRows($state.snapshot(sessions), uuid);
    } else {
      parkedB = $state.snapshot(weekB);
      weekB = null;
    }
    editing = "A";
  }

  /** Reset Week B to a fresh copy of Week A. */
  function copyFromA() {
    weekB = cloneSessionRows($state.snapshot(sessions), uuid);
  }

  /** Odd weeks run A, even weeks B: how many weeks each routine covers. */
  const weeksOf = (letter: "A" | "B") => {
    const n = Number(plannedWeeks) || 4;
    return letter === "A" ? Math.ceil(n / 2) : Math.floor(n / 2);
  };


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
      schemeMode, selectedSchemeId, customWeeks, schemeName, sessions, weekB,
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
    weekB = f.weekB && f.weekB.length > 0 ? f.weekB : null;
    parkedB = null;
    editing = "A";
    if (f.schemeMode === "saved" && !pickable(f.selectedSchemeId)) {
      const fallback = defaultPick();
      schemeMode = fallback ? "saved" : "none";
      selectedSchemeId = fallback;
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
    weekB = null;
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

  const activeWeekPlans = $derived.by<WeekPlan[]>(() => {
    if (schemeMode === "custom") {
      return rowsToWeekPlans(customWeeks);
    }
    if (schemeMode === "saved" && selectedScheme) {
      return selectedScheme.weeks;
    }
    return [];
  });

  /** Built-in presets the trainer hasn't hidden; picked as `preset:<key>` in the scheme select. */
  let hiddenPresets = $state<string[]>([]);
  const visiblePresets = $derived(SCHEME_PRESETS.filter((p) => !hiddenPresets.includes(p.key)));
  const PRESET = "preset:";
  const presetOf = (value: string) => (value.startsWith(PRESET) ? schemePreset(value.slice(PRESET.length)) : undefined);
  /** A saved scheme or a visible preset still exists for this select value. */
  const pickable = (value: string) =>
    schemes.some((x) => x.id === value) || visiblePresets.some((p) => `${PRESET}${p.key}` === value);
  /** Trainer's first scheme, else Linear strength 3:1 (or the first visible preset). */
  const defaultPick = () => {
    if (schemes[0]) return schemes[0].id;
    const preset = visiblePresets.find((p) => p.key === "linear-3-1") ?? visiblePresets[0];
    return preset ? `${PRESET}${preset.key}` : "";
  };

  const selectedScheme = $derived.by<{ name: string; weeks: WeekPlan[] } | null>(() => {
    if (schemeMode !== "saved") return null;
    const preset = presetOf(selectedSchemeId);
    if (preset) return { name: preset.name, weeks: [...preset.weeks] };
    return schemes.find((s) => s.id === selectedSchemeId) ?? null;
  });

  /** Pick a scheme; a preset also fills This phase / Next phase. */
  function pick(value: string) {
    schemeMode = value ? "saved" : "none";
    selectedSchemeId = value;
    const preset = presetOf(value);
    if (preset) {
      phase = preset.phase;
      nextPhase = preset.nextPhase;
    }
  }

  $effect(() => {
    if (activeWeekPlans.length > 0) {
      plannedWeeks = activeWeekPlans.length;
    }
  });

  function onSchemeSelect(value: string) {
    if (value === "custom" || value === "none") {
      schemeMode = value;
    } else {
      pick(value);
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


  /** Session label as the trainer sees it: their name, else the track tag. */
  const labelOf = (s: SessionRow, i: number, listSeqs = seqs) => s.name.trim() || sessionTag({ kind: s.kind, seq: listSeqs[i] });

  /** First thing standing between the trainer and Save — shown beside the disabled button. */
  const blocker = $derived.by<string | null>(() => {
    if (name.trim() === "") return "Name the program to save it.";
    const lists: [string, SessionRow[]][] = weekB ? [["Week A · ", sessions], ["Week B · ", weekB]] : [["", sessions]];
    for (const [prefix, list] of lists) {
      const listSeqs = seqsOf(list);
      for (const [i, s] of list.entries()) {
        if (s.kind === "lifting" && s.exercises.length === 0) return `${prefix}${labelOf(s, i, listSeqs)} needs an exercise.`;
        if (s.kind === "cardio" && !s.cardio.modality.trim()) return `${prefix}${labelOf(s, i, listSeqs)} needs a modality.`;
      }
    }
    return null;
  });

  const MAX_SESSIONS = 14;

  function addSession() {
    if (rows.length < MAX_SESSIONS) rows.push(newRow());
  }

  function removeSession(key: string) {
    if (editing === "B" && weekB) weekB = weekB.filter((s) => s.key !== key);
    else sessions = sessions.filter((s) => s.key !== key);
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

  function moveExercise(s: SessionRow, i: number, dir: -1 | 1, scope: "item" | "unit" = "item") {
    s.exercises = moveUnit(s.exercises, i, dir, scope);
  }

  function removeExerciseAt(s: SessionRow, i: number) {
    s.exercises = normalizeGroups(s.exercises.filter((_, j) => j !== i));
  }

  function toTemplateSessions(list: SessionRow[]): ProgramSession[] {
    const used = new Map<number, number>();
    const listSeqs = seqsOf(list);
    const placement = placementOf(list, listSeqs);
    return list.map((s, si) => {
      const seq = listSeqs[si];
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
          exercises: exercisesForSave($state.snapshot(s.exercises)).map((e, ei) => ({
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
      const weeks = weekB
        ? stampAlternating(toTemplateSessions(sessions), toTemplateSessions(weekB), numWeeks)
        : stampWeeks(toTemplateSessions(sessions), numWeeks);

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

  async function firstLoad() {
    const detail = await api.client(id);
    client = detail.client;
    [catalog, schemes, types, hiddenPresets] = await Promise.all([
      api.exercises(),
      api.schemes(),
      api.sessionTypes(),
      api.hiddenSchemePresets(),
    ]);
    pick(defaultPick());
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
  }

  onMount(() => {
    firstLoad().catch(onLoadError);
  });
</script>

<svelte:head><title>New program · Program Tracker</title></svelte:head>
<svelte:window
  onpagehide={persist}
  onvisibilitychange={() => {
    if (document.visibilityState === "hidden") persist();
  }}
/>

{#if loadError}
  <ClientLoadError error={loadError} />
{:else if client === null}
  <SkeletonHead actions={2} label="Loading client…" />
  <div class="skel-stack">
    <SkeletonPanel title="Basics" height={96} />
    <SkeletonPanel head rows={4} dense />
  </div>
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
                    {#if visiblePresets.length > 0}
                      <optgroup label="Presets">
                        {#each visiblePresets as p (p.key)}
                          <option value="{PRESET}{p.key}">{p.name}</option>
                        {/each}
                      </optgroup>
                    {/if}
                    {#if schemes.length > 0}
                      <optgroup label="Your schemes">
                        {#each schemes as s (s.id)}
                          <option value={s.id}>{s.name}</option>
                        {/each}
                      </optgroup>
                    {/if}
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
                    <a class="manage" href="/schemes">Manage schemes</a>
                  </div>
                {:else if schemeMode === "custom"}
                  <div class="custom-scheme">
                    <WeekPlanRows
                      bind:rows={customWeeks}
                      newRow={() => ({ directive: "+volume", metric: "overall_volume", deltaPercent: 5 })}
                    />
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
      <div class="weeks-bar">
        <Segmented
          label="Weeks"
          lead="Weeks"
          value={weekB ? "ab" : "same"}
          onchange={(v) => setAlternate(v === "ab")}
          items={[
            { value: "same", label: "Same every week" },
            { value: "ab", label: "Alternate A/B", title: "Two routines: odd weeks run A, even weeks run B" },
          ]}
        />
        {#if weekB}<span class="subtle">Odd weeks run A, even weeks B.</span>{/if}
      </div>

      {#if weekB}
        <div class="ab-tabs">
          <Tabs
            label="Routine"
            idPrefix="np-week"
            value={`week-${editing.toLowerCase()}`}
            onchange={(t) => (editing = t === "week-b" ? "B" : "A")}
            items={[
              { id: "week-a", label: "Week A", count: `${weeksOf("A")} wks` },
              { id: "week-b", label: "Week B", count: `${weeksOf("B")} wks` },
            ]}
          />
          {#if editing === "B"}
            <ConfirmButton label="Copy from A" confirmLabel="Replace week B with A?" variant="default" class="ghost" small onconfirm={copyFromA} />
          {/if}
        </div>
      {/if}

      <div
        class="sess-list"
        role={weekB ? "tabpanel" : undefined}
        id={weekB ? `panel-week-${editing.toLowerCase()}` : undefined}
        aria-labelledby={weekB ? `np-week-week-${editing.toLowerCase()}` : undefined}
      >
      {#each rows as s, si (s.key)}
        {@const tag = sessionTag({ kind: s.kind, seq: seqs[si] })}
        <section class="panel" aria-label={weekB ? `Week ${editing} · ${labelOf(s, si)}` : labelOf(s, si)}>
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
            {#if rows.length > 1}
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
                {#snippet editor(e: (typeof s.exercises)[number], ei: number, first: boolean, last: boolean)}
                  <ExerciseEditor
                    bind:exercise={s.exercises[ei]}
                    session={s.exercises}
                    {catalog}
                    oneRepMaxKg={oneRepMaxKg(client?.oneRepMaxes, e.exerciseId)}
                    oncreate={addToLibrary}
                    tag={groupTag(s.exercises, ei)}
                    canMoveUp={!first}
                    canMoveDown={!last}
                    onmoveup={() => moveExercise(s, ei, -1)}
                    onmovedown={() => moveExercise(s, ei, 1)}
                    onremove={() => removeExerciseAt(s, ei)}
                    onlink={ei < s.exercises.length - 1 ? () => (s.exercises = linkWithNext(s.exercises, ei)) : undefined}
                    onunlink={() => (s.exercises = unlink(s.exercises, ei))}
                  />
                {/snippet}
                {#each exerciseUnits(s.exercises) as u, ui (u.items[0].id)}
                  {@const lastUnit = u.start + u.items.length === s.exercises.length}
                  {#if u.group}
                    {@const g = u.group}
                    <ExerciseGroup
                      group={g}
                      count={u.items.length}
                      rounds={u.items[0].prescribedSets.length}
                      onrounds={(n) => (s.exercises = setGroupRounds(s.exercises, g, n))}
                      canMoveUp={ui > 0}
                      canMoveDown={!lastUnit}
                      onmoveup={() => moveExercise(s, u.start, -1, "unit")}
                      onmovedown={() => moveExercise(s, u.start, 1, "unit")}
                      onungroup={() => (s.exercises = dissolveGroup(s.exercises, g))}
                    >
                      {#each u.items as e, k (e.id)}
                        {@render editor(e, u.start + k, k === 0, k === u.items.length - 1)}
                      {/each}
                    </ExerciseGroup>
                  {:else}
                    {@render editor(u.items[0], u.start, ui === 0, lastUnit)}
                  {/if}
                {/each}
                <Button small class="self-start" onclick={() => addExercise(s)}>+ Add exercise</Button>
              </div>
            {/if}
          </div>
        </section>
      {/each}
      </div>

      <div class="builder-foot">
        <Button onclick={addSession} disabled={rows.length >= MAX_SESSIONS}>+ Add session{weekB ? ` to week ${editing}` : ""}</Button>
        {#if rows.length >= MAX_SESSIONS}<span class="subtle">{MAX_SESSIONS} sessions is the weekly limit.</span>{/if}
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
  .manage { font-size: 12px; }
  .scheme-meta .num { font-family: var(--font-mono); color: var(--ink); }
  .custom-scheme { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
  .save-row { display: flex; gap: 8px; align-items: center; }
  .save-row .input { flex: 1; min-width: 0; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  /* —— sessions —— */
  .builder-col { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
  .sess-list { display: flex; flex-direction: column; gap: 16px; }
  .weeks-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; font-size: 13px; }
  .ab-tabs { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: flex-end; gap: 8px; margin-bottom: -4px; }
  .ab-tabs :global(.tabs) { margin: 0; flex: 1 0 auto; flex-wrap: nowrap; }
  .ab-tabs :global(.btn) { margin-bottom: 6px; }
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
