<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { createLeaveGuard } from "$lib/leaveGuard.svelte";
  import { liftFeedback } from "$lib/feedback/lift";
  import LeaveGuard from "$lib/ui/LeaveGuard.svelte";
  import { api } from "$lib/api";
  import {
    addExercise,
    addSet,
    blockOf,
    mainWork,
    MAX_MAIN_EXERCISES,
    MAX_PREP_EXERCISES,
    movementPrep,
    moveToBlock,
    orderByBlock,
    type ExerciseUnit,
    type SessionBlock,
    addSession,
    applyForward,
    applyPlacementToAllWeeks,
    forwardWeeks,
    weekStructureDiff,
    copyWeekTargets,
    copyWeekTo,
    alternatingWeeksDiffer,
    isAlternating,
    matchAlternatingWeeks,
    setAlternating,
    DEFAULT_DELOAD,
    deloadRulesText,
    type DeloadSettings,
    dissolveGroup,
    exerciseUnits,
    groupTag,
    linkWithNext,
    moveUnit,
    normalizeGroups,
    setGroupRounds,
    unlink,
    formatPatternBalance,
    MOVEMENT_PATTERN_INFO,
    type MovementPattern,
    nextSeq,
    sessionsPatternBalance,
    placeSession,
    placeSessions,
    removeSession,
    sessionFocus,
    sessionKey,
    sessionTag,
    sessionsByWeekday,
    deloadBasisWeek,
    localDateOf,
    oneRepMaxKg,
    type OneRepMaxes,
    type ProgramWeek,
    type SessionKind,
    type SignalProgram,
  } from "@pt/shared";
  import { EXAMPLE_LEVELS, MAX_AI_BLOCK_WEEKS, primaryPattern, typeFitsKind } from "@pt/shared";
  import type { ExerciseDto, ExerciseInput, ProgramDto, ProgramExampleDto, ProgramSessionDto, SessionLogDto, SessionTypeDto, SessionTypeInput } from "$lib/api/types";
  import { cardioLine } from "$lib/cardioLine";
  import { extraSets, logDateLabel, loggedSetLabel, programLogView, setsForExercise, timedIdsOfWeek } from "$lib/programLogs";
  import { exerciseIssue, sessionLabel, validateProgramDoc } from "$lib/programDoc";
  import { copyNotice, copyTargetLabel, currentWeekIndex as openingWeekIndex, endedNote, forwardNotice, matchNotice, programSubline, sameProgramDoc, snapshot, weekLine, weekRangeLabel, weekTabDates } from "$lib/programEdit";
  import { isDeloaded, toggleDeload, type DeloadUndo } from "$lib/deloadUndo";
  import { clientDeload } from "$lib/draftReview";
  import { patternTitle } from "$lib/exerciseLibrary";
  import ExerciseEditor from "$lib/components/ExerciseEditor.svelte";
  import ExerciseGroup from "$lib/components/ExerciseGroup.svelte";
  import GroupTag from "$lib/components/GroupTag.svelte";
  import BlockHead from "$lib/components/BlockHead.svelte";
  import SessionHeadEditor from "$lib/components/SessionHeadEditor.svelte";
  import type { CardioTemplateInput, CardioTemplatesDto, HrProfileDto, ModalityDto } from "$lib/api/types";
  import { profileOn, sessionDateIn, type HrZones } from "@pt/shared";
  import WeekCalendar from "$lib/components/WeekCalendar.svelte";
  import PhasingEditor from "$lib/components/PhasingEditor.svelte";
  import RoleChip from "$lib/components/RoleChip.svelte";
  import SetChips from "$lib/components/SetChips.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import InputField from "$lib/ui/InputField.svelte";
  import InputNote from "$lib/ui/InputNote.svelte";
  import SelectField from "$lib/ui/SelectField.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import OverflowMenu, { type OverflowItem } from "$lib/ui/OverflowMenu.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import StartDateDialog from "$lib/components/StartDateDialog.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const id = $derived(page.params.id ?? "");

  let program = $state<ProgramDto | null>(null);
  let clientName = $state<string | null>(null);
  /** This program's logs — shown under each session next to what was planned. */
  let logs = $state<SessionLogDto[]>([]);
  let trainingDays = $state<number[]>([]);
  /** The client's run days and long-run day, for Auto-place (placement.ts). */
  let cardioDays = $state<number[] | null>(null);
  let longRunDay = $state<number | null>(null);
  /** The client's 1RMs: %1RM sets show (and plan) their kg. */
  let oneRepMaxes = $state<OneRepMaxes | null>(null);
  /** The client's deload rule in force — the Deload button applies it. */
  let deload = $state<DeloadSettings>(DEFAULT_DELOAD);
  /** Structural edits and moves go to this week and the later ones the client hasn't finished
   *  (same-letter weeks in an A/B block), unless narrowed to this week (FB-017). */
  let changesLater = $state(true);
  let selected = $state<string | null>(null);
  let catalog = $state<ExerciseDto[]>([]);
  /** New exercise from the picker: save to the library, keep the catalog in sync. */
  async function addToLibrary(input: ExerciseInput) {
    const created = await api.createExercise(input);
    catalog.push(created);
    return created;
  }
  const catalogById = $derived(new Map(catalog.map((e) => [e.id, e])));
  let types = $state<SessionTypeDto[]>([]);
  async function addType(input: SessionTypeInput) {
    const created = await api.createSessionType(input);
    types.push(created);
    return created;
  }
  /** A type labels the session for the whole block: copy it to the same session (kind + seq) in every
   *  week — every same-letter week in an A/B block, since A and B sessions differ. */
  function labelAllWeeks(key: string, t: SessionTypeDto) {
    if (!program) return;
    const letter = currentWeek?.rotation;
    for (const w of program.weeks) {
      if (letter && w.rotation !== letter) continue;
      for (const x of w.sessions) {
        if (sessionKey(x) === key && typeFitsKind(t.format, x.kind)) {
          x.typeId = t.id;
          x.typeName = t.name;
        }
      }
    }
  }
  /** Saved state of the program; edits are live on `program` and compared against this. */
  let baseline = $state("");
  let openExercise = $state<string | null>(null);
  let openSession = $state<string | null>(null);
  let showPhasing = $state(false);
  /** Bumped by Discard: the phasing editor keeps its own rows, so it must remount to show the restored plan. */
  let phasingResets = $state(0);
  let saveError = $state<string | null>(null);
  const editable = $derived(program != null && program.status !== "archived");
  /** Replace a session's exercises in the open week; groups are tidied on every edit. */
  function setExercises(si: number, list: ProgramSessionDto["exercises"]) {
    if (!currentWeek) return;
    currentWeek.sessions[si] = { ...currentWeek.sessions[si], exercises: normalizeGroups(list).map((e, i) => ({ ...e, order: i })) };
  }
  /** Add a placeholder exercise at the end of a block; the editor swaps it right away and the edit goes forward when it closes. */
  function addExerciseTo(si: number, block: SessionBlock) {
    const first = catalog[0];
    if (!currentWeek || !first) return;
    beginEdit();
    const sess = addExercise(currentWeek.sessions[si], first.id, first.name);
    const last = sess.exercises.length - 1;
    const added = { ...addSet(sess.exercises[last]), ...(block === "prep" ? { block } : {}) };
    currentWeek.sessions[si] = { ...sess, exercises: orderByBlock(sess.exercises.map((x, i) => (i === last ? added : x))) };
    openExerciseEditor(added.id);
  }
  /** "prep 3 not counted" after the session's balance line, when it has prep. */
  const prepNote = (s: ProgramSessionDto) => {
    const n = movementPrep(s.exercises).length;
    return n > 0 ? ` · prep ${n} not counted` : "";
  };
  const dirty = $derived(program != null && baseline !== "" && snapshot(program) !== baseline);
  let saving = $state(false);
  /** The last save hit a newer version (another tab, an AI fill): saving again can't win; reload instead. */
  let stale = $state(false);
  let savedAt = $state<string | null>(null);
  let activating = $state(false);
  let currentWeekIndex = $state(0);

  let existingExample = $state<ProgramExampleDto | null>(null);
  let marking = $state(false);
  let markGoal = $state("");
  let markLevel = $state<ProgramExampleDto["level"]>("intermediate");
  let markNote = $state("");
  let savingMark = $state(false);
  let markError = $state<string | null>(null);

  const weekIndex = $derived(program?.weeks[currentWeekIndex] ? currentWeekIndex : 0);
  const currentWeek = $derived(program?.weeks[weekIndex] ?? null);
  const patternsOf = (exerciseId: string) => catalogById.get(exerciseId)?.movementPatterns ?? [];
  /** Primary pattern only — balance, focus and placement ignore secondary tags. */
  const patternOf = (exerciseId: string) => patternsOf(exerciseId)[0] ?? null;
  const focusOf = (s: ProgramSessionDto) => sessionFocus(s, patternOf);
  /** Sessions in calendar order: Mon → Sun, then unscheduled. */
  const ordered = $derived.by(() => {
    if (!currentWeek) return [];
    const by = sessionsByWeekday(currentWeek.sessions);
    return [1, 2, 3, 4, 5, 6, 7, 0].flatMap((d) => by.get(d)!.map((s) => ({ s, day: d })));
  });
  const logView = $derived(program ? programLogView(program as SignalProgram, logs) : null);
  /** Today (local), so the tabs can say which week is now. */
  const today = localDateOf(Date.now());
  /** Each week's dates and past / now / upcoming; null for drafts (no calendar yet). */
  const weekDates = $derived(program ? weekTabDates(program, logs, today) : null);
  const ended = $derived(currentWeek ? endedNote(weekDates, currentWeek.week, clientName) : null);
  /** The client's week for forward edits: past the end nothing is "later"; before the start it is W1; drafts have none. */
  const nowWeek = $derived.by(() => {
    if (!weekDates) return null;
    const now = weekDates.find((d) => d.state === "now");
    if (now) return now.week;
    return weekDates.every((d) => d.state === "past") ? weekDates.length + 1 : 1;
  });

  // —— One commit point for structural edits (FB-017) ————————————————————————
  /** The open week as it was when an editor opened; closing the editors diffs against it. */
  let pending: { week: number; before: ProgramWeek } | null = null;
  function beginEdit() {
    if (!pending && currentWeek) pending = { week: currentWeek.week, before: $state.snapshot(currentWeek) as ProgramWeek };
  }
  const sessionHasLogs = (_week: number, sid: string) => logsOf(sid).length > 0;
  const exerciseHasLogs = (_week: number, sid: string, e: { id: string; exerciseId: string }) =>
    logsOf(sid).some((l) => setsForExercise(l, e).length > 0);
  /** Send the structure edits made since `beginEdit` to the later weeks, with an Undo toast. */
  function commitEdits() {
    const p = pending;
    pending = null;
    if (!p || !program || !changesLater) return;
    const after = program.weeks.find((w) => w.week === p.week);
    if (!after) return;
    const edits = weekStructureDiff(p.before, $state.snapshot(after) as ProgramWeek);
    if (edits.length === 0) return;
    const before = $state.snapshot(program.weeks) as ProgramWeek[];
    const r = applyForward(before, p.week, edits, {
      targets: forwardWeeks(before, p.week, nowWeek),
      sessionHasLogs,
      exerciseHasLogs,
      phasing: $state.snapshot(program.phasing) ?? null,
    });
    if (r.changed.length > 0) program.weeks = r.weeks;
    const text = forwardNotice(edits, r);
    if (text) showToast(text, r.changed.length > 0 ? before : null);
  }
  function openExerciseEditor(eid: string) {
    beginEdit();
    openExercise = eid;
    openSession = null;
  }
  function openSessionEditor(sid: string) {
    beginEdit();
    openSession = sid;
    openExercise = null;
  }
  function closeEditors() {
    openExercise = null;
    openSession = null;
    commitEdits();
  }
  function selectWeek(wi: number) {
    closeEditors();
    currentWeekIndex = wi;
  }
  const timedIds = $derived(timedIdsOfWeek(currentWeek));
  const isTimed = (e: { id: string; exerciseId: string }) => timedIds.has(e.id) || timedIds.has(e.exerciseId);
  const logsOf = (sid: string) => logView?.bySession.get(sid) ?? [];
  const weekLogCount = (w: ProgramWeek, wi: number) =>
    w.sessions.reduce((n, s) => n + logsOf(s.id).length, 0) + (logView?.otherByWeek.get(wi)?.length ?? 0);
  const nameOf = (exerciseId: string) => catalogById.get(exerciseId)?.name ?? "Exercise";
  const exerciseCount = (w: ProgramWeek) => w.sessions.filter((s) => s.kind === "exercises").length;
  const indexOf = (sid: string) => currentWeek?.sessions.findIndex((x) => x.id === sid) ?? -1;

  // —— Alternate A/B and "Copy this week to…" (FB-013) ——————————————————
  const alternating = $derived(program ? isAlternating(program.weeks) : false);
  /** Tag weeks odd A / even B. Turning them off makes every week match: when the A and B
   *  routines differ, the trainer picks Week A, Week B, or keeping each week as it is. */
  async function setRotation(on: boolean) {
    if (!program) return;
    const before = $state.snapshot(program.weeks) as ProgramWeek[];
    if (on || !alternatingWeeksDiffer(before)) {
      program.weeks = setAlternating(before, on);
      return;
    }
    const a = await leaveGuard.ask({
      title: "Make every week the same?",
      body: "Week A and week B have different workouts. Logged and deload weeks stay as they are.",
      cancelLabel: "Keep A/B weeks",
      choices: [
        { id: "A", label: "Use Week A for every week", hint: "Week 2 copies week 1, week 4 copies week 3, and so on." },
        { id: "B", label: "Use Week B for every week", hint: "Week 1 copies week 2, week 3 copies week 4, and so on." },
        { id: "keep", label: "Keep each week's workouts", hint: "Only the A/B letters go. B weeks keep their own workouts." },
      ],
    });
    if (!program || a === "cancel" || a === "confirm" || a === "alt") return;
    if (a === "choice:keep") {
      program.weeks = setAlternating(before, false);
      return;
    }
    const use = a === "choice:B" ? "B" : "A";
    const { weeks, skipped } = matchAlternatingWeeks(before, use, hasLogs, isDeloadWeek);
    program.weeks = weeks;
    showToast(matchNotice(use, skipped), before);
  }
  /** Planned deload weeks (block phasing) and weeks deloaded with the button: never overwritten. */
  const isDeloadWeek = (week: number) => {
    if (program?.phasing?.weeks?.some((p) => p.week === week && p.directive === "deload")) return true;
    const w = program?.weeks.find((x) => x.week === week);
    return w != null && isDeloaded(deloadUndo, $state.snapshot(w) as ProgramWeek);
  };
  const hasLogs = (week: number) => {
    const wi = program?.weeks.findIndex((w) => w.week === week) ?? -1;
    return wi >= 0 && weekLogCount(program!.weeks[wi], wi) > 0;
  };
  const copyItems = $derived.by<OverflowItem[]>(() => {
    if (!program || !currentWeek) return [];
    const letterOf = (n: number) => program?.weeks.find((w) => w.week === n)?.rotation;
    return copyWeekTargets(program.weeks, currentWeek.week).map((t) => ({
      ...copyTargetLabel(t),
      ...(t.kind === "week" ? { section: "One week", hint: letterOf(t.weeks[0]) } : {}),
      onselect: () => copyTo(t.weeks),
    }));
  });
  /** After a copy: what changed (logged weeks are skipped), with Undo. */
  let copyToast = $state<{ text: string; before: ProgramWeek[] | null } | null>(null);
  let copyToastTimer: ReturnType<typeof setTimeout> | undefined;
  function copyTo(targets: number[]) {
    if (!program || !currentWeek) return;
    const before = $state.snapshot(program.weeks) as ProgramWeek[];
    const { weeks, skipped } = copyWeekTo(before, currentWeek.week, targets, hasLogs);
    const changed = skipped.length < targets.length;
    if (changed) program.weeks = weeks;
    showToast(copyNotice(currentWeek.week, targets, skipped), changed ? before : null);
  }
  function showToast(text: string, before: ProgramWeek[] | null) {
    clearTimeout(copyToastTimer);
    copyToast = { text, before };
    copyToastTimer = setTimeout(() => (copyToast = null), 10000);
  }
  function undoCopy() {
    if (program && copyToast?.before) program.weeks = copyToast.before;
    copyToast = null;
  }

  function setWeek(next: ProgramWeek) {
    if (!program) return;
    program.weeks[weekIndex] = next;
  }

  function place(sid: string, weekday: number | null, index: number) {
    if (!program || !currentWeek) return;
    setWeek(placeSession($state.snapshot(currentWeek) as ProgramWeek, sid, weekday, index));
    if (changesLater) {
      const weeks = $state.snapshot(program.weeks) as ProgramWeek[];
      program.weeks = applyPlacementToAllWeeks(weeks, currentWeek.week, forwardWeeks(weeks, currentWeek.week, nowWeek));
    }
  }

  function autoPlace() {
    if (!program) return;
    // Each week on its own: the rules are deterministic, so identical weeks land identically.
    program.weeks = ($state.snapshot(program.weeks) as ProgramWeek[]).map((w) => ({
      ...w,
      sessions: placeSessions(w.sessions, { trainingDays, cardioDays, longRunDay }, patternOf),
    }));
  }

  function addNewSession(kind: SessionKind) {
    closeEditors();
    if (!currentWeek) return;
    beginEdit();
    const next = addSession($state.snapshot(currentWeek) as ProgramWeek, kind, null);
    setWeek(next);
    const added = next.sessions.at(-1)!;
    openSessionEditor(added.id);
    // On a phone the new card lands far below the calendar: bring it (and its editor) on screen.
    tick().then(() => select(added.id));
  }

  function select(sid: string) {
    selected = sid;
    document.getElementById(`sess-${sid}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  let modalities = $state<ModalityDto[]>([]);
  let cardioTemplates = $state<CardioTemplatesDto | null>(null);
  /** The member's HR profile versions; each session's bpm come from the one in effect on its own day. */
  let hrVersions = $state<HrProfileDto[]>([]);
  /** The zones for a session in the shown week: its day's profile, so week 5 shows week 5's zones. Draft blocks have no dates: today's. */
  function zonesFor(s: { weekday?: number | null }): HrZones | null {
    const start = weekDates?.[weekIndex]?.start;
    return profileOn(hrVersions, start ? sessionDateIn(start, s.weekday) : today)?.zones ?? null;
  }

  /** An open exercise editor holds a cell it couldn't parse (RPE "abc"): named in the save bar, save held. */
  let editorIssue = $state<string | null>(null);
  const validation = $derived.by(() => {
    const doc = program ? validateProgramDoc(program.weeks) : { ok: true as const };
    return doc.ok && editorIssue ? { ok: false as const, message: editorIssue } : doc;
  });

  async function load() {
    // Build the page off-screen and show it only once its opening week is known: shown early it sat
    // on W1 until the member's logs landed, and "+ Exercise session" tapped then went into W1.
    const p = await api.program(id);
    let pLogs: SessionLogDto[] = [];
    try {
      [catalog, types] = await Promise.all([api.exercises(), api.sessionTypes()]);
      // cardio editor: the modality list and templates (a failed read leaves the free-text path)
      api.modalities().then((m) => (modalities = m), () => {});
      api.cardioTemplates().then((t) => (cardioTemplates = t), () => {});
      const mine = await api.examples(id);
      existingExample = mine[0] ?? null;
      if (!existingExample) marking = false;
      if (p.clientId) {
        const detail = await api.client(p.clientId);
        clientName = detail.client.name;
        trainingDays = detail.client.trainingDays ?? [];
        cardioDays = detail.client.cardioDays ?? null;
        longRunDay = detail.client.longRunDay ?? null;
        oneRepMaxes = detail.client.oneRepMaxes ?? null;
        deload = clientDeload(detail.client);
        pLogs = await api.sessionLogs(p.clientId, p.id).catch(() => []);
        api.hrProfiles(p.clientId).then((v) => (hrVersions = v), () => {});
      }
    } finally {
      // a failed side read still shows the program (as before), never a skeleton for good
      logs = pLogs;
      program = p;
      baseline = snapshot(p);
      deloadUndo = new Map();
      // Open on the client's current week (FB-017: edits on a finished week never reached them).
      currentWeekIndex = openingWeekIndex(weekTabDates(p, pLogs, today));
    }
  }

  async function markAsExample() {
    if (!program || !markGoal.trim()) return;
    savingMark = true;
    markError = null;
    try {
      existingExample = await api.createExample({
        programId: program.id,
        goal: markGoal.trim(),
        level: markLevel,
        note: markNote.trim() || undefined,
      });
      marking = false;
      markGoal = "";
      markNote = "";
    } catch (e) {
      markError = (e as Error).message;
    } finally {
      savingMark = false;
    }
  }

  async function removeFromLibrary() {
    if (!existingExample) return;
    await api.deleteExample(existingExample.id);
    existingExample = null;
  }

  async function saveCardioTemplate(input: CardioTemplateInput) {
    const saved = await api.createCardioTemplate(input);
    if (cardioTemplates) cardioTemplates = { ...cardioTemplates, templates: [...cardioTemplates.templates, saved] };
    return saved;
  }

  async function save() {
    closeEditors();
    if (!program || !validation.ok) return;
    saving = true;
    saveError = null;
    const saved = () => {
      baseline = snapshot(program!);
      savedAt = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };
    try {
      program = await api.saveProgram(program.id, program.weeks, program.phasing ?? null, program.version);
      saved();
    } catch (e) {
      // The edits stay on screen either way; a 409 means only a reload can get past it.
      saveError = (e as Error).message;
      stale = (e as { status?: unknown }).status === 409;
      if (stale) {
        // A save whose reply was lost (gym Wi-Fi) already landed: the server holds exactly these edits.
        const latest = await api.program(program.id).catch(() => null);
        if (latest && program && sameProgramDoc(latest, program)) {
          program = latest;
          saved();
          saveError = null;
          stale = false;
        } else if (latest) {
          saveError = "This program was saved elsewhere since you opened it. Reload to see the latest.";
        }
      }
    } finally {
      saving = false;
    }
  }

  /** Drop the local edits for the latest saved version (after a 409). */
  async function reloadLatest() {
    await load();
    pending = null;
    openExercise = null;
    openSession = null;
    phasingResets++;
    saveError = null;
    stale = false;
  }

  function discard() {
    if (!program || !baseline) return;
    const saved = JSON.parse(baseline);
    program.weeks = saved.weeks;
    program.phasing = saved.phasing;
    phasingResets++;
    pending = null;
    openExercise = null;
    openSession = null;
    saveError = null;
  }

  const leaveGuard = createLeaveGuard({
    dirty: () => dirty,
    prompt: () => ({
      title: "Save your program changes?",
      body: "You have edits that haven't been saved. Saving creates a new version; leaving drops them.",
    }),
    save: async () => {
      await save();
      return !saveError;
    },
  });

  /** "Week 1 starts on": picked when activating, changeable on an active program. */
  let startDialog = $state<"activate" | "change" | null>(null);
  async function setStart(startsOn: string) {
    if (!program) return;
    if (startDialog === "activate") {
      activating = true;
      try {
        program = await api.setProgramStatus(program.id, "active", startsOn);
      } finally {
        activating = false;
      }
    } else {
      program = await api.setProgramStartsOn(program.id, startsOn);
    }
    startDialog = null;
    closeEditors();
    currentWeekIndex = openingWeekIndex(weekTabDates(program, logs, today));
  }

  /** Deload the viewed week by the client's rule (deloadWeek); the week-1 basis reads week 1's loads
   *  (the first same-letter week in an A/B block). */
  /** Pre-deload copies per week, so a second press undoes instead of deloading twice. */
  let deloadUndo = $state.raw<DeloadUndo>(new Map());
  const weekDeloaded = $derived(currentWeek ? isDeloaded(deloadUndo, $state.snapshot(currentWeek) as ProgramWeek) : false);

  function applyDeload() {
    if (!currentWeek) return;
    const undo = new Map(deloadUndo);
    const week1 =
      deload.loadBasis === "week1" && program
        ? deloadBasisWeek($state.snapshot(program.weeks) as ProgramWeek[], $state.snapshot(currentWeek)?.week ?? 1)
        : undefined;
    setWeek(toggleDeload(undo, $state.snapshot(currentWeek) as ProgramWeek, $state.snapshot(deload), week1));
    deloadUndo = undo;
  }

  onMount(load);

  /** Keep the open week's tab in view: on a phone W6 sits far right of a strip that opens on W1. */
  let weekStrip = $state<HTMLElement>();
  $effect(() => {
    const tab = weekStrip?.children[currentWeekIndex];
    if (!weekStrip || !(tab instanceof HTMLElement)) return;
    const s = weekStrip.getBoundingClientRect();
    const t = tab.getBoundingClientRect();
    if (t.left >= s.left - 1 && t.right <= s.right + 1) return;
    // centre it by moving the strip only, never the page
    weekStrip.scrollLeft += t.left - s.left - (s.width - t.width) / 2;
  });

  const DAY_NAMES = ["Any day", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
</script>

<svelte:head><title>{program?.name ?? "Program"}{clientName ? ` · ${clientName.split(" ")[0]}` : ""} · Program Tracker</title></svelte:head>

{#if program === null}
  <!-- Loading: the loaded layout's shape — head, week tabs, toolbars, calendar, session cards. -->
  <div class="page-head" aria-busy="true">
    <span class="sr-only" role="status">Loading program…</span>
    <div>
      <div class="sk-crumbs"><Skeleton shape="line" h="11px" w="128px" /></div>
      <h1 class="sk-line"><Skeleton shape="line" h="20px" w="min(220px, 60vw)" /></h1>
      <p class="sub sk-line"><Skeleton shape="line" h="11px" w="32px" /></p>
    </div>
    <div class="actions"><Skeleton h="26px" w="132px" /></div>
  </div>
  <div class="weeks-row" aria-hidden="true">
    <div class="week-tabs">
      {#each { length: 6 }, i (i)}<span class="tab-btn sk-tab"><Skeleton shape="line" h="12px" w="20px" /></span>{/each}
    </div>
    <Skeleton h="23px" w="250px" />
  </div>
  <div class="week-bar" aria-hidden="true">
    <p class="balance sk-line"><Skeleton shape="line" h="11px" w="min(270px, 60vw)" /></p>
    {#each [150, 170, 110, 110] as w, i (i)}<Skeleton h="24px" w={`${w}px`} />{/each}
  </div>
  <div class="cal-bar" aria-hidden="true">
    <Skeleton h="23px" w="250px" />
    <span class="grow"></span>
    <Skeleton h="20px" w="120px" />
    <Skeleton h="20px" w="120px" />
  </div>
  <WeekCalendar sessions={[]} editable={false} focusOf={() => "none"} onplace={() => {}} onselect={() => {}} loading />
  <div class="sessions-grid">
    {#each { length: 2 }, i (i)}<SkeletonPanel head rows={i % 2 ? 3 : 4} dense />{/each}
  </div>
{:else}
  <Crumbs items={[{ href: `/clients/${program.clientId}`, label: clientName ?? "Client" }, { label: "Program" }]} />
  <div class="page-head">
    <div>
      <h1>{program.name} <StatusPill status={program.status} /></h1>
      <p class="sub">
        <!-- Phones and the installed app swap the crumb trail for Back: say whose program this is. -->
        {#if clientName}<span class="for-member">For <strong>{clientName}</strong> · </span>{/if}
        {programSubline(program, savedAt, weekLine(weekDates))}
        {#if program.status === "active"}<button type="button" class="edit-link sub-link" onclick={() => (startDialog = "change")}>Change</button>{/if}
      </p>
    </div>
    <div class="actions">
      {#if program.status === "archived"}
        <span class="subtle readonly-note">archived — read only</span>
      {:else}
        {#if existingExample}
          <span class="subtle lib-state">In the example library</span>
          <a class="lib-link" href="/examples">View in library →</a>
          <ConfirmButton label="Remove" confirmLabel="Really remove?" onconfirm={removeFromLibrary} small />
        {:else if marking}
          <button class="btn ghost" onclick={() => (marking = false)}>Cancel mark</button>
        {:else}
          <button class="btn ghost" onclick={() => { marking = true; markError = null; }}>Mark as example</button>
        {/if}
        {#if program.status === "draft"}
          <button class="btn primary" onclick={() => (startDialog = "activate")} disabled={activating}>
            {activating ? "Activating…" : "Activate program"}
          </button>
        {/if}
      {/if}
    </div>
  </div>

  {#if marking && !existingExample}
    <form
      class="mark-form"
      onsubmit={(e) => {
        e.preventDefault();
        markAsExample();
      }}
    >
      <InputField label="Goal" placeholder="e.g. first pull-up, 5k time, lean bulk" bind:value={markGoal} maxlength={120} />
      <SelectField
        label="Level"
        maxWidth="none"
        options={EXAMPLE_LEVELS.map((l) => ({ value: l, label: l.charAt(0).toUpperCase() + l.slice(1) }))}
        bind:value={markLevel}
      />
      <InputNote label="Note" optional rows={2} maxlength={500} placeholder="When to reuse this block" bind:value={markNote} />
      <div class="mark-actions">
        <p class="hint">Days/week defaults to the program's exercise sessions per week ({exerciseCount(program.weeks[0])}).</p>
        <button class="btn primary" type="submit" disabled={savingMark || !markGoal.trim()}>
          {savingMark ? "Adding…" : "Add to example library"}
        </button>
      </div>
      {#if markError}<p class="hint gate-error">{markError}</p>{/if}
    </form>
  {/if}

  {#if program.status === "draft"}
    <p class="hint">
      Draft — never shown in the client portal. Drag sessions to place them on the week, click any exercise to tweak it, then activate
      (the previous active program archives automatically).
    </p>
  {:else if program.status === "archived"}
    <p class="hint">Archived block — kept for history. Start a new block from the client page.</p>
  {/if}

  {#if program.weeks.length > 1}
    <div class="weeks-row">
      <div class="week-tabs x-scroll" bind:this={weekStrip}>
        {#each program.weeks as w, wi (w.week)}
          {@const logged = weekLogCount(w, wi)}
          {@const loggedText = `${logged} ${logged === 1 ? "session" : "sessions"} logged`}
          {@const dated = weekDates?.[wi]}
          {@const range = dated ? weekRangeLabel(dated.start, dated.end) : null}
          <button
            type="button"
            class="tab-btn"
            class:active={wi === currentWeekIndex}
            class:past={dated?.state === "past"}
            aria-pressed={wi === currentWeekIndex}
            aria-current={dated?.state === "now" ? "date" : undefined}
            aria-label={[`W${w.week}`, w.rotation && `week ${w.rotation}`, range, dated?.state === "now" && "this week", dated?.state === "past" && "ended", logged > 0 && loggedText].filter(Boolean).join(", ")}
            onclick={() => selectWeek(wi)}
          >
            W{w.week}{#if w.rotation}<span class="tab-letter">{w.rotation}</span>{/if}
            {#if range}<span class="tab-dates">· {range}</span>{/if}
            {#if dated?.state === "now"}<span class="tab-now">now</span>{/if}
            {#if logged > 0}<span class="tab-logs" title={loggedText}><Icon name="check" />{logged}</span>{/if}
          </button>
        {/each}
      </div>
      {#if editable}
        <Segmented
          label="Weeks"
          lead="Weeks"
          value={alternating ? "ab" : "same"}
          onchange={(v) => setRotation(v === "ab")}
          items={[
            { value: "same", label: "Same every week" },
            { value: "ab", label: "A/B weeks", title: "Tag odd weeks A and even weeks B. Nothing in the weeks changes; edit W2, then copy it to every B week." },
          ]}
        />
      {/if}
    </div>
  {/if}

  {#if currentWeek}
    {#if ended}<Note tone="warn" role="note" class="ended-note">{ended}</Note>{/if}
    <div class="week-bar">
      <p class="balance">Week {currentWeek.week} balance — {formatPatternBalance(sessionsPatternBalance(currentWeek.sessions, patternOf))}</p>
      {#if editable && program.weeks.length > 1}
        <OverflowMenu items={copyItems} label="Copy week {currentWeek.week} to other weeks" text="Copy this week to…" icon="layers" />
      {/if}
      {#if editable && program.weeks.length > 1 && program.weeks.length <= MAX_AI_BLOCK_WEEKS && program.clientId}
        <a
          class="btn ghost small"
          href={`/clients/${program.clientId}/generate?fill=${program.id}`}
          title={dirty ? "Save your changes first — the AI reads the saved program" : "The AI rewrites every week after the last logged one; logged weeks and the ones before stay"}
          aria-disabled={dirty}
          class:disabled={dirty}
          onclick={(e) => { if (dirty) e.preventDefault(); }}
        >Fill remaining weeks with AI</a>
      {/if}
      {#if editable}
        <button class="btn ghost small" onclick={applyDeload} title={weekDeloaded ? `Restore week ${currentWeek.week} as it was before the deload` : `Deload week ${currentWeek.week}: ${deloadRulesText(deload)}`}>{weekDeloaded ? "Undo deload" : "Deload this week"}</button>
        <button class="btn ghost small" aria-expanded={showPhasing} onclick={() => (showPhasing = !showPhasing)}>Block phasing {showPhasing ? "▴" : "▾"}</button>
      {/if}
    </div>

    {#if editable && showPhasing}
      {#key phasingResets}
        <PhasingEditor
          bind:phasing={program.phasing}
          weeksCount={program.weeks.length}
          weeks={program.weeks}
          {oneRepMaxes}
          onapply={(next) => { if (program) program.weeks = $state.snapshot(next) as ProgramWeek[]; }}
        />
      {/key}
    {/if}

    {#if editable}
      <div class="cal-bar">
        {#if program.weeks.length > 1}
          <Segmented
            label="Changes apply to"
            lead="Changes apply to"
            value={changesLater ? "later" : "one"}
            onchange={(v) => { closeEditors(); changesLater = v === "later"; }}
            items={[
              {
                value: "later",
                label: `W${currentWeek.week} and later`,
                title: `Sessions and exercises you add, remove, rename or swap, and moves on the calendar, also go to the later ${currentWeek.rotation ? `${currentWeek.rotation} ` : ""}weeks the client hasn't finished. Sets and loads stay per week.`,
              },
              { value: "one", label: `W${currentWeek.week} only` },
            ]}
          />
        {/if}
        <span class="grow"></span>
        {#if trainingDays.length > 0}
          <button class="btn ghost small" onclick={autoPlace} title="Spread sessions over the client's exercise and run days (heavy lower days away from key runs, long run on its day), for every week">Auto-place</button>
        {/if}
        {#if currentWeek.sessions.length < 14}
          <button class="btn ghost small" onclick={() => addNewSession("exercises")}>+ Exercise session</button>
          <button class="btn ghost small" onclick={() => addNewSession("cardio")}>+ Cardio session</button>
        {/if}
      </div>
    {/if}

    <WeekCalendar sessions={currentWeek.sessions} {editable} {focusOf} {selected} onplace={place} onselect={select} />

    <div class="sessions-grid">
      {#each ordered as { s, day } (s.id)}
        {@const si = indexOf(s.id)}
        <section class="panel" class:sel={selected === s.id} id="sess-{s.id}">
          <div class="panel-head">
            <span class="eyebrow">{DAY_NAMES[day]} · {sessionTag(s)}{#if s.typeName}{" · "}<span class="stype">{s.typeName}</span>{/if}</span>
            {#if s.kind === "exercises"}<span class="subtle">{formatPatternBalance(sessionsPatternBalance([s], patternOf))}{prepNote(s)}</span>{/if}
          </div>

          <div class="panel-body exlist">
            <div class="session-block">
              {#if openSession === s.id}
                <SessionHeadEditor
                  bind:session={currentWeek.sessions[si]}
                  {types}
                  oncreatetype={addType}
                  ontype={(t) => labelAllWeeks(sessionKey(currentWeek.sessions[si]), t)}
                  nextSeqFor={(kind) => nextSeq(currentWeek.sessions.filter((x) => x.id !== s.id), kind)}
                  onday={(wd) => place(s.id, wd, 99)}
                  onremove={() => { if (currentWeek) setWeek(removeSession($state.snapshot(currentWeek) as ProgramWeek, s.id)); closeEditors(); }}
                  onclose={closeEditors}
                  {modalities}
                  templates={cardioTemplates}
                  zones={zonesFor(s)}
                  onsavetemplate={saveCardioTemplate}
                />
              {:else}
                <div class="session-header">
                  <h3>{s.name}</h3>
                  {#if editable}
                    <button class="edit-link" onclick={() => openSessionEditor(s.id)}>Edit session</button>
                  {/if}
                </div>
                {#if s.notes}<p class="subtle sess-notes">{s.notes}</p>{/if}
              {/if}
              {#if logsOf(s.id).length > 0}
                <div class="logged">
                  <span class="logged-tag"><Icon name="check" size={12} /> Logged {logsOf(s.id).map((l) => logDateLabel(l.date)).join(", ")}
                    {#if logsOf(s.id).some((l) => l.loggedBy === "client")}<span class="pill neutral by-client" title="Logged by the client in the portal">by client</span>{/if}</span>
                  {#each logsOf(s.id) as l (l.id)}
                    {#if s.kind === "cardio" && l.cardio}<span class="log-chip">{cardioLine(l.cardio)}</span>{/if}
                    {#if l.notes}<p class="subtle log-notes">{l.notes}</p>{/if}
                    {@const extras = s.kind === "exercises" ? extraSets(l, s.exercises) : []}
                    {#if extras.length > 0}
                      <p class="subtle log-notes">
                        Also logged ({logDateLabel(l.date)}): {extras.map((x) => `${nameOf(x.exerciseId)} ${loggedSetLabel(x, false)}`).join(" · ")}
                      </p>
                    {/if}
                  {/each}
                </div>
              {/if}

              {#if s.kind === "cardio"}
                {#if s.cardio && openSession !== s.id}
                  <div class="cardio-display">
                    <span class="cond-chip">
                      <Icon name="pulse" />
                      {cardioLine(s.cardio)}
                    </span>
                  </div>
                {/if}
              {:else}
                {#snippet exitem(e: (typeof s.exercises)[number], ei: number, first: boolean, last: boolean)}
                  {#if openExercise === e.id}
                    <ExerciseEditor
                      bind:exercise={currentWeek.sessions[si].exercises[ei]}
                      session={s.exercises}
                      {catalog}
                      oneRepMaxKg={oneRepMaxKg(oneRepMaxes, e.exerciseId)}
                      oncreate={addToLibrary}
                      tag={groupTag(s.exercises, ei)}
                      canMoveUp={!first}
                      canMoveDown={!last}
                      onmoveup={() => setExercises(si, moveUnit(s.exercises, ei, -1))}
                      onmovedown={() => setExercises(si, moveUnit(s.exercises, ei, 1))}
                      onremove={() => { setExercises(si, s.exercises.filter((_, j) => j !== ei)); closeEditors(); }}
                      block={blockOf(e)}
                      onblock={blockOf(e) === "prep"
                        ? mainWork(s.exercises).length < MAX_MAIN_EXERCISES ? () => setExercises(si, moveToBlock(s.exercises, ei, "main")) : undefined
                        : movementPrep(s.exercises).length < MAX_PREP_EXERCISES && mainWork(s.exercises).length > 1
                          ? () => setExercises(si, moveToBlock(s.exercises, ei, "prep"))
                          : undefined}
                      onlink={ei < s.exercises.length - 1 && blockOf(s.exercises[ei + 1]) === blockOf(e) ? () => setExercises(si, linkWithNext(s.exercises, ei)) : undefined}
                      onunlink={() => setExercises(si, unlink(s.exercises, ei))}
                      onclose={closeEditors}
                      oninvalid={(m) => (editorIssue = m && `Week ${currentWeek.week} · ${sessionLabel(s)}: ${exerciseIssue(e.exerciseName ?? "Exercise", m)}`)}
                    />
                  {:else}
                    {@const patterns = patternsOf(e.exerciseId)}
                    {@const pattern = primaryPattern({ movementPatterns: patterns })}
                    <div class="exblock" class:editable>
                      <div class="exhead">
                        {#if e.group}<GroupTag tag={groupTag(s.exercises, ei) ?? e.group} />{/if}
                        {#if e.role}<RoleChip role={e.role} />{/if}
                        {#if editable}
                          <button class="exname" onclick={() => openExerciseEditor(e.id)} title="Edit {e.exerciseName}">{e.exerciseName}</button>
                        {:else}
                          <strong>{e.exerciseName}</strong>
                        {/if}
                        {#if pattern && pattern in MOVEMENT_PATTERN_INFO && pattern !== "no_pattern"}
                          {@const p = pattern as MovementPattern}
                          <span class="mp-tag" title={patternTitle(patterns)}>{MOVEMENT_PATTERN_INFO[p].label}</span>
                        {/if}
                      </div>
                      {#if e.notes}<p class="subtle exnotes">{e.notes}</p>{/if}
                      <SetChips sets={e.prescribedSets} oneRepMaxKg={oneRepMaxKg(oneRepMaxes, e.exerciseId)} />
                      {#each logsOf(s.id) as l (l.id)}
                        {@const done = setsForExercise(l, e)}
                        {#if done.length > 0}
                          <div class="logline">
                            <span class="log-date">{logDateLabel(l.date)}</span>
                            {#each done as d, di (di)}<span class="log-chip">{loggedSetLabel(d, isTimed(e))}</span>{/each}
                          </div>
                        {/if}
                      {/each}
                    </div>
                  {/if}
                {/snippet}
                {#snippet blockUnits(us: ExerciseUnit<(typeof s.exercises)[number]>[])}
                  {#each us as u, ui (u.items[0].id)}
                    {@const lastUnit = ui === us.length - 1}
                    {#if u.group}
                      {@const g = u.group}
                      <ExerciseGroup
                        group={g}
                        count={u.items.length}
                        rounds={u.items[0].prescribedSets.length}
                        onrounds={editable ? (n) => setExercises(si, setGroupRounds(s.exercises, g, n)) : undefined}
                        canMoveUp={ui > 0}
                        canMoveDown={!lastUnit}
                        onmoveup={editable ? () => setExercises(si, moveUnit(s.exercises, u.start, -1, "unit")) : undefined}
                        onmovedown={editable ? () => setExercises(si, moveUnit(s.exercises, u.start, 1, "unit")) : undefined}
                        onungroup={editable ? () => setExercises(si, dissolveGroup(s.exercises, g)) : undefined}
                      >
                        {#each u.items as e, k (e.id)}
                          {@render exitem(e, u.start + k, k === 0, k === u.items.length - 1)}
                        {/each}
                      </ExerciseGroup>
                    {:else}
                      {@render exitem(u.items[0], u.start, ui === 0, lastUnit)}
                    {/if}
                    {#if !lastUnit}<hr class="divider" />{/if}
                  {/each}
                {/snippet}
                {@const units = exerciseUnits(s.exercises)}
                {@const prepUnits = units.filter((u) => blockOf(u.items[0]) === "prep")}
                {@const prepCount = movementPrep(s.exercises).length}
                {@const mainCount = s.exercises.length - prepCount}
                {#if prepUnits.length > 0}
                  <div class="prep-block">
                    <BlockHead block="prep" />
                    {@render blockUnits(prepUnits)}
                    {#if editable && prepCount < MAX_PREP_EXERCISES}
                      <button class="add-link" onclick={() => addExerciseTo(si, "prep")}>+ Movement prep</button>
                    {/if}
                  </div>
                  <BlockHead block="main" />
                {/if}
                {@render blockUnits(units.filter((u) => blockOf(u.items[0]) !== "prep"))}
                {#if editable}
                  <div class="add-row">
                    {#if mainCount < MAX_MAIN_EXERCISES}
                      <button class="add-link" onclick={() => addExerciseTo(si, "main")}>+ Exercise</button>
                    {/if}
                    {#if prepUnits.length === 0}
                      <button class="add-link quiet" onclick={() => addExerciseTo(si, "prep")} title="Warm-up and activation before the main work — never counted">+ Movement prep</button>
                    {/if}
                  </div>
                {/if}
              {/if}
            </div>
          </div>
        </section>
      {/each}
    </div>

    {#if (logView?.otherByWeek.get(weekIndex)?.length ?? 0) > 0}
      <section class="panel other-logs">
        <div class="panel-head"><span class="eyebrow">Also logged in week {currentWeek.week}</span></div>
        <div class="panel-body exlist">
          {#each logView?.otherByWeek.get(weekIndex) ?? [] as l (l.id)}
            <div class="logline">
              <span class="log-date">{logDateLabel(l.date)}</span>
              {#if l.kind === "cardio"}
                <span class="log-chip">{cardioLine(l.cardio)}</span>
              {:else}
                {#each l.sets as d, di (di)}<span class="log-chip">{nameOf(d.exerciseId)} {loggedSetLabel(d, false)}</span>{/each}
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}
  {/if}

  {#if copyToast || dirty}
    <div class="dock" {@attach liftFeedback}>
      {#if copyToast}
        <div class="copy-toast" role="status">
          <Icon name="layers" />
          <span class="msg">{copyToast.text}</span>
          {#if copyToast.before}
            <button type="button" class="btn small" onclick={undoCopy}><Icon name="undo" />Undo</button>
          {/if}
          <button type="button" class="btn ghost small icon" aria-label="Dismiss" onclick={() => (copyToast = null)}><Icon name="x" /></button>
        </div>
      {/if}

      {#if dirty}
        <div class="savebar" role="region" aria-label="Unsaved changes">
          <span class="savemsg">
            {#if !validation.ok}
              <span class="gate-error">{validation.message}</span>
            {:else if saveError}
              <span class="gate-error">Save failed: {saveError}</span>
            {:else}
              Unsaved changes · saving makes v{program.version + 1}{program.status === "active" ? " and updates the client portal" : ""}.
            {/if}
          </span>
          {#if stale}
            <ConfirmButton label="Reload latest" confirmLabel="Drop my edits and reload?" variant="primary" armedVariant="danger" small onconfirm={reloadLatest} />
          {:else}
            <!-- Two taps (a whole editing session goes) and kept apart from Save changes for thumbs. -->
            <ConfirmButton label="Discard" confirmLabel="Discard all edits?" variant="ghost" armedVariant="danger" small class="discard" disabled={saving} onconfirm={discard} />
            <button class="btn primary small" onclick={save} disabled={saving || !validation.ok}>{saving ? "Saving…" : "Save changes"}</button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}
{/if}

<LeaveGuard guard={leaveGuard} />
{#if program}
  <StartDateDialog mode={startDialog} program={program as SignalProgram} {logs} onconfirm={setStart} onclose={() => (startDialog = null)} />
{/if}

<style>
  h1 { display: flex; align-items: center; gap: 10px; }
  .actions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .lib-state { font-size: 13px; }
  .lib-link { font-size: 13px; color: var(--muted); text-decoration: none; }
  .lib-link:hover { text-decoration: underline; }

  .mark-form {
    display: grid;
    grid-template-columns: 2fr 1fr 2fr;
    gap: 14px;
    align-items: start;
    padding: 14px 18px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    margin-bottom: 14px;
    background: var(--panel, transparent);
  }
  .mark-actions { grid-column: 1 / -1; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .mark-actions .hint { margin: 0; }
  @media (max-width: 980px) { .mark-form { grid-template-columns: 1fr; } }
  .readonly-note { margin: 0; }
  .for-member { display: none; }
  .for-member strong { color: var(--ink); font-weight: 600; }
  @media (max-width: 860px), (display-mode: standalone) { .for-member { display: inline; } }
  .hint { color: var(--muted); margin: -8px 0 16px; max-width: 640px; }

  .tab-dates { margin-left: 4px; font-weight: 500; }
  .tab-btn.past:not(.active) { color: var(--faint); }
  .tab-now {
    margin-left: 6px;
    vertical-align: 1px;
    font: 600 10.5px/1 var(--font-ui);
    padding: 2px 6px;
    border-radius: 99px;
    background: var(--pulse-now-bg);
    color: var(--blue);
  }
  :global(.ended-note) { margin: -6px 0 14px; max-width: 640px; }
  .tab-letter { margin-left: 4px; font: 500 11px var(--font-mono); color: var(--muted); }
  .tab-btn.active .tab-letter { color: inherit; }
  /* The copy toast and the save bar float together, toast on top, so the toast clears the bar at any height. */
  .dock {
    position: sticky;
    bottom: 12px;
    z-index: 6;
    margin-top: 18px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .dock > :global(.savebar) { position: static; margin-top: 0; }
  /* 16 px from Save changes with the bar's 8 px gap. */
  .savebar :global(.discard) { margin-right: 8px; }
  /* Phones: the message takes its own line, so the armed "Discard all edits?" never squeezes it. */
  @media (max-width: 560px) {
    .dock .savebar { flex-wrap: wrap; }
    .dock .savemsg { flex-basis: 100%; }
    .savebar :global(.discard) { margin-left: auto; }
  }
  @media (max-width: 700px) { .dock { bottom: 60px; } }
  /* Same look as the draft edit dock's toast. */
  .copy-toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--well);
    box-shadow: var(--shadow-overlay);
    font-size: 13px;
  }
  .copy-toast > :global(svg) { width: 14px; height: 14px; color: var(--muted); flex: none; }
  .copy-toast .msg { flex: 1 1 0; min-width: 0; overflow-wrap: anywhere; }
  .btn.disabled { opacity: 0.55; cursor: default; }
  /* Loading stand-ins keep the text lines' heights. */
  .sk-crumbs { display: flex; align-items: center; height: 13px; margin-bottom: 4px; }
  .sk-line { display: flex; align-items: center; min-height: 1lh; }
  .sk-tab { display: flex; align-items: center; height: 28px; cursor: default; }
  .weeks-row { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 16px; margin: 0 0 16px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  .week-tabs { display: flex; gap: 6px; overflow-x: auto; flex: 1 1 auto; min-width: 0; }
  .tab-btn {
    border: none;
    background: none;
    padding: 6px 14px;
    font: 600 13px var(--font-ui);
    color: var(--muted);
    cursor: pointer;
    border-radius: var(--radius);
    white-space: nowrap;
    flex: none;
  }
  @media (max-width: 700px) { .tab-btn { padding: 6px 10px; } }
  .tab-btn.active {
    background: var(--well);
    color: var(--ink);
  }
  .tab-btn:hover:not(.active) {
    background: var(--well-2);
  }

  .sessions-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 18px; align-items: start; }

  .exlist { display: flex; flex-direction: column; gap: 12px; }
  .gate-error { color: var(--bad); }
  .session-block { display: flex; flex-direction: column; gap: 8px; }
  .session-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .session-header h3 { margin: 0; font: 600 13px var(--font-ui); color: var(--ink); }
  .cardio-display { margin: 2px 0 4px; }

  .exblock .exhead { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; }

  .mp-tag {
    display: inline-flex;
    align-items: center;
    font: 500 11px/1 var(--font-ui);
    padding: 1px 6px;
    border-radius: 99px;
    border: 1px solid var(--line);
    background: var(--well);
    color: var(--muted);
    white-space: nowrap;
    margin-left: 6px;
  }
  .cond-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font: 500 12px var(--font-ui);
    color: var(--muted);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 2px 10px;
    max-width: 320px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cond-chip :global(svg) { width: 10px; height: 10px; fill: currentColor; flex: none; }
  .divider { border: none; border-top: 1px solid var(--line); margin: 8px 0; }
  .week-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: -6px 0 14px; }
  .balance { margin: 0 auto 0 0; color: var(--muted); }
  .cal-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0 0 8px; }
  .grow { flex: 1; }
  .eyebrow { font: 500 11.5px var(--font-mono); color: var(--muted); text-transform: uppercase; letter-spacing: 0.02em; margin-right: auto; }
  .stype { color: var(--ink); }
  .panel.sel { border-color: var(--focus); }
  .panel { scroll-margin-top: 16px; }
  .session-header .edit-link { margin-left: auto; }
  .edit-link, .add-link {
    border: none;
    background: none;
    padding: 2px 0;
    font: 500 12px var(--font-ui);
    color: var(--blue);
    cursor: pointer;
  }
  .edit-link:hover, .add-link:hover { text-decoration: underline; }
  .sub-link { margin-left: 6px; font-size: inherit; }
  .add-link { align-self: flex-start; }
  .add-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: baseline; }
  .add-link.quiet { color: var(--muted); }
  .prep-block { display: flex; flex-direction: column; gap: 8px; padding: 8px 10px; margin: 0 -10px 4px; border-radius: var(--radius); background: var(--well); }
  .sess-notes, .exnotes { margin: 0; font-size: 12.5px; }

  /* What was done, under what was planned */
  /* Logged sessions: a green check + count, set apart from the A/B letter by the tint and a gap. */
  .tab-logs {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 8px;
    vertical-align: 1px;
    font: 600 10.5px/1 var(--font-mono);
    padding: 2px 6px 2px 4px;
    border-radius: 99px;
    background: var(--good-bg);
    color: var(--good);
  }
  .tab-logs :global(svg) { width: 11px; height: 11px; stroke-width: 2.4; }
  .logged { display: flex; flex-direction: column; gap: 4px; }
  .logged-tag { display: inline-flex; align-items: center; gap: 5px; font: 600 11.5px var(--font-ui); color: var(--good, var(--muted)); }
  .log-notes { margin: 0; font-size: 12px; white-space: pre-line; }
  .logline { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 6px; margin-top: 6px; }
  .log-date { font: 500 11px var(--font-ui); color: var(--muted); min-width: 72px; }
  .log-chip {
    font: 500 11.5px/1.5 var(--font-mono, ui-monospace, monospace);
    padding: 0 6px;
    border-radius: 4px;
    background: var(--well);
    color: var(--ink);
  }
  .other-logs { margin-top: 18px; }
  .exnotes { margin: -4px 0 8px; }
  .exname {
    border: none;
    background: none;
    padding: 0;
    font: 600 14px var(--font-ui);
    color: var(--ink);
    cursor: pointer;
    text-align: left;
  }
  .exblock.editable { border-radius: var(--radius); margin: 0 -8px; padding: 4px 8px; }
  .exblock.editable:hover { background: var(--well); }
  .exname:hover { text-decoration: underline; text-decoration-color: var(--faint); }

  @media (max-width: 980px) {
    .sessions-grid { grid-template-columns: minmax(0, 1fr); }
  }

  /* Touch: 44 px targets. Week tabs grow; the text links keep their look and get an invisible hit area. */
  @media (pointer: coarse) {
    .tab-btn { min-height: 44px; }
    .edit-link, .add-link, .exname { position: relative; }
    .edit-link::after, .add-link::after, .exname::after {
      content: "";
      position: absolute;
      inset: -14px -6px;
    }
  }
</style>
