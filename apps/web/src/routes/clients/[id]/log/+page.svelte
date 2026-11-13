<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { browser } from "$app/environment";
  import { createLeaveGuard } from "$lib/leaveGuard.svelte";
  import LeaveGuard from "$lib/ui/LeaveGuard.svelte";
  import { api } from "$lib/api";
  import { fmtSet } from "$lib/format";
  import { buildClientStrip, localIso, stripWeeks } from "$lib/overview";
  import { nextToLog, recapCounts, recapNotes, saveRecap, type RecapNote } from "$lib/logRecap";
  import SaveRecap, { type NextState } from "$lib/components/SaveRecap.svelte";
  import {
    DuplicateLogError,
    type ClientDto,
    type ExerciseDto,
    type ExistingLogDto,
    type ProgramDto,
    type ProgramSessionDto,
    type SavedLogDto,
    type SessionLogDto,
    type SessionLogInput,
  } from "$lib/api/types";
  import { groupKind, logToInput, oneRepMaxKg, sessionTag, sessionsByWeekday, timedExerciseIds, timedSlotIds, type Equipment, type ExerciseRole } from "@pt/shared";
  import { SvelteMap, SvelteSet } from "svelte/reactivity";
  import { chipFor, coachSheet, historySets, suggestionNote, type Suggestion } from "$lib/logCoach";
  import { dateForSession, linkedPick, openingPick, sessionForDate, type SessionPick } from "$lib/logDate";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import OverflowMenu, { type OverflowItem } from "$lib/ui/OverflowMenu.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import SkeletonHead from "$lib/ui/SkeletonHead.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import ClientLoadError from "$lib/components/ClientLoadError.svelte";
  import Note from "$lib/ui/Note.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import RoleChip from "$lib/components/RoleChip.svelte";
  import GroupTag from "$lib/components/GroupTag.svelte";
  import ExercisePicker from "$lib/components/ExercisePicker.svelte";
  import LogStepper from "$lib/components/LogStepper.svelte";
  import { feedbackMode } from "$lib/feedback/mode.svelte";
  import {
    asPrescribed,
    prescriptionOf,
    blocksOf,
    blockIndexOf,
    roundOrder,
    cellNumber,
    isBlank,
    isSwapped,
    lastBySlot,
    loggedBySession,
    isDirty,
    parseDraft,
    draftJson,
    draftKey,
    prescribedSummary,
    previewBlocks,
    type PreviewBlock,
    rowFilled,
    type PrescribedSummary,
    rowLabels,
    rowsToSave,
    serverFieldErrors,
    sheetCounts,
    slotIds,
    swapSlot,
    toLoggedSet,
    validateRows,
    withExtraSet,
    withoutExtra,
    MAX_SETS,
    cellOrder,
    extrasHoldValues,
    fillDown,
    isCopied,
    markTyped,
    nextCell,
    setSkipReason,
    skipExercise,
    unskipExercise,
    SKIP_REASONS,
    SKIP_REASON_LABEL,
    type SkipReason,
    type Cell,
    type FieldErrors,
    type LastSet,
    type Prescription,
    type SheetField,
    type SheetRow,
  } from "$lib/logSheet";
  import {
    EMPTY_READINESS,
    FLAG_KINDS,
    FLAG_LABEL,
    FLAG_NOTE_MAX,
    READINESS_SCALES,
    painExercises,
    readinessInput,
    sessionFlags,
    setFlagNote,
    tapScale,
    toggleFlag,
    type ExerciseFlags,
    type FlagKind,
    type ReadinessForm,
  } from "$lib/logFlags";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  /** First load failed before the client arrived (e.g. 404): show that, not an endless skeleton. */
  let loadError = $state<unknown>(null);
  const onLoadError = (e: unknown) => {
    if (client !== null) throw e;
    loadError = e;
  };
  let program = $state<ProgramDto | null>(null);
  let pastLogs = $state<SessionLogDto[]>([]);
  let catalog = $state<ExerciseDto[]>([]);
  const catalogById = $derived(new Map(catalog.map((e) => [e.id, e])));
  /** id → name from the program doc, for exercises outside the visible catalog. */
  const programNames = $derived(
    new Map(
      (program?.weeks ?? []).flatMap((w) =>
        w.sessions.flatMap((s) => s.exercises.flatMap((e) => (e.exerciseName ? [[e.exerciseId, e.exerciseName] as const] : [])))
      )
    )
  );
  const nameOf = (exerciseId: string) => catalogById.get(exerciseId)?.name ?? programNames.get(exerciseId) ?? exerciseId;

  let selectedWeekNumber = $state<number>(1);
  let sessionId = $state<string>("");
  const today = localIso(new Date());
  let date = $state(today);
  /** Explains the last automatic date or session pick, under the selects. */
  let pickNote = $state<string | null>(null);
  /** Energy, sleep and soreness before the session — all optional. */
  let readiness = $state<ReadinessForm>({ ...EMPTY_READINESS });
  /** Narrow sheet only: pickers and readiness fold to one line each so the first set sits near the top. */
  let pickersOpen = $state(false);
  let readinessOpen = $state(false);
  const readinessSummary = $derived(
    READINESS_SCALES.filter((sc) => readiness[sc.field] != null)
      .map((sc) => `${sc.label} ${readiness[sc.field]}`)
      .join(" · ")
  );
  /** programExerciseId → its Pain / Technique flag. */
  let flags = $state<ExerciseFlags>({});
  /** Slot whose flag menu is open. */
  let flagOpen = $state<string | null>(null);
  let notes = $state("");
  let saving = $state(false);
  /** The last save's recap and who's next — shown in the save bar until the sheet is touched again. */
  let recap = $state<{ title: string; counts: string | null; notes: RecapNote[] } | null>(null);
  let next = $state<NextState>({ state: "loading" });
  /** The log this page just saved: its own "Already logged" warning would only echo the save. */
  let savedLogId = $state<string | null>(null);
  let error = $state<string | null>(null);
  let fieldErrors = $state<FieldErrors>({});

  interface Row extends SheetRow {
    /** null = an extra set: nothing was prescribed. */
    rx: Prescription | null;
    timed: boolean;
    last: LastSet | null;
  }

  let rows = $state<Row[]>([]);
  /** Phone width: the exercise card on screen. */
  let current = $state(0);
  /** Slot whose swap picker is open. */
  let swapOpen = $state<string | null>(null);

  interface CardioForm {
    modality: string;
    durationMin: Cell;
    hrZone: string;
    intensity: string;
    distanceKm: Cell;
    rpe: Cell;
  }
  let cardioForm = $state<CardioForm>({
    modality: "",
    durationMin: "",
    hrZone: "",
    intensity: "",
    distanceKm: "",
    rpe: "",
  });

  const slots = $derived(program ? slotIds(program) : new Map<string, string>());
  /** "Last" = the last time this prescribed slot was done (same session, same lift, same set). */
  const lastSets = $derived(program ? lastBySlot(program, pastLogs) : new Map<string, LastSet>());

  const counts = $derived(sheetCounts(rows));
  const tally = $derived(
    [`${counts.logged} logged`, counts.skipped ? `${counts.skipped} skipped` : "", counts.open ? `${counts.open} open` : ""]
      .filter(Boolean)
      .join(" · ")
  );
  /** programSessionId → its logs in this program, newest first. */
  const logged = $derived(program ? loggedBySession(pastLogs, program.id) : new Map<string, never[]>());
  const sessionLogged = $derived(logged.get(sessionId)?.[0] ?? null);
  /** Warn about an earlier log, never about the one just saved here. */
  const loggedNote = $derived(sessionLogged && sessionLogged.id !== savedLogId ? sessionLogged : null);
  const prefillable = $derived(rows.some((r) => !r.skipped && isBlank(r.reps) && r.rx));
  const labels = $derived(rowLabels(rows, nameOf));
  const blocks = $derived(blocksOf(rows));
  /** A card's unique name for its buttons: "Bench back-off", "Row (2nd)". */
  const blockName = (b: { rows: Row[] }) => (labels.get(b.rows[0].key) ?? "").replace(/ (extra )?set \d+/, "");

  const selectedWeek = $derived(
    program?.weeks.find((w) => w.week === selectedWeekNumber) ?? program?.weeks[0] ?? null
  );

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  /** The week's sessions grouped Mon→Sun, unscheduled last as "Any day". */
  const sessionGroups = $derived.by(() => {
    if (!selectedWeek) return [];
    const by = sessionsByWeekday(selectedWeek.sessions);
    return [1, 2, 3, 4, 5, 6, 7, 0]
      .map((day) => ({
        day,
        label: day === 0 ? "Any day" : DAY_NAMES[day - 1],
        items: (by.get(day) ?? []).map((s: ProgramSessionDto) => {
          const done = logged.get(s.id)?.[0];
          return { id: s.id, label: `${sessionTag(s)} · ${s.name}${done ? ` ✓ ${fmtDay(done.date)}` : ""}`, session: s };
        }),
      }))
      .filter((g) => g.items.length > 0);
  });
  const weekSessionsList = $derived(sessionGroups.flatMap((g) => g.items));

  const selectedSession = $derived(
    sessionId ? weekSessionsList.find((ws) => ws.id === sessionId)?.session ?? null : null
  );
  const isCardioSession = $derived(selectedSession?.kind === "cardio");
  /** programExerciseId → its role in the session, for the card head. */
  const roles = $derived(
    new Map<string, ExerciseRole | undefined>((selectedSession?.exercises ?? []).map((e) => [e.id, e.role]))
  );

  const isBodyweight = (exerciseId: string) => catalogById.get(exerciseId)?.equipment === "bodyweight";
  const equipmentOf = (exerciseId: string) => catalogById.get(exerciseId)?.equipment as Equipment | undefined;

  // ---- Coaching: suggested loads and live feedback, recomputed from the sheet (nothing stored) ----

  const history = $derived.by(() => {
    const slots = program ? timedSlotIds(program) : new Set<string>();
    const lifts = program ? timedExerciseIds(program) : new Set<string>();
    return historySets(pastLogs, (s) => (!!s.programExerciseId && slots.has(s.programExerciseId)) || lifts.has(s.exerciseId));
  });
  const coach = $derived(coachSheet(rows, { equipmentOf, history, stored: client?.oneRepMaxes, now: date }));
  /** Rows whose suggestion is explained (chip or "suggested" link tapped). */
  const sourceOpen = new SvelteSet<string>();
  /** Rows filled from a "→" chip: what was used and where it came from, until the cell is edited. */
  const usedSuggestion = new SvelteMap<string, Suggestion>();

  /** The chip counts as typing the load: the cell fills (and fills down, like a typed kg). */
  function useSuggestion(key: string, s: Suggestion) {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    r.weight = s.kg;
    edited(key, "weight");
    usedSuggestion.set(key, s);
    sourceOpen.delete(key);
    fillKg(key);
    // The Use button leaves with its line: carry on from the cell it filled. Not on touch,
    // where focusing a cell would throw the keyboard over the sheet.
    if (!matchMedia("(pointer: coarse)").matches) void focusCell(key, "weight");
  }

  function toggleSource(key: string) {
    if (sourceOpen.has(key)) sourceOpen.delete(key);
    else sourceOpen.add(key);
  }

  /** Prescribed rows for the selected session, nothing entered yet. */
  function freshRows(): Row[] {
    const session = weekSessionsList.find((ws) => ws.id === sessionId)?.session;
    // a superset's sets run round by round: A1 set 1, A2 set 1, A1 set 2…
    return roundOrder(
      session?.exercises.flatMap((e) =>
        e.prescribedSets.map((ps): Row => {
          const rx: Prescription = prescriptionOf(ps, oneRepMaxKg(client?.oneRepMaxes, e.exerciseId));
          const last = lastSets.get(`${slots.get(e.id)}#${ps.setNumber}`) ?? null;
          return {
            key: `${e.id}-${ps.setNumber}`,
            exerciseId: e.exerciseId,
            slotExerciseId: e.exerciseId,
            programExerciseId: e.id,
            setNumber: ps.setNumber,
            type: ps.type,
            prescribedReps: asPrescribed(rx, { bodyweight: false, swapped: false, last: null }).reps,
            rx,
            timed: ps.durationSeconds != null,
            last,
            weight: "",
            reps: "",
            rpe: "",
            ...(e.group ? { group: e.group } : {}),
          };
        })
      ) ?? []
    );
  }

  /** Reset the sheet to the selected session — or to its draft, when one was left on this device. */
  function loadSession() {
    recap = null;
    savedLogId = null;
    error = null;
    fieldErrors = {};
    current = 0;
    swapOpen = null;
    skipBefore.clear();
    sourceOpen.clear();
    usedSuggestion.clear();
    draftSavedAt = null;
    notes = "";
    readiness = { ...EMPTY_READINESS };
    flags = {};
    flagOpen = null;
    if (!program || !sessionId) {
      rows = [];
      return;
    }
    const session = weekSessionsList.find((ws) => ws.id === sessionId)?.session;
    if (session?.kind === "cardio") {
      rows = [];
      prefillCardio(session.cardio);
      return;
    }
    const fresh = freshRows();
    const draft = browser ? parseDraft(localStorage.getItem(draftKey(id, sessionId)), fresh) : null;
    if (draft) {
      // the program's groups win over the draft's (it may predate a superset)
      const groupOf = new Map(fresh.map((r) => [r.programExerciseId, r.group]));
      rows = draft.rows.map((r) => ({ ...r, group: groupOf.get(r.programExerciseId) }));
      notes = draft.notes;
      readiness = draft.readiness;
      flags = draft.flags;
      date = draft.date;
      draftSavedAt = draft.savedAt;
    } else {
      rows = fresh;
    }
  }

  // ---- Drafts: the sheet is kept on this device until it's saved or discarded ----

  let draftSavedAt = $state<string | null>(null);
  const dirty = $derived(isDirty(rows, notes, readiness, flags));

  $effect(() => {
    if (!program || !sessionId || isCardioSession) return;
    const key = draftKey(id, sessionId);
    if (!dirty) {
      localStorage.removeItem(key);
      return;
    }
    // Stringifying reads every cell, so any edit re-runs this.
    const body = draftJson({ rows, notes, readiness, flags, date, savedAt: new Date().toISOString() });
    try {
      localStorage.setItem(key, body);
    } catch {
      // Storage full or blocked: the unsaved-work prompts still guard the sheet.
    }
  });

  function discardDraft() {
    if (sessionId) localStorage.removeItem(draftKey(id, sessionId));
    loadSession();
    announce = "Draft discarded.";
  }

  // ---- Unsaved-work guard ----

  const sessionName = () => selectedSession?.name ?? "this session";

  /** True when there's nothing to lose, or the trainer agrees to drop it (and its draft). */
  function confirmDiscard(): boolean {
    if (!dirty) return true;
    if (!confirm(`Discard the sets you've entered for ${sessionName()}?`)) return false;
    if (sessionId) localStorage.removeItem(draftKey(id, sessionId));
    return true;
  }

  // ---- Date ↔ session: each change handler moves the other, so they can't loop ----

  const weekdayOf = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short" });
  const sessionTitle = (sid: string) =>
    program?.weeks.flatMap((w) => w.sessions).find((s) => s.id === sid)?.name ?? "the session";

  function pickText(p: SessionPick, on: string): string {
    const name = sessionTitle(p.sessionId);
    const day = weekdayOf(on);
    switch (p.why) {
      case "scheduled":
        return `Picked ${name}: scheduled ${day}, not logged yet.`;
      case "earlier":
        return `Picked ${name}: nothing open on ${day}, so the latest open session earlier in week ${p.week}.`;
      case "any-day":
        return `Picked ${name}: an any-day session not logged yet — nothing else is open in week ${p.week}.`;
      case "logged":
        return `Picked ${name}: scheduled ${day}, already logged.`;
      case "first":
        return `Picked ${name}: nothing scheduled on ${day}, so the first session of week ${p.week}.`;
      case "linked":
        return `Opened ${name} for ${day} from the training week.`;
    }
  }

  /** Move the date to the picked session's scheduled day — unless a restored draft brought its own. */
  function dateFromSession() {
    if (!program || draftSavedAt) {
      pickNote = null;
      return;
    }
    const d = dateForSession(program, pastLogs, selectedWeekNumber, sessionId, today);
    if (!d || d.date === date) {
      pickNote = null;
      return;
    }
    date = d.date;
    pickNote = d.capped
      ? `Dated today: ${sessionName()} is scheduled ${fmtLongDay(d.scheduled)}, which hasn't come yet.`
      : `Dated ${fmtLongDay(d.date)}: the day ${sessionName()} is scheduled.`;
  }

  function changeWeek(e: Event & { currentTarget: HTMLSelectElement }) {
    const el = e.currentTarget;
    if (!confirmDiscard()) {
      el.value = String(selectedWeekNumber);
      return;
    }
    // Stay on the same session slot ("Session 2") in the new week when it has one.
    const was = selectedSession;
    selectedWeekNumber = Number(el.value);
    undo = null;
    const same = weekSessionsList.find((ws) => ws.session.kind === was?.kind && ws.session.seq === was?.seq);
    sessionId = (same ?? weekSessionsList[0])?.id ?? "";
    loadSession();
    dateFromSession();
  }

  function changeSession(e: Event & { currentTarget: HTMLSelectElement }) {
    const el = e.currentTarget;
    if (!confirmDiscard()) {
      el.value = sessionId;
      return;
    }
    sessionId = el.value;
    undo = null;
    loadSession();
    dateFromSession();
  }

  function changeDate(e: Event & { currentTarget: HTMLInputElement }) {
    const el = e.currentTarget;
    let next = el.value;
    // Mid-typing ("0202-…") or cleared: wait for a real date; blur puts the old one back.
    if (!next || next < "2000-01-01") return;
    if (next > today) next = today;
    const pick = program ? sessionForDate(program, pastLogs, next) : null;
    if (!pick || (pick.week === selectedWeekNumber && pick.sessionId === sessionId)) {
      date = next;
      el.value = next;
      pickNote = null;
      return;
    }
    if (!confirmDiscard()) {
      el.value = date;
      return;
    }
    selectedWeekNumber = pick.week;
    sessionId = pick.sessionId;
    undo = null;
    loadSession();
    date = next;
    el.value = next;
    pickNote = pickText(pick, next);
  }

  const leaveGuard = createLeaveGuard({
    dirty: () => dirty && !saving,
    prompt: () => ({
      title: "Leave this session?",
      body: `${sessionName()} isn't saved yet. What you've entered stays as a draft on this device, so you can pick it up later.`,
      leaveLabel: "Leave, keep draft",
      danger: false,
    }),
  });

  /** Fill the cardio form from a prescription (or a prior actual). */
  function prefillCardio(c?: ProgramSessionDto["cardio"]) {
    cardioForm = cardioFormOf(c);
  }

  function cardioFormOf(c?: ProgramSessionDto["cardio"]): CardioForm {
    return {
      modality: c?.modality ?? "",
      durationMin: c?.durationMin != null ? String(c.durationMin) : "",
      hrZone: c?.hrZone != null ? String(c.hrZone) : "",
      intensity: c?.intensity ?? "",
      distanceKm: c?.distanceKm != null ? String(c.distanceKm) : "",
      rpe: c?.targetRpe != null ? String(c.targetRpe) : "",
    };
  }

  /** The row with every empty cell filled from what was prescribed. Skips stay skipped. */
  function withPrescribed(r: Row): Row {
    if (r.skipped) return r;
    const p = rxCell(r);
    return {
      ...r,
      weight: isBlank(r.weight) && p.weight != null ? p.weight : r.weight,
      reps: isBlank(r.reps) && p.reps != null ? p.reps : r.reps,
      rpe: isBlank(r.rpe) && p.rpe != null ? p.rpe : r.rpe,
    };
  }

  /** Fill every empty cell of the sets still to do with exactly what was prescribed. */
  function prefill() {
    rows = rows.map(withPrescribed);
  }

  // ---- Saving: duplicate check, confirm dialog, undo ----

  /** Everything the sheet held when a save was sent — Undo puts it back. */
  interface Snapshot {
    rows: Row[];
    notes: string;
    readiness: ReadinessForm;
    flags: ExerciseFlags;
    date: string;
    cardio: CardioForm;
  }

  /** A save on hold while the dialog asks: re-sent with the trainer's duplicate choice. */
  interface Pending {
    input: SessionLogInput;
    /** The exact rows sent, so a 422 can point at cells; null for cardio. */
    sent: Row[] | null;
    count: number;
    snapshot: Snapshot;
  }

  type Ask =
    | {
        mode: "confirm";
        summary: PrescribedSummary | null;
        preview: Row[] | null;
        /** What the log would hold, per card, and how many of those sets were typed. */
        shown: { blocks: PreviewBlock<Row>[]; entered: number } | null;
        pending: Pending | null;
      }
    | { mode: "duplicate"; existing: ExistingLogDto; pending: Pending };

  let ask = $state<Ask | null>(null);
  let dialogEl = $state<HTMLDialogElement>();

  async function openAsk(next: Ask) {
    ask = next;
    await tick();
    if (dialogEl && !dialogEl.open) dialogEl.showModal();
    // Start on the answer, not on the first link in the summary.
    dialogEl?.querySelector<HTMLButtonElement>(".ask-actions .btn.primary")?.focus();
  }

  const closeAsk = () => dialogEl?.close();

  function snapshot(sheetRows: Row[]): Snapshot {
    return {
      rows: $state.snapshot(sheetRows) as Row[],
      notes,
      readiness: $state.snapshot(readiness),
      flags: $state.snapshot(flags),
      date,
      cardio: $state.snapshot(cardioForm),
    };
  }

  function liftingPending(sheetRows: Row[]): Pending {
    const sent = rowsToSave(sheetRows);
    return {
      input: {
        clientId: id,
        programId: program!.id,
        programSessionId: sessionId,
        date,
        ...readinessInput(readiness),
        // Skips and their reasons travel as flags; the notes are the trainer's own words.
        flags: sessionFlags(sheetRows, flags),
        notes: notes.trim() || undefined,
        sets: sent.map(toLoggedSet),
      },
      sent,
      count: sent.length,
      snapshot: snapshot(sheetRows),
    };
  }

  function cardioPending(form: CardioForm): Pending {
    return {
      input: {
        clientId: id,
        programId: program!.id,
        programSessionId: sessionId,
        date,
        ...readinessInput(readiness),
        notes: notes || undefined,
        kind: "cardio",
        cardio: {
          modality: form.modality.trim(),
          durationMin: cellNumber(form.durationMin) ?? null,
          hrZone: cellNumber(form.hrZone) ?? null,
          intensity: form.intensity.trim() === "" ? undefined : form.intensity.trim(),
          distanceKm: cellNumber(form.distanceKm),
          rpe: cellNumber(form.rpe),
        },
        sets: [],
      },
      sent: null,
      count: 1,
      snapshot: { ...snapshot(rows), cardio: { ...form } },
    };
  }

  /** Send a save. A duplicate opens (or turns) the dialog into the Replace / Log again choice. */
  async function send(p: Pending, onDuplicate: "reject" | "replace" | "add" = "reject") {
    saving = true;
    error = null;
    try {
      const saved = await api.logSession({ ...p.input, onDuplicate });
      closeAsk();
      await afterSave(saved, p);
    } catch (err) {
      if (err instanceof DuplicateLogError) {
        saving = false; // the choice buttons must be enabled before focus moves to them
        await openAsk({ mode: "duplicate", existing: err.existing, pending: p });
        return;
      }
      closeAsk();
      fieldErrors = p.sent ? serverFieldErrors((err as { issues?: unknown }).issues, p.sent) : {};
      const flagged = Object.keys(fieldErrors).length > 0;
      error = flagged ? "Fix the highlighted cells, then save." : (err as Error).message;
      if (flagged) await focusFirstInvalid();
    } finally {
      saving = false;
    }
  }

  async function afterSave(saved: SavedLogDto, p: Pending) {
    // The draft is saved now — drop it before the sheet resets, or loadSession would bring it back.
    localStorage.removeItem(draftKey(id, sessionId));
    pastLogs = await api.sessionLogs(id).catch(() => pastLogs);
    loadSession();
    recap = recapOf(p, saved);
    void findNext();
    savedLogId = saved.id;
    undo = {
      logId: saved.id,
      count: p.count,
      cardio: p.sent === null,
      snapshot: p.snapshot,
      replaced: saved.replaced ?? [],
      sessionName: sessionName(),
    };
    undoLeft = UNDO_SECONDS;
  }

  function recapOf(p: Pending, saved: SavedLogDto): NonNullable<typeof recap> {
    const name = sessionName();
    const replaced: RecapNote[] = saved.replaced?.length
      ? [{ tone: "muted", text: `Replaced the ${saved.replaced.map((l) => fmtDay(l.date)).join(", ")} log` }]
      : [];
    if (p.sent === null) return { title: `${name} logged`, counts: "counts toward this week's cardio", notes: replaced };
    const r = saveRecap(p.snapshot.rows, p.snapshot.flags);
    return { title: `${name} logged`, counts: recapCounts(r), notes: [...recapNotes(r, nameOf), ...replaced] };
  }

  /** Who's next today: every active client's week, read like the overview reads it. */
  let nextToken = 0;
  async function findNext() {
    const token = ++nextToken;
    next = { state: "loading" };
    try {
      const weeks = stripWeeks(new Date(), 1);
      const roster = await api.clients();
      const strips = await Promise.all(
        roster.map(async (c) => {
          // This client was just logged, others that aren't training can't be next: no need to fetch them.
          if (c.id === id || c.status !== "active") return buildClientStrip(c, null, [], weeks, today);
          const [detail, logs] = await Promise.all([api.client(c.id), api.sessionLogs(c.id)]);
          return buildClientStrip(c, detail.currentProgram, logs, weeks, today);
        })
      );
      if (token === nextToken) next = { state: "ready", client: nextToLog(strips, id, today) };
    } catch {
      // No roster: the overview link still gets the trainer on.
      if (token === nextToken) next = { state: "ready", client: null };
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (isCardioSession) await saveCardio();
    else await save();
  }

  async function saveCardio() {
    if (!program || !sessionId) return;
    if (cardioForm.modality.trim() === "") {
      error = "Enter the modality — what did they do?";
      return;
    }
    await send(cardioPending(cardioForm));
  }

  async function save() {
    const filled = rowsToSave(rows);
    if (!program || !sessionId) return;
    if (filled.length === 0) {
      error = rows.length > 0 && rows.every((r) => r.skipped)
        ? "Every set is marked skipped — there is nothing to log."
        : "Enter at least one set — kg or reps.";
      return;
    }
    fieldErrors = validateRows(filled);
    if (Object.keys(fieldErrors).length > 0) {
      error = "Fix the highlighted cells, then save.";
      await focusFirstInvalid();
      return;
    }
    await send(liftingPending(rows));
  }

  /** "Did it as prescribed": show what would be logged, and save only on "Log it". */
  async function logAsPrescribed() {
    if (!program || !sessionId) return;
    error = null;
    if (isCardioSession) {
      const form = cardioFormOf(selectedSession?.cardio);
      if (form.modality.trim() === "") {
        cardioForm = form;
        error = "Enter the modality — what did they do?";
        return;
      }
      await openAsk({ mode: "confirm", summary: null, preview: null, shown: null, pending: cardioPending(form) });
      return;
    }
    const preview = rows.map(withPrescribed);
    const summary = prescribedSummary(preview, isBodyweight);
    const filled = rowsToSave(preview);
    const invalid = Object.keys(validateRows(filled)).length > 0;
    // Open AMRAPs or bad cells can't be logged yet; the dialog says what's missing.
    const pending = summary.openAmrap === 0 && summary.sets > 0 && !invalid ? liftingPending(preview) : null;
    await openAsk({ mode: "confirm", summary, preview, shown: previewBlocks(rows, preview), pending });
  }

  /**
   * Put the previewed (prescribed) values in the sheet and the cursor on the
   * first cell still to fill — in one card (`pe`) or anywhere.
   */
  async function fillFirst(field: "weight" | "reps", pe?: string) {
    if (ask?.mode !== "confirm" || !ask.preview) return;
    const preview = ask.preview;
    closeAsk();
    rows = preview;
    const target = rows.find(
      (r) =>
        !r.skipped &&
        (!pe || r.programExerciseId === pe) &&
        (field === "reps" ? !r.extra && isBlank(r.reps) : rowFilled(r) && isBlank(r.weight) && !isBodyweight(r.exerciseId))
    );
    if (target) await focusCell(target.key, field);
  }

  /** Nothing loggable as prescribed (all skipped, or a bad cell): back to the sheet with the save errors shown. */
  async function backToSheet() {
    if (ask?.mode !== "confirm" || !ask.preview) return;
    const preview = ask.preview;
    closeAsk();
    rows = preview;
    await save();
  }

  /** A card's name by its slot, for the summary's links. */
  const blockNameOf = (pe: string) => {
    const own = rows.filter((r) => r.programExerciseId === pe);
    return own.length ? blockName({ rows: own }) : nameOf(pe);
  };

  async function focusCell(key: string, field: SheetField) {
    const r = rows.find((x) => x.key === key);
    if (!r) return;
    current = Math.max(0, blockIndexOf(blocks, r.programExerciseId));
    await tick();
    const input = document.querySelector<HTMLInputElement>(`[data-cell="${CSS.escape(`${key}:${field}`)}"] input`);
    input?.focus();
    input?.select();
  }

  // ---- Sticky Save bar: the floating Feedback button steps up whenever the bar sits under it ----

  let saveBarEl = $state<HTMLElement>();
  /** The pain warning sits right above the bar: once it's in view there, the button clears it too. */
  let painNoteEl = $state<HTMLElement>();
  const isMac = browser && /Mac|iPhone|iPad/.test(navigator.userAgent);

  $effect(() => {
    const bar = saveBarEl;
    const note = painNoteEl;
    if (!bar) return;
    const root = document.documentElement;
    // The idle pill docks in the Save bar here (.fb-dock); feedback mode itself still floats.
    root.style.setProperty("--feedback-idle", "none");
    let raf = 0;
    const update = () => {
      raf = 0;
      const r = bar.getBoundingClientRect();
      const vh = window.innerHeight;
      // The button lives in the bottom 16–56px of the viewport (FeedbackLayer).
      const under = r.top < vh - 16 && r.bottom > vh - 56;
      // Scrolled up, the note hides behind the stuck bar (its top is lower); only above it does it count.
      const top = Math.min(r.top, note?.getBoundingClientRect().top ?? Infinity);
      root.style.setProperty("--feedback-lift", under ? `${Math.ceil(vh - top)}px` : "0px");
    };
    const queue = () => (raf ||= requestAnimationFrame(update));
    update();
    document.addEventListener("scroll", queue, { capture: true, passive: true });
    window.addEventListener("resize", queue);
    const ro = new ResizeObserver(queue);
    ro.observe(bar);
    if (formEl) ro.observe(formEl);
    if (note) ro.observe(note);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("scroll", queue, { capture: true });
      window.removeEventListener("resize", queue);
      ro.disconnect();
      root.style.removeProperty("--feedback-lift");
      root.style.removeProperty("--feedback-idle");
    };
  });

  // ---- Keyboard: Enter walks the cells, Cmd/Ctrl+Enter saves, nothing submits by accident ----

  const order = $derived(cellOrder(rows, isBodyweight));
  const lastCell = $derived(order[order.length - 1]);
  let formEl = $state<HTMLFormElement>();

  function formKeydown(e: KeyboardEvent) {
    if (e.key !== "Enter" || e.isComposing) return;
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      if (!saving) formEl?.requestSubmit();
      return;
    }
    const el = e.target as HTMLElement;
    // Buttons keep their own Enter; every input loses implicit submission.
    if (!(el instanceof HTMLInputElement)) return;
    e.preventDefault();
    const cell = el.closest<HTMLElement>("[data-cell]")?.dataset.cell;
    if (!cell) return;
    const at = cell.lastIndexOf(":");
    const to = nextCell(order, cell.slice(0, at), cell.slice(at + 1) as SheetField, e.shiftKey ? -1 : 1);
    if (to) void focusCell(to.key, to.field);
    else if (!e.shiftKey) document.getElementById("log-save")?.focus();
  }

  // ---- Undo: a short window after each save ----

  const UNDO_SECONDS = 10;
  interface UndoState {
    logId: string;
    count: number;
    cardio: boolean;
    snapshot: Snapshot;
    /** The logs a Replace removed — Undo writes them back. */
    replaced: SessionLogDto[];
    sessionName: string;
  }
  let undo = $state<UndoState | null>(null);
  let undoLeft = $state(UNDO_SECONDS);
  let undoBusy = $state(false);
  /** Polite announcements: undo, discarded drafts. */
  let announce = $state("");

  $effect(() => {
    if (!undo) return;
    const timer = setInterval(() => {
      undoLeft -= 1;
      if (undoLeft <= 0) undo = null;
    }, 1000);
    return () => clearInterval(timer);
  });

  async function undoSave() {
    const u = undo;
    if (!u) return;
    undoBusy = true;
    try {
      // Put back what a Replace removed first: a failure here leaves the new log, never neither.
      for (const old of u.replaced) await api.logSession(logToInput(old));
      await api.deleteSessionLog(u.logId);
      undo = null;
      recap = null;
      savedLogId = null;
      error = null;
      fieldErrors = {};
      rows = u.snapshot.rows;
      notes = u.snapshot.notes;
      readiness = u.snapshot.readiness;
      flags = u.snapshot.flags;
      date = u.snapshot.date;
      cardioForm = u.snapshot.cardio;
      pastLogs = await api.sessionLogs(id).catch(() => pastLogs);
      announce = u.replaced.length
        ? `Log removed. ${u.sessionName} from ${u.replaced.map((l) => fmtDay(l.date)).join(", ")} is back.`
        : "Log removed. The sheet is back as it was.";
    } catch (err) {
      error = `Couldn't undo: ${(err as Error).message}`;
    } finally {
      undoBusy = false;
    }
  }

  /** Put the trainer on the first flagged cell — on a phone, bring its card on screen first. */
  async function focusFirstInvalid() {
    const bad = rows.find((r) => Object.keys(fieldErrors[r.key] ?? {}).length > 0);
    if (bad) current = blockIndexOf(blocks, bad.programExerciseId);
    await tick();
    document.querySelector<HTMLInputElement>('.sheet [aria-invalid="true"]')?.focus();
  }

  /** An edit by hand: the cell is typed now (no longer a fill-down copy), and its flag clears. */
  function edited(key: string, field: SheetField) {
    const i = rows.findIndex((r) => r.key === key);
    if (i >= 0 && isCopied(rows[i], field)) rows[i] = markTyped(rows[i], field);
    if (field === "weight") usedSuggestion.delete(key);
    clearCell(key, field);
  }

  /** A committed kg fills the later blank sets of the exercise. */
  function fillKg(key: string) {
    rows = fillDown(rows, key, "weight");
  }

  /** Editing a flagged cell clears its flag; the rest stay until the next save. */
  function clearCell(key: string, field: SheetField) {
    if (!fieldErrors[key]?.[field]) return;
    const { [field]: _, ...rest } = fieldErrors[key];
    fieldErrors = { ...fieldErrors, [key]: rest };
  }

  function toggleSkip(r: Row) {
    r.skipped = !r.skipped;
    if (r.skipped && fieldErrors[r.key]) {
      const { [r.key]: _, ...rest } = fieldErrors;
      fieldErrors = rest;
    }
  }

  function addSet(programExerciseId: string) {
    const head = rows.find((r) => r.programExerciseId === programExerciseId);
    if (!head) return;
    rows = withExtraSet(rows, programExerciseId, (n): Row => ({
      key: `${programExerciseId}-x${crypto.randomUUID().slice(0, 8)}`,
      exerciseId: head.exerciseId,
      slotExerciseId: head.slotExerciseId,
      programExerciseId,
      setNumber: n,
      type: "working",
      prescribedReps: null,
      extra: true,
      rx: null,
      timed: head.timed,
      last: null,
      weight: "",
      reps: "",
      rpe: "",
      ...(head.group ? { group: head.group } : {}),
    }));
  }

  function removeSet(key: string) {
    rows = withoutExtra(rows, key);
  }

  function swap(programExerciseId: string, exerciseId: string) {
    rows = swapSlot(rows, programExerciseId, exerciseId);
    swapOpen = null;
  }

  // ---- Skip a whole exercise ----

  /** A slot's rows as they were before "Skip exercise" — Undo skip puts them back. */
  const skipBefore = new Map<string, Row[]>();

  function skipBlock(b: { programExerciseId: string; rows: Row[] }) {
    const pe = b.programExerciseId;
    if (extrasHoldValues(rows, pe) && !confirm(`Skip ${blockName(b)} and drop the extra sets you entered?`)) return;
    skipBefore.set(pe, $state.snapshot(b.rows) as Row[]);
    rows = skipExercise(rows, pe);
    const keys = new Set(b.rows.map((r) => r.key));
    fieldErrors = Object.fromEntries(Object.entries(fieldErrors).filter(([k]) => !keys.has(k)));
    if (swapOpen === pe) swapOpen = null;
  }

  function undoSkipBlock(pe: string) {
    rows = unskipExercise(rows, pe, skipBefore.get(pe));
    skipBefore.delete(pe);
  }

  /** One tap picks a reason; tapping it again clears it. */
  function pickSkipReason(pe: string, reason: SkipReason, was: SkipReason | null) {
    rows = setSkipReason(rows, pe, was === reason ? null : reason);
  }

  /** Exercises with a Pain flag or skipped for pain — the warning above the save bar names them. */
  const painList = $derived(painExercises(rows, flags));

  // ---- Flag an exercise: Pain or Technique, with an optional note ----

  function pickFlag(pe: string, kind: FlagKind) {
    flags = toggleFlag(flags, pe, kind);
  }

  function noteFlag(pe: string, note: string) {
    flags = setFlagNote(flags, pe, note);
  }

  /** Open a card's swap picker or flag chips and put focus in it — the menu that opened it is gone. */
  async function openPanel(kind: "swap" | "flag", pe: string) {
    if (kind === "swap") swapOpen = pe;
    else flagOpen = pe;
    await tick();
    document.querySelector<HTMLElement>(`#blk-${kind}-${CSS.escape(pe)} button`)?.focus();
  }

  /** A card's "More" menu: everything but +Set, which stays on the card. */
  function cardActions(b: { programExerciseId: string; rows: Row[] }, swapped: boolean, flagged: boolean): OverflowItem[] {
    const pe = b.programExerciseId;
    const head = b.rows[0];
    return [
      ...(swapped
        ? [{ label: `Undo swap`, icon: "undo" as const, hint: nameOf(head.slotExerciseId), onselect: () => swap(pe, head.slotExerciseId) }]
        : []),
      { label: swapped ? "Swap again" : "Swap exercise", icon: "swap", onselect: () => openPanel("swap", pe) },
      { label: flagged ? "Edit flag" : "Flag", icon: "flag", hint: flagged ? undefined : "pain · technique", onselect: () => openPanel("flag", pe) },
      { label: "Skip exercise", icon: "skip", onselect: () => skipBlock(b) },
    ];
  }

  function go(i: number) {
    current = Math.max(0, Math.min(blocks.length - 1, i));
    document.getElementById("log-sheet")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /** A card's title: the exercise, or "Superset A" for a group. */
  const cardTitle = (b: { group?: string; memberIds: string[]; rows: Row[] }) =>
    b.group ? `${groupKind(b.memberIds.length)} ${b.group}` : nameOf(b.rows[0].exerciseId);
  /** One member's rows inside a group card — for its sub-header's actions. */
  const memberBlock = (b: { rows: Row[] }, pe: string) => ({ programExerciseId: pe, rows: b.rows.filter((r) => r.programExerciseId === pe) });
  /** "A1" for a row on a group card. */
  const tagOf = (b: { group?: string; memberIds: string[] }, pe: string) =>
    b.group ? `${b.group}${b.memberIds.indexOf(pe) + 1}` : null;
  /** Rows of a group card that open a round: key → "Round 2" / "Extra sets". Skipped exercises' rows are hidden. */
  function roundBreaks(rs: Row[]): Map<string, string> {
    const out = new Map<string, string>();
    let prev = "";
    for (const r of rs) {
      if (r.exerciseSkip) continue;
      const label = r.extra ? "Extra sets" : `Round ${r.setNumber}`;
      if (label !== prev) out.set(r.key, label);
      prev = label;
    }
    return out;
  }

  /** A card is done once every set is entered or skipped. */
  const blockDone = (b: { rows: Row[] }) => b.rows.every((r) => r.skipped || !isBlank(r.reps));

  /** One set in the as-prescribed dialog: "65×5 @8", "BW×12", "—×5" (no load), "45 s". */
  const fmtPreviewSet = (r: Row) => {
    const reps = `${r.reps}${r.timed ? " s" : ""}`;
    const kg = !isBlank(r.weight) ? String(r.weight) : isBodyweight(r.exerciseId) ? "BW" : "—";
    const load = r.timed && isBlank(r.weight) ? reps : `${kg}×${reps}`;
    return isBlank(r.rpe) ? load : `${load} @${r.rpe}`;
  };
  const fmtLast = (l: LastSet | null, timed: boolean) =>
    l == null ? "—" : `${l.weightKg != null ? `${l.weightKg} × ` : ""}${l.reps}${timed ? " s" : ""}`;
  const fmtRx = (r: Row) =>
    r.rx
      ? `${fmtSet({ reps: r.rx.reps, repsMin: r.rx.repsMin ?? undefined, amrap: r.rx.amrap, durationSeconds: r.rx.durationSeconds ?? undefined, targetWeightKg: r.rx.targetWeightKg, targetRpe: r.rx.targetRpe })}${r.rx.targetRpe != null && !r.rx.amrap ? ` @ ${r.rx.targetRpe}` : ""}`
      : "—";
  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const fmtLongDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  /** A draft's last edit: the time today, else the day. */
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return localIso(d) === localIso(new Date())
      ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
      : fmtDay(localIso(d));
  };
  /**
   * Placeholder = what "as prescribed" would log, so a blank cell reads as the
   * plan. With no kg in the plan, the suggested load stands in for it.
   */
  const rxCell = (r: Row) => {
    const p = asPrescribed(r.rx, { bodyweight: isBodyweight(r.exerciseId), swapped: isSwapped(r), last: r.last });
    const s = r.rx?.targetWeightKg == null ? coach.suggest.get(r.key) : undefined;
    return s ? { ...p, weight: s.kg } : p;
  };

  async function firstLoad() {
    const [detail, exercises] = await Promise.all([api.client(id), api.exercises()]);
    catalog = exercises;
    client = detail.client;
    program = detail.currentProgram;
    pastLogs = await api.sessionLogs(id);
    if (program && program.weeks?.length) {
      // Open on the session and date a link named (the overview's training week);
      // otherwise on the most recent scheduled session not logged yet, dated its day.
      const q = page.url.searchParams;
      const pick = linkedPick(program, q.get("session"), q.get("date"), today) ?? openingPick(program, pastLogs, today);
      selectedWeekNumber = pick?.week ?? program.weeks[0].week;
      sessionId = pick?.sessionId ?? weekSessionsList[0]?.id ?? "";
      loadSession();
      if (pick && !draftSavedAt) {
        date = pick.date;
        pickNote = pickText(pick, pick.date);
      }
    }
  }

  onMount(() => {
    firstLoad().catch(onLoadError);
  });
</script>

<svelte:head><title>Log session · Program Tracker</title></svelte:head>

{#if loadError}
  <ClientLoadError error={loadError} />
{:else if client === null}
  <SkeletonHead actions={1} label="Loading session…" />
  <SkeletonPanel title="Session" count rows={5} />
{:else}
  <PageHead
    title="Log a session"
    sub={`Enter what ${client.name.split(" ")[0]} actually did.`}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: "Log session" }]}
  >
    {#snippet actions()}
      {#if rows.length > 0 || isCardioSession}
        <!-- Green is the Save verb (DESIGN.md): the shortcut is primary only on an empty sheet; once anything is entered, Save takes it. -->
        <Button variant={dirty ? "default" : "primary"} onclick={logAsPrescribed} disabled={saving} aria-haspopup="dialog">
          {#snippet icon()}<Icon name="bolt" />{/snippet}
          Did it as prescribed
        </Button>
      {/if}
    {/snippet}
  </PageHead>

  {#if !program}
    <section class="panel"><EmptyState>No active program — log sessions once a program is running.</EmptyState></section>
  {:else}
    {@const prog = program}
    <!-- novalidate: the sheet validates itself; a native bubble on a cell in a hidden phone card would block Save silently. -->
    <!-- Plain Enter never submits: formKeydown walks the cells; Cmd/Ctrl+Enter saves. Delegated from the cells' inputs. -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <form class="log-form" onsubmit={submit} onkeydown={formKeydown} bind:this={formEl} novalidate>
      <Panel title="Session" count={!isCardioSession && rows.length > 0 ? tally : undefined}>
        {#snippet act()}
          <div class="head-controls" class:collapsed={!pickersOpen}>
            <div class="hc-summary">
              <span class="hc-sum-text">
                Wk {selectedWeekNumber} · {selectedSession?.name ?? "No session"}{date ? ` · ${fmtLongDay(date)}` : ""}
              </span>
              <button type="button" class="link-btn" aria-expanded={pickersOpen} onclick={() => (pickersOpen = !pickersOpen)}>
                {pickersOpen ? "Done" : "Change"}
              </button>
            </div>
            <span class="hc-pair">
              <label class="label" for="log-week">Week</label>
              <select
                class="select"
                id="log-week"
                value={selectedWeekNumber}
                onchange={changeWeek}
              >
                {#each prog.weeks as w (w.week)}
                  <option value={w.week}>Week {w.week}</option>
                {/each}
              </select>
            </span>
            <span class="hc-pair">
              <label class="label" for="log-session">Session</label>
              <select
                class="select"
                id="log-session"
                value={sessionId}
                onchange={changeSession}
              >
                {#each sessionGroups as g (g.day)}
                  <optgroup label={g.label}>
                    {#each g.items as ws (ws.id)}
                      <option value={ws.id}>{ws.label}</option>
                    {/each}
                  </optgroup>
                {/each}
              </select>
            </span>
            <span class="hc-pair">
              <label class="label" for="log-date">Date</label>
              <input
                class="input date"
                id="log-date"
                type="date"
                max={today}
                value={date}
                onchange={changeDate}
                onblur={(e) => (e.currentTarget.value = date)}
              />
            </span>
            {#if prefillable && !isCardioSession}
              <Button variant="ghost" small type="button" onclick={prefill}>Prefill prescribed</Button>
            {/if}
          </div>
        {/snippet}
      {#if pickNote || loggedNote || draftSavedAt}
        <div class="panel-body sheet-notes">
          {#if pickNote}
            <p class="pick-note" aria-live="polite">{pickNote}</p>
          {/if}
          {#if loggedNote}
            <Note tone="warn" role="note">
              Already logged {fmtDay(loggedNote.date)}{isCardioSession ? "" : ` · ${loggedNote.setCount} sets`}.
              Saving again asks whether to replace it.
            </Note>
          {/if}
          {#if draftSavedAt}
            <Note tone="ok" role="note" class="draft-note">
              <span>Draft restored · last edited {fmtTime(draftSavedAt)}</span>
              <button type="button" class="link-btn" onclick={discardDraft}>Discard</button>
            </Note>
          {/if}
        </div>
      {/if}
      {#if sessionId}
        {@render readinessStrip()}
      {/if}
      {#if isCardioSession}
        <div class="panel-body cardio-form">
          <Field label="Modality" htmlFor="c-modality" hint="what did they do?">
            <input class="input" id="c-modality" placeholder="Run, Bike, Rower…" bind:value={cardioForm.modality} maxlength="80" />
          </Field>
          <Field label="Min" htmlFor="c-min">
            <input class="input tnum" id="c-min" type="number" inputmode="numeric" min="1" max="300" bind:value={cardioForm.durationMin} />
          </Field>
          <Field label="HR zone" htmlFor="c-zone">
            <select class="select" id="c-zone" bind:value={cardioForm.hrZone}>
              <option value="">—</option>
              {#each [1, 2, 3, 4, 5] as z}<option value={String(z)}>Z{z}</option>{/each}
            </select>
          </Field>
          <Field label="Intensity" htmlFor="c-intensity">
            <input class="input" id="c-intensity" placeholder="easy, threshold…" bind:value={cardioForm.intensity} maxlength="60" />
          </Field>
          <Field label="km" htmlFor="c-km">
            <input class="input tnum" id="c-km" type="number" inputmode="decimal" min="0" max="300" step="0.1" bind:value={cardioForm.distanceKm} />
          </Field>
          <Field label="RPE" htmlFor="c-rpe">
            <input class="input tnum" id="c-rpe" type="number" inputmode="decimal" min="1" max="10" step="0.5" bind:value={cardioForm.rpe} />
          </Field>
        </div>
        <div class="panel-body foot">
          <div class="notes">
            <Field label="Session notes" htmlFor="log-notes">
              <input class="input" id="log-notes" placeholder="Felt strong, bar speed good…" bind:value={notes} maxlength="2000" />
            </Field>
          </div>
        </div>
        {@render saveBar("cardio session — counts toward the weekly target")}
      {:else}
      <div class="sheet" id="log-sheet">
        {#if blocks.length > 1}
          <nav class="pager" aria-label="Exercises in this session">
            <button type="button" class="pg-btn prev" aria-label="Previous exercise" disabled={current === 0} onclick={() => go(current - 1)}>
              <Icon name="chevron" />
            </button>
            <ol class="pg-steps">
              {#each blocks as b, i (b.key)}
                <li>
                  <button
                    type="button"
                    class="pg-step"
                    class:on={i === current}
                    class:done={blockDone(b)}
                    aria-current={i === current ? "step" : undefined}
                    aria-label={`${i + 1}. ${cardTitle(b)}${blockDone(b) ? ", done" : ""}`}
                    onclick={() => go(i)}
                  ></button>
                </li>
              {/each}
            </ol>
            <span class="pg-count tnum" aria-hidden="true">{current + 1}/{blocks.length}</span>
            <button type="button" class="pg-btn" aria-label="Next exercise" disabled={current === blocks.length - 1} onclick={() => go(current + 1)}>
              <Icon name="chevron" />
            </button>
          </nav>
        {/if}

        <div class="cols" aria-hidden="true">
          <span>Set</span><span>Prescribed</span><span class="r">Last</span><span class="r">kg</span><span class="r">Reps</span><span class="r">RPE</span><span></span>
        </div>

        {#snippet exHead(b: { programExerciseId: string; rows: Row[] }, tag: string | null)}
            {@const head = b.rows[0]}
            {@const role = roles.get(b.programExerciseId)}
            {@const swapped = isSwapped(head)}
            {@const exSkip = head.exerciseSkip}
            {@const flag = flags[b.programExerciseId]}
            <header class="blk-head" class:member={tag != null}>
              <div class="blk-title">
                {#if tag}<GroupTag {tag} />{/if}
                {#if role}<RoleChip {role} />{/if}
                <h3 id={`blk-${b.programExerciseId}`}>{nameOf(head.exerciseId)}</h3>
                {#if swapped}
                  <span class="pill warn swap-pill">swapped · was {nameOf(head.slotExerciseId)}</span>
                {/if}
                {#if exSkip}
                  <span class="pill skip-pill">Skipped{exSkip.reason ? ` · ${exSkip.reason}` : ""}</span>
                {/if}
                {#if flag}
                  <button
                    type="button"
                    class={`pill flag-pill ${flag.kind === "pain" ? "bad" : "warn"}`}
                    title={flag.note || `${FLAG_LABEL[flag.kind]} flagged`}
                    aria-label={`${FLAG_LABEL[flag.kind]} flagged on ${blockName(b)}${flag.note ? `: ${flag.note}` : ""}. Edit flag`}
                    aria-expanded={flagOpen === b.programExerciseId}
                    onclick={() => (flagOpen = flagOpen === b.programExerciseId ? null : b.programExerciseId)}
                  >
                    <Icon name="flag" />{FLAG_LABEL[flag.kind]}{#if flag.note}<span class="flag-note">{" · "}{flag.note}</span>{/if}
                  </button>
                {/if}
              </div>
              <div class="blk-act">
                {#if exSkip}
                  <Button variant="ghost" small type="button" aria-label={`Undo skip on ${blockName(b)}`} onclick={() => undoSkipBlock(b.programExerciseId)}>Undo skip</Button>
                {:else}
                <!-- +Set stays out: it's the one card action a normal session reaches for. The rest change what the card logs. -->
                <Button
                  variant="ghost"
                  small
                  type="button"
                  disabled={b.rows[b.rows.length - 1].setNumber >= MAX_SETS}
                  aria-label={`Add a set to ${blockName(b)}`}
                  onclick={() => addSet(b.programExerciseId)}
                >
                  {#snippet icon()}<Icon name="plus" />{/snippet}
                  Set
                </Button>
                <OverflowMenu label={`More actions for ${blockName(b)}`} text="More" items={cardActions(b, swapped, flag != null)} />
                {/if}
              </div>
              {#if exSkip}
                <div class="blk-reason" role="group" aria-label={`Why was ${blockName(b)} skipped? Optional`}>
                  <span class="subtle">Why? <span class="faint">optional</span></span>
                  {#each SKIP_REASONS as k (k)}
                    <button
                      type="button"
                      class="reason-chip"
                      aria-pressed={exSkip.reason === k}
                      onclick={() => pickSkipReason(b.programExerciseId, k, exSkip.reason)}
                    >{SKIP_REASON_LABEL[k]}</button>
                  {/each}
                </div>
              {/if}
              {#if flagOpen === b.programExerciseId}
                <div class="blk-flag" id={`blk-flag-${b.programExerciseId}`} role="group" aria-label={`Flag ${blockName(b)}`}>
                  <span class="subtle">Flag</span>
                  {#each FLAG_KINDS as k (k)}
                    <button
                      type="button"
                      class="reason-chip"
                      class:pain={k === "pain"}
                      aria-pressed={flag?.kind === k}
                      onclick={() => pickFlag(b.programExerciseId, k)}
                    >{FLAG_LABEL[k]}</button>
                  {/each}
                  {#if flag}
                    <input
                      class="input flag-input"
                      aria-label={`Note on the ${FLAG_LABEL[flag.kind].toLowerCase()} flag, optional`}
                      placeholder={flag.kind === "pain" ? "Where, when? e.g. left knee at the bottom" : "What broke down? e.g. hips rise first"}
                      maxlength={FLAG_NOTE_MAX}
                      value={flag.note}
                      oninput={(e) => noteFlag(b.programExerciseId, e.currentTarget.value)}
                    />
                  {:else}
                    <span class="faint flag-hint">Tap one — tap again to clear</span>
                  {/if}
                  <Button variant="ghost" small type="button" onclick={() => (flagOpen = null)}>Done</Button>
                </div>
              {/if}
              {#if swapOpen === b.programExerciseId && !exSkip}
                <div class="blk-swap" id={`blk-swap-${b.programExerciseId}`}>
                  <ExercisePicker
                    value={head.exerciseId}
                    {catalog}
                    label={`Log ${nameOf(head.slotExerciseId)} as`}
                    onpick={(ex) => swap(b.programExerciseId, ex.id)}
                  />
                  <span class="subtle">Every set of this exercise logs under the pick. History shows the swap.</span>
                  <Button variant="ghost" small type="button" onclick={() => (swapOpen = null)}>Cancel</Button>
                </div>
              {/if}
            </header>
        {/snippet}

        {#snippet setRow(r: Row, tag: string | null)}
              {@const fe = fieldErrors[r.key]}
              {@const label = labels.get(r.key) ?? r.key}
              {@const p = rxCell(r)}
              {@const last = isSwapped(r) ? null : r.last}
              {@const sg = coach.suggest.get(r.key)}
              {@const chip = chipFor(r, sg, equipmentOf(r.exerciseId))}
              {@const fb = coach.feedback.get(r.key)}
              {@const used = usedSuggestion.get(r.key)}
              {@const why = suggestionNote(sg, { used, open: sourceOpen.has(r.key), chip, unplannedBlank: r.rx?.targetWeightKg == null && isBlank(r.weight) })}
              <div class="set" class:skipped={r.skipped} class:filled={!r.skipped && !isBlank(r.reps)} class:extra={r.extra}>
                <div class="meta">
                  <span class="m-set">
                    {#if tag}<GroupTag {tag} />{/if}
                    <span class="mob">Set&nbsp;</span><span class="tnum">{r.setNumber}</span>
                    {#if !r.skipped && !isBlank(r.reps)}<span class="tick" title="Entered"><Icon name="check" /></span>{/if}
                    {#if r.extra}<span class="tag">extra</span>{:else if r.type === "backoff"}<span class="tag">back-off</span>{/if}
                  </span>
                  <span class="m-rx tnum">
                    {#if tag}<span class="m-who">{nameOf(r.exerciseId)}</span>{/if}
                    {fmtRx(r)}
                    {#if chip != null && sg}
                      <!-- A tap explains first: the load differs from the plan, so the trainer sees why before using it. -->
                      <button type="button" class="sugg-chip" title={`Suggested ${chip} kg · ${sg.source}`} aria-expanded={sourceOpen.has(r.key)} aria-controls={`${r.key}-why`} aria-label={`Suggested ${chip} kg for ${label} — why?`} onclick={() => toggleSource(r.key)}>→ {chip}</button>
                    {:else if sg && r.rx?.targetWeightKg == null && isBlank(r.weight)}
                      <button type="button" class="sugg-src" class:adj={sg.adjusted} title={sg.source} aria-expanded={sourceOpen.has(r.key)} aria-controls={`${r.key}-why`} aria-label={`Suggested ${sg.kg} kg for ${label} — where from?`} onclick={() => toggleSource(r.key)}>{sg.adjusted ? "adjusted" : "suggested"}</button>
                    {/if}
                  </span>
                  <span class="m-last tnum" title={last ? `Last done ${fmtDay(last.date)}${last.rpe != null ? ` @ RPE ${last.rpe}` : ""}` : isSwapped(r) ? "Swapped — last time was a different exercise" : "Not logged yet in this slot"}>
                    <span class="mob">last&nbsp;</span>{fmtLast(last, r.timed)}
                  </span>
                </div>
                {#if r.skipped}
                  <span class="skip-note">{r.exerciseSkip ? "Exercise skipped" : "Skipped"} — not logged</span>
                {:else}
                  {@const hint = (f: SheetField) => (lastCell?.key === r.key && lastCell.field === f ? "done" : "next")}
                  <div class="c-kg" data-cell={`${r.key}:weight`}>
                    <LogStepper bind:value={r.weight} label={`${label}, kg`} unit="kg" step={2.5} min={0} max={600} from={p.weight} placeholder={p.weight != null ? String(p.weight) : "—"} error={fe?.weight} errorId={`${r.key}-weight-err`} copied={isCopied(r, "weight")} enterkeyhint={hint("weight")} onedit={() => edited(r.key, "weight")} oncommit={() => fillKg(r.key)} />
                  </div>
                  <div class="c-reps" data-cell={`${r.key}:reps`}>
                    <LogStepper bind:value={r.reps} label={`${label}, ${r.timed ? "seconds" : "reps"}`} unit={r.timed ? "sec" : "reps"} step={r.timed ? 5 : 1} min={0} max={r.timed ? 3600 : 200} from={p.reps} inputmode="numeric" placeholder={p.reps != null ? String(p.reps) : r.rx?.amrap ? "max" : "—"} error={fe?.reps} errorId={`${r.key}-reps-err`} enterkeyhint={hint("reps")} onedit={() => edited(r.key, "reps")} />
                  </div>
                  <div class="c-rpe" data-cell={`${r.key}:rpe`}>
                    <LogStepper bind:value={r.rpe} label={`${label}, RPE`} unit="RPE" step={0.5} min={1} max={10} from={p.rpe ?? 7.5} placeholder={p.rpe != null ? String(p.rpe) : "—"} error={fe?.rpe} errorId={`${r.key}-rpe-err`} enterkeyhint={hint("rpe")} onedit={() => edited(r.key, "rpe")} />
                  </div>
                {/if}
                <div class="c-skip">
                  {#if r.exerciseSkip}
                    <!-- The whole exercise is skipped: Undo skip in the header brings the sets back. -->
                  {:else if r.extra}
                    <button type="button" class="skip-btn" aria-label={`Remove ${label}`} title="Remove this set" onclick={() => removeSet(r.key)}>
                      <Icon name="x" /><span class="mob">Remove set</span>
                    </button>
                  {:else}
                    <button type="button" class="skip-btn" aria-pressed={!!r.skipped} aria-label={`${r.skipped ? "Undo skip" : "Skip"} ${label}`} title={r.skipped ? "Undo skip" : "Didn't happen — don't log it"} onclick={() => toggleSkip(r)}>
                      {#if r.skipped}<span>Undo</span>{:else}<span class="skip-word">Skip</span>{/if}
                    </button>
                  {/if}
                </div>
                {#if !r.skipped && (why || fb)}
                  <div class="coach-line" id={`${r.key}-why`}>
                    {#if why}
                      <span class="cl-src">
                        {why.text}
                        {#if why.use != null && sg}
                          <button type="button" class="cl-use" aria-label={`Use ${why.use} kg for ${label}`} onclick={() => useSuggestion(r.key, sg)}>Use {why.use} kg</button>
                        {/if}
                      </span>
                    {/if}
                    {#if fb?.e1rm != null}
                      <span class="cl-e1rm tnum" title="Estimated 1RM — Epley, with reps in reserve from the RPE">e1RM {fb.e1rm}{#if fb.pr}<span class="pill good cl-pr" title="Best e1RM ever logged for this exercise">PR</span>{/if}</span>
                    {/if}
                    {#if fb?.rpeOff}
                      <span class="pill warn cl-rpe tnum" title={`RPE ${fb.rpeOff.actual} against a target of ${fb.rpeOff.target} — ${fb.rpeOff.dir === "hot" ? "harder" : "easier"} than planned`}>{fb.rpeOff.actual} vs {fb.rpeOff.target}</span>
                    {/if}
                  </div>
                {/if}
              </div>
        {/snippet}

        {#each blocks as b, bi (b.key)}
          <section class="block" class:off={bi !== current} aria-labelledby={b.group ? `blk-g-${b.group}` : `blk-${b.programExerciseId}`}>
            {#if b.group}
              {@const breaks = roundBreaks(b.rows)}
              {@const rounds = Math.max(1, ...b.rows.filter((r) => !r.extra).map((r) => r.setNumber))}
              <header class="grp-head">
                <span class="gletter">{b.group}</span>
                <h3 id={`blk-g-${b.group}`}>{groupKind(b.memberIds.length)}</h3>
                <span class="subtle">· {rounds} {rounds === 1 ? "round" : "rounds"}</span>
              </header>
              {#each b.memberIds as pe (pe)}
                {@render exHead(memberBlock(b, pe), tagOf(b, pe))}
              {/each}
              {#each b.rows as r (r.key)}
                {#if !r.exerciseSkip}
                  {#if breaks.has(r.key)}<div class="round-div">{breaks.get(r.key)}</div>{/if}
                  {@render setRow(r, tagOf(b, r.programExerciseId))}
                {/if}
              {/each}
              {#each b.memberIds as pe (pe)}
                {@const adj = coach.adjusted.get(pe)}
                {#if adj && !b.rows.find((r) => r.programExerciseId === pe)?.exerciseSkip}
                  <p class="coach-adjust">{tagOf(b, pe)} · {adj}</p>
                {/if}
              {/each}
            {:else}
              {@render exHead(b, null)}
              {#each b.rows as r (r.key)}
                {@render setRow(r, null)}
              {/each}
              {#if coach.adjusted.get(b.programExerciseId) && !b.rows[0].exerciseSkip}
                <p class="coach-adjust">{coach.adjusted.get(b.programExerciseId)}</p>
              {/if}
            {/if}

            {#if bi < blocks.length - 1}
              <button type="button" class="next-ex" onclick={() => go(bi + 1)}>
                <span>Next: {cardTitle(blocks[bi + 1])}</span>
                <Icon name="chevron" />
              </button>
            {/if}
          </section>
        {/each}
      </div>
        <div class="panel-body foot">
          <div class="notes">
            <Field label="Session notes" htmlFor="log-notes">
              <input class="input" id="log-notes" placeholder="Felt strong, bar speed good…" bind:value={notes} maxlength="2000" />
            </Field>
          </div>
        </div>
        {#if painList.length > 0}
          <div class="panel-body pain-note" bind:this={painNoteEl}>
            <Note tone="warn" role="note">
              Pain logged on {painList.map(nameOf).join(", ")} — check in with {client.name.split(" ")[0]}.
            </Note>
          </div>
        {/if}
        {@render saveBar(tally)}
      {/if}
      </Panel>
    </form>

    {#snippet readinessStrip()}
      <!-- Before the session: three optional taps. "Did it as prescribed" needs none of them. -->
      <div class="panel-body readiness" class:collapsed={!readinessOpen} role="group" aria-label="Readiness, optional">
        <button type="button" class="rd-toggle" aria-expanded={readinessOpen} onclick={() => (readinessOpen = !readinessOpen)}>
          <span class="rd-toggle-label">Readiness</span>
          <span class="faint rd-toggle-sum">{readinessSummary || "optional"}</span>
          <Icon name="chevron" />
        </button>
        {#each READINESS_SCALES as sc (sc.field)}
          <div class="rd">
            <span class="rd-label" id={`rd-${sc.field}`}>{sc.label} <span class="faint">1 {sc.low} · {sc.max} {sc.high}</span></span>
            <div class="seg rd-scale" role="group" aria-labelledby={`rd-${sc.field}`}>
              {#each Array.from({ length: sc.max }, (_, i) => i + 1) as v (v)}
                <button
                  type="button"
                  class="tnum"
                  aria-pressed={readiness[sc.field] === v}
                  aria-label={`${sc.label} ${v} of ${sc.max}`}
                  onclick={() => (readiness[sc.field] = tapScale(readiness[sc.field], v))}
                >{v}</button>
              {/each}
            </div>
          </div>
        {/each}
        <span class="faint rd-hint">Optional · tap again to clear</span>
      </div>
    {/snippet}

    {#snippet saveBar(status: string)}
      <!-- Sticky: Save, the tally and the error stay on screen while the sheet scrolls. -->
      <div class="save-bar" bind:this={saveBarEl}>
        {#if error}
          <p class="err-msg" role="alert">{error}</p>
        {/if}
        <!-- The save confirms where the eye already is: in the bar, beside Save. -->
        {#if recap && (undo || !dirty)}
          <SaveRecap title={recap.title} counts={recap.counts} notes={recap.notes} {next} drain={undo ? UNDO_SECONDS : null}>
            {#snippet action()}
              {#if undo}
                <span class="undo-left tnum" aria-hidden="true">{undoLeft} s</span>
                <Button small type="button" onclick={undoSave} disabled={undoBusy}>{undoBusy ? "Undoing…" : "Undo"}</Button>
              {/if}
            {/snippet}
          </SaveRecap>
        {/if}
        <div class="submit-row">
          <span class="subtle tally" aria-live="polite">{status}</span>
          <span class="kbd-hint" aria-hidden="true">Enter: next cell · {isMac ? "⌘↵" : "Ctrl+↵"} save</span>
          {#if !feedbackMode.on}
            <!-- Docked here: the floating Feedback pill would cover the sheet (it hides on this page). -->
            <button type="button" class="fb-dock" onclick={() => feedbackMode.set(true)} aria-label="Feedback">
              <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /></svg>
              <span class="fb-word">Feedback</span>
            </button>
          {/if}
          <Button variant={dirty ? "primary" : "default"} type="submit" id="log-save" disabled={saving} aria-keyshortcuts={isMac ? "Meta+Enter" : "Control+Enter"}>
            {saving ? "Saving…" : "Save session"}
          </Button>
        </div>
      </div>
    {/snippet}

    <p class="sr-only" aria-live="polite">{announce}</p>

    <p class="subtle hint">
      “Did it as prescribed” shows what it will log before saving: target loads (with none, the load
      suggested from the RPE target, else the load last used in that same slot), the bottom of rep
      ranges, target RPE. Bodyweight stays bodyweight
      and skipped sets stay out. Deviated? Prefill, change what differs, skip what didn't happen, save.
      Each save can be undone for 10 seconds.
    </p>
  {/if}
{/if}

<!-- One dialog for both asks: the "as prescribed" summary and the duplicate choice. Native modal: focus stays inside, Esc closes. -->
<dialog class="ask" bind:this={dialogEl} onclose={() => (ask = null)} aria-labelledby="ask-title">
  {#if ask}
    {@const dupe = ask.mode === "duplicate" ? ask.existing : ask.pending ? sessionLogged : null}
    {#if ask.mode === "confirm"}
      <h2 id="ask-title">Log as prescribed?</h2>
      <p class="ask-line">
        Week {selectedWeekNumber} · {sessionName()} · {fmtLongDay(date)}{ask.summary ? ` · ${ask.summary.sets} ${ask.summary.sets === 1 ? "set" : "sets"}` : ""}
      </p>
      {#if ask.shown && ask.shown.blocks.length > 0}
        {@const typed = ask.shown.entered}
        {@const total = ask.summary?.sets ?? 0}
        {#if typed > 0}
          <p class="ask-sub">{typed} entered by you <span class="ask-typed-key">(bold)</span>, {total - typed} as prescribed.</p>
        {/if}
        <ul class="ask-sets">
          {#each ask.shown.blocks as b (b.programExerciseId)}
            <li>
              <span class="ask-ex">{blockNameOf(b.programExerciseId)}</span>
              <span class="ask-vals">
                {#each b.sets as s, i (s.row.key)}{#if i > 0}{", "}{/if}<span class:typed={s.entered}>{fmtPreviewSet(s.row)}</span>{/each}
              </span>
            </li>
          {/each}
        </ul>
      {/if}
      {#if ask.summary && (ask.summary.missingLoad.length > 0 || ask.summary.openAmrap > 0)}
        <ul class="ask-warn">
          {#if ask.summary.missingLoad.length > 0}
            <li>
              {ask.summary.missingLoadSets} {ask.summary.missingLoadSets === 1 ? "set has" : "sets have"} no load:
              {#each ask.summary.missingLoad as pe, i (pe)}{#if i > 0}{", "}{/if}<button type="button" class="link-btn" onclick={() => fillFirst("weight", pe)}>{blockNameOf(pe)}</button>{/each}
              <span class="ask-sub">They log reps only — no tonnage, no e1RM.</span>
            </li>
          {/if}
          {#if ask.summary.openAmrap > 0}
            <li>
              {ask.summary.openAmrap} AMRAP {ask.summary.openAmrap === 1 ? "set needs" : "sets need"} reps — there's no count to assume.
            </li>
          {/if}
        </ul>
      {/if}
      {#if !ask.pending && ask.summary && !ask.summary.openAmrap}
        <p class="ask-sub">
          {ask.summary.sets === 0 ? "Nothing to log yet — every set is skipped." : "Some cells need fixing before this can be logged."}
        </p>
      {/if}
      {#if ask.pending && dupe}
        <p class="ask-dupe">Already logged on {fmtDay(dupe.date)}{ask.pending.sent ? ` (${dupe.setCount} sets)` : ""}.</p>
      {/if}
    {:else}
      <h2 id="ask-title">Already logged</h2>
      <p class="ask-line">
        {sessionName()} was already logged on {fmtDay(ask.existing.date)}{ask.pending.sent ? ` (${ask.existing.setCount} sets)` : ""}.
        Replace it, or keep both?
      </p>
    {/if}

    <div class="ask-actions">
      {#if ask.mode === "confirm" && !ask.pending}
        {#if ask.summary?.openAmrap}
          <Button variant="primary" type="button" onclick={() => fillFirst("reps")}>Enter AMRAP reps</Button>
        {:else}
          <Button variant="primary" type="button" onclick={backToSheet}>Back to the sheet</Button>
        {/if}
        <Button variant="ghost" type="button" onclick={closeAsk}>Cancel</Button>
      {:else if ask.pending && dupe}
        {@const p = ask.pending}
        <Button variant="primary" type="button" disabled={saving} onclick={() => send(p, "replace")}>Replace it</Button>
        <Button type="button" disabled={saving} onclick={() => send(p, "add")}>Log a second time</Button>
        {#if ask.mode === "confirm" && ask.summary?.missingLoad.length}
          <Button variant="ghost" type="button" onclick={() => fillFirst("weight")}>Fill in loads first</Button>
        {/if}
        <Button variant="ghost" type="button" onclick={closeAsk}>Cancel</Button>
      {:else if ask.pending}
        {@const p = ask.pending}
        <Button variant="primary" type="button" disabled={saving} onclick={() => send(p)}>{saving ? "Logging…" : "Log it"}</Button>
        {#if ask.mode === "confirm" && ask.summary?.missingLoad.length}
          <Button type="button" onclick={() => fillFirst("weight")}>Fill in loads first</Button>
        {/if}
        <Button variant="ghost" type="button" onclick={closeAsk}>Cancel</Button>
      {/if}
    </div>
  {/if}
</dialog>

<LeaveGuard guard={leaveGuard} />

<style>
  .head-controls {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  /* Folded summaries exist only in the narrow sheet. */
  .hc-summary, .rd-toggle { display: none; }
  /* A label never wraps away from its field. */
  .hc-pair { display: inline-flex; align-items: center; gap: 8px; min-width: 0; max-width: 100%; }
  .head-controls .label { margin: 0; }
  .head-controls .select { width: auto; max-width: 100%; }
  .date { width: 150px; }
  .tnum { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  /* ---- The sheet: one block per prescribed exercise, one row per set ---- */
  .sheet { --set-cols: 92px minmax(0, 1fr) 104px 96px 76px 76px 64px; }
  .cols,
  .set {
    display: grid;
    grid-template-columns: var(--set-cols);
    gap: 10px;
    align-items: center;
    padding: 0 16px;
  }
  .cols {
    padding-top: 8px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--line-soft);
    font: 500 12px/1.2 var(--font-ui);
    color: var(--muted);
  }
  .cols .r { text-align: right; }

  .block + .block { border-top: 1px solid var(--line); }
  .blk-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px 12px;
    padding: 10px 16px 6px;
  }
  .blk-title { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
  /* a superset card: one header for the group, a compact line per member, rows round by round */
  .grp-head {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 10px 16px 6px;
  }
  .grp-head h3 { margin: 0; font: 600 14px/1.3 var(--font-ui); }
  .gletter { font: 600 12px/1 var(--font-mono); color: var(--muted); }
  .blk-head.member { padding-top: 4px; padding-bottom: 4px; }
  .blk-head.member .blk-title h3 { font-weight: 500; }
  .round-div {
    padding: 8px 16px 4px;
    border-top: 1px solid var(--line-soft);
    font: 500 11px/1.2 var(--font-ui);
    color: var(--muted);
    background: var(--well);
  }
  .round-div + :global(.set) { border-top: none; }
  .m-who {
    display: inline-block;
    max-width: 14ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
    color: var(--ink);
    margin-right: 6px;
  }
  .blk-title h3 { margin: 0; font: 600 14px/1.3 var(--font-ui); }
  .swap-pill { font-weight: 500; }
  .blk-act { display: flex; gap: 4px; }
  .blk-swap {
    flex: 1 0 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding: 4px 0 6px;
  }
  .blk-swap .subtle { font-size: 13px; }

  .set {
    min-height: 44px;
    padding-top: 5px;
    padding-bottom: 5px;
    border-top: 1px solid var(--line-soft);
  }
  .set.filled { background: var(--well); }
  .tick { display: inline-flex; align-self: center; color: var(--good); }
  .tick :global(svg) { width: 13px; height: 13px; }
  .sheet-notes { display: grid; gap: 8px; padding-bottom: 0; }
  .sheet-notes :global(.draft-note) { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .link-btn {
    padding: 0;
    font: inherit;
    font-weight: 600;
    color: inherit;
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
  /* ---- Undo window: the recap's hairline drains, then the save stands ---- */
  .undo-left { font-size: 12px; color: var(--muted); }
  @media (prefers-reduced-motion: reduce) {
    .rd-toggle :global(svg) { transition: none; }
  }

  /* ---- The ask: one small modal for the summary and the duplicate choice ---- */
  .ask {
    width: min(460px, calc(100vw - 32px));
    padding: 20px 20px 16px;
    color: var(--ink);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-overlay);
  }
  .ask::backdrop { background: var(--scrim); }
  .ask h2 { margin: 0 0 6px; font: 600 16px/1.3 var(--font-ui); }
  .ask-line { margin: 0; color: var(--ink); }
  .ask-warn {
    margin: 12px 0 0;
    padding: 8px 12px 8px 28px;
    color: var(--warn-ink);
    background: var(--warn-bg);
    border: 1px solid var(--warn-line);
    border-radius: var(--radius);
    font-size: 13px;
    line-height: 1.5;
  }
  .ask-warn li + li { margin-top: 4px; }
  .ask-sub { display: block; margin-top: 2px; color: var(--muted); font-size: 13px; }
  .ask-warn .ask-sub { color: inherit; opacity: 0.85; }
  .ask-dupe { margin: 12px 0 0; font-weight: 600; }
  /* The log to be: every set, typed ones in ink like the sheet, prescribed ones muted like its ghosts. */
  .ask-sets {
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
    max-height: min(40vh, 320px);
    overflow-y: auto;
    border-top: 1px solid var(--line);
  }
  .ask-sets li {
    display: grid;
    grid-template-columns: minmax(0, 9em) minmax(0, 1fr);
    gap: 12px;
    padding: 6px 0;
    border-bottom: 1px solid var(--line);
    font-size: 13px;
    line-height: 1.45;
  }
  .ask-ex { color: var(--ink); overflow-wrap: anywhere; }
  .ask-vals { color: var(--muted); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .ask-vals > span { white-space: nowrap; }
  .ask-vals .typed { color: var(--ink); font-weight: 600; }
  .ask-typed-key { color: var(--ink); font-weight: 600; }
  .ask-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 18px;
  }
  .ask-actions :global(.btn.ghost:last-child) { margin-left: auto; }
  .meta { display: contents; }
  .m-set { display: flex; align-items: baseline; gap: 6px; }
  .tag { font: 500 11px/1.2 var(--font-ui); color: var(--muted); }
  .extra .tag { color: var(--blue); }
  .m-rx { color: var(--muted); font-size: 12px; }
  .m-last { color: var(--faint); font-size: 12px; text-align: right; }
  .mob { display: none; }

  .set.skipped .m-set,
  .set.skipped .m-rx,
  .set.skipped .m-last { color: var(--faint); text-decoration: line-through; text-decoration-color: var(--line-strong); }
  .skip-note { grid-column: 4 / 7; color: var(--faint); font-size: 13px; text-align: right; }

  .c-skip { display: flex; justify-content: flex-end; }
  .skip-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 32px;
    height: 28px;
    padding: 0 8px;
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    background: transparent;
    border: 1px dashed var(--line);
    border-radius: 6px;
    cursor: pointer;
  }
  .skip-btn:hover { color: var(--ink); background: var(--well-2); border-style: solid; }
  .skip-btn[aria-pressed="true"] { color: var(--ink); border-style: solid; background: var(--well); }
  .skip-btn :global(svg) { width: 14px; height: 14px; }

  .pager, .next-ex { display: none; }

  /* ---- Coaching: suggested loads and live feedback ---- */
  .sugg-chip,
  .sugg-src {
    margin-left: 6px;
    padding: 1px 6px;
    font: 500 11px/1.4 var(--font-mono);
    border-radius: 99px;
    cursor: pointer;
    white-space: nowrap;
  }
  /* The plan's kg stays; the chip offers the load today's numbers give. */
  .sugg-chip { color: var(--blue); background: transparent; border: 1px solid var(--line); }
  .sugg-chip:hover { background: var(--well-2); border-color: var(--line-strong); }
  .sugg-chip[aria-expanded="true"] { background: var(--well-2); border-color: var(--blue-line); }
  .cl-use {
    margin-left: 6px;
    padding: 1px 8px;
    font: 600 11px/1.4 var(--font-ui);
    color: var(--blue);
    background: transparent;
    border: 1px solid var(--blue-line);
    border-radius: 99px;
    cursor: pointer;
    white-space: nowrap;
  }
  .cl-use:hover { background: var(--well-2); }
  .sugg-src {
    padding: 0;
    font-family: var(--font-ui);
    color: var(--faint);
    background: none;
    border: 0;
    text-decoration: underline dotted;
    text-underline-offset: 2px;
  }
  .sugg-src:hover, .sugg-src[aria-expanded="true"] { color: var(--muted); }
  .sugg-src.adj { color: var(--warn); }
  .coach-line {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: var(--set-cols);
    gap: 0 10px;
    align-items: center;
    margin-top: -3px;
    font: 500 11px/1.4 var(--font-mono);
    color: var(--muted);
  }
  .cl-src { grid-column: 2 / 4; font-family: var(--font-ui); font-weight: 400; }
  .cl-e1rm { grid-column: 4 / 6; justify-self: end; display: inline-flex; align-items: center; gap: 6px; }
  .cl-rpe { grid-column: 6; justify-self: end; padding: 0 6px; font: 500 11px/1.4 var(--font-mono); }
  .cl-pr { padding: 0 6px; font-size: 11px; }
  .coach-adjust {
    margin: 0;
    padding: 6px 16px 8px;
    font-size: 12px;
    color: var(--warn);
    border-top: 1px solid var(--line-soft);
  }

  .foot {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 22px;
    align-items: end;
    border-top: 1px solid var(--line);
  }
  .cardio-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .notes { min-width: 220px; }

  /* ---- Readiness: three segmented scales, top of the sheet ---- */
  .readiness {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px 24px;
    padding-top: 10px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--line);
  }
  .rd { display: grid; gap: 6px; }
  .rd-label { font: 500 12px/1.2 var(--font-ui); color: var(--muted); }
  .rd-label .faint { font-weight: 400; margin-left: 4px; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .seg button {
    min-width: 30px;
    height: 30px;
    padding: 0 6px;
    font: 500 13px/1 var(--font-mono);
    color: var(--muted);
    background: var(--well);
    border: 0;
    cursor: pointer;
    touch-action: manipulation;
  }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button:hover { color: var(--ink); background: var(--well-2); }
  .seg button[aria-pressed="true"] { color: var(--ink); background: var(--surface); font-weight: 600; box-shadow: inset 0 -2px 0 var(--tab-on); }
  .rd-hint { font-size: 12px; margin-left: auto; align-self: center; }

  /* ---- Flag an exercise ---- */
  .flag-pill {
    display: inline-flex;
    align-items: center;
    gap: 0 4px;
    max-width: 280px;
    font: 500 12px/1.4 var(--font-ui);
    cursor: pointer;
  }
  .flag-pill :global(svg) { flex: 0 0 auto; width: 12px; height: 12px; }
  .flag-note { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
  .blk-flag {
    flex: 1 0 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 2px 0 4px;
  }
  .blk-flag .subtle { font-size: 13px; margin-right: 4px; }
  .reason-chip.pain[aria-pressed="true"] { color: var(--bad); background: var(--bad-bg); border-color: var(--bad-line); }
  .flag-input { flex: 1 1 260px; min-width: 0; height: 28px; font-size: 13px; }
  .flag-hint { font-size: 12px; }
  .submit-row { display: flex; align-items: center; gap: 14px; }

  /* ---- Sticky Save bar: last thing in the form, pinned to the viewport bottom while the sheet scrolls ---- */
  .save-bar {
    position: sticky;
    bottom: 0;
    z-index: 3;
    padding: 10px 16px;
    padding-bottom: max(10px, env(safe-area-inset-bottom));
    background: var(--surface);
    border-top: 1px solid var(--line);
    border-radius: 0 0 var(--radius) var(--radius);
  }
  .save-bar .submit-row { justify-content: flex-end; }
  .save-bar .tally { margin-right: auto; }
  .save-bar .err-msg { margin: 0 0 8px; }
  .save-bar :global(.recap) { margin: 0 0 8px; }
  .fb-dock {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 10px;
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    background: none;
    border: 1px solid var(--line);
    border-radius: 99px;
    cursor: pointer;
  }
  .fb-dock:hover { color: var(--ink); border-color: var(--line-strong); }
  .fb-dock svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .kbd-hint { font: 400 12px/1.2 var(--font-ui); color: var(--faint); white-space: nowrap; }
  /* A focused cell scrolls clear of the bar, not under it. */
  .sheet :global(input) { scroll-margin-bottom: 96px; }
  .pain-note { padding-top: 0; }

  .pick-note { margin: 0; font-size: 13px; color: var(--muted); }

  /* ---- Skip a whole exercise ---- */
  .skip-pill { font-weight: 500; }
  .blk-reason {
    flex: 1 0 100%;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 2px 0 4px;
  }
  .blk-reason .subtle { font-size: 13px; margin-right: 4px; }
  .faint { color: var(--faint); }
  .reason-chip {
    height: 28px;
    padding: 0 10px;
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 99px;
    cursor: pointer;
  }
  .reason-chip:hover { color: var(--ink); background: var(--well-2); }
  .reason-chip[aria-pressed="true"] { color: var(--ink); background: var(--well); border-color: var(--line-strong); font-weight: 600; }

  .err-msg { color: var(--bad); font-weight: 600; margin-top: 14px; }
  .hint { margin-top: 10px; max-width: var(--measure-prose); }

  @media (max-width: 860px) {
    .foot { grid-template-columns: 1fr; }
    .cardio-form { grid-template-columns: 1fr; }
  }

  /* ---- Narrow sheet: one exercise card at a time, one set per row, 44px steppers.
     Keyed to the form's own width, not the viewport: with the sidebar open a 660–930px
     window leaves the card narrower than the 7-column table needs (~680px). ---- */
  .log-form { container: logform / inline-size; }
  @container logform (max-width: 679px) {
    .cols { display: none; }
    .block.off { display: none; }
    .block + .block { border-top: 0; }

    .pager {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 8px;
      border-bottom: 1px solid var(--line);
      background: var(--well);
    }
    .pg-btn {
      display: grid;
      place-items: center;
      flex: 0 0 44px;
      height: 44px;
      color: var(--ink);
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 6px;
      cursor: pointer;
      touch-action: manipulation;
    }
    .pg-btn :global(svg) { width: 18px; height: 18px; transform: rotate(-90deg); }
    .pg-btn.prev :global(svg) { transform: rotate(90deg); }
    .pg-btn:disabled { color: var(--faint); background: transparent; cursor: default; }
    .pg-steps {
      flex: 1;
      display: flex;
      gap: 4px;
      margin: 0;
      padding: 0;
      list-style: none;
      min-width: 0;
    }
    .pg-steps li { flex: 1; min-width: 0; }
    /* The bar is the visible step; the button's box stays 44px tall to hit. */
    .pg-step {
      display: block;
      width: 100%;
      height: 44px;
      padding: 0;
      background: transparent;
      border: 0;
      cursor: pointer;
      position: relative;
    }
    .pg-step::after {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 19px;
      height: 6px;
      border-radius: 4px;
      background: var(--line);
    }
    .pg-step.done::after { background: var(--done-4); }
    .pg-step.on::after { background: var(--blue); top: 17px; height: 10px; }
    .pg-count { flex: 0 0 auto; font-size: 13px; color: var(--muted); }

    .blk-head { padding: 14px 14px 8px; }
    .blk-title h3 { font-size: 16px; }
    .blk-act { width: 100%; }
    .blk-act :global(.btn) {
      min-height: 44px;
      flex: 1;
      justify-content: center;
      font-size: 14px;
      background: var(--well);
      border: 1px solid var(--line);
    }

    .set {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-areas:
        "meta meta"
        "kg   reps"
        "rpe  skip";
      gap: 10px 10px;
      padding: 12px 14px 14px;
      align-items: end;
    }
    .set.skipped { grid-template-areas: "meta meta" "note skip"; align-items: center; }
    .meta {
      grid-area: meta;
      display: flex;
      align-items: baseline;
      gap: 10px;
      flex-wrap: wrap;
    }
    .mob { display: inline; }
    .m-set { font: 600 14px/1.3 var(--font-ui); }
    .m-rx { font-size: 13px; color: var(--ink); }
    .m-last { margin-left: auto; font-size: 12px; }
    .c-kg { grid-area: kg; }
    .c-reps { grid-area: reps; }
    .c-rpe { grid-area: rpe; }
    .c-skip { grid-area: skip; }
    .skip-note { grid-area: note; grid-column: auto; text-align: left; }
    .skip-btn { width: 100%; height: 44px; font-size: 14px; }
    /* Visual only: the button's aria-label already names the set. */
    .skip-word::after { content: " set" / ""; }
    .coach-line { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: -4px; font-size: 12px; }
    .cl-src { flex-basis: 100%; }
    .cl-e1rm { margin-right: auto; }
    .sugg-chip { padding: 4px 10px; font-size: 13px; }
    .cl-use { display: inline-block; margin: 4px 0 0 0; padding: 0 14px; min-height: 36px; font-size: 13px; }
    .sugg-src { font-size: 13px; }
    .coach-adjust { padding: 8px 14px; font-size: 13px; }

    .next-ex {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      width: calc(100% - 28px);
      min-height: 48px;
      margin: 4px 14px 14px;
      padding: 0 14px;
      font: 600 14px/1.3 var(--font-ui);
      color: var(--ink);
      background: var(--well);
      border: 1px solid var(--line);
      border-radius: 6px;
      cursor: pointer;
      text-align: left;
    }
    .next-ex span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .next-ex :global(svg) { flex: 0 0 auto; width: 16px; height: 16px; transform: rotate(-90deg); }

    .head-controls .select, .date { width: 100%; }
    .head-controls { display: grid; grid-template-columns: auto minmax(0, 1fr); }
    .hc-pair { display: contents; }
    .hc-summary {
      grid-column: 1 / -1;
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 44px;
    }
    .hc-sum-text { flex: 1; min-width: 0; font-size: 14px; line-height: 1.35; color: var(--ink); text-wrap: pretty; }
    .hc-summary .link-btn { min-height: 44px; padding: 0 4px; font-size: 14px; }
    .head-controls.collapsed .hc-pair { display: none; }
    .head-controls :global(.btn) { grid-column: 1 / -1; min-height: 44px; justify-content: center; }
    .readiness { display: grid; gap: 12px; }
    .readiness.collapsed { padding-top: 0; padding-bottom: 0; }
    .readiness.collapsed .rd, .readiness.collapsed .rd-hint { display: none; }
    .rd-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 44px;
      padding: 0;
      font: 500 14px/1.3 var(--font-ui);
      color: var(--ink);
      background: none;
      border: 0;
      cursor: pointer;
      text-align: left;
    }
    .rd-toggle-sum { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 400; }
    .rd-toggle :global(svg) { flex: 0 0 auto; width: 16px; height: 16px; transition: transform 150ms ease-out; }
    .rd-toggle[aria-expanded="true"] :global(svg) { transform: rotate(180deg); }
    .rd-scale { display: flex; }
    .seg button { flex: 1; min-width: 0; height: 40px; font-size: 14px; }
    .rd-hint { margin-left: 0; }
    .flag-pill { max-width: 100%; }
    .flag-input { flex-basis: 100%; height: 44px; font-size: 14px; }
    .notes { min-width: 0; }
    .notes .input { min-height: 44px; }
    .submit-row :global(.btn) { min-height: 44px; padding: 0 22px; }
    .save-bar { padding: 8px 14px; padding-bottom: max(8px, env(safe-area-inset-bottom)); }
    /* Phone keyboards have a Next key; the shortcut hint is desk-only. */
    .kbd-hint { display: none; }
    .fb-dock { width: 44px; height: 44px; padding: 0; justify-content: center; border-radius: 6px; }
    .fb-word { display: none; }
    .save-bar :global(.recap .action .btn) { min-height: 44px; padding: 0 16px; }
    .blk-act { flex-wrap: wrap; }
    .blk-reason .subtle { flex-basis: 100%; }
    .reason-chip { height: 44px; padding: 0 6px; font-size: 14px; flex: 1; }
    .blk-flag .subtle { flex-basis: 100%; }
    .blk-flag :global(.btn) { min-height: 44px; flex: 1; justify-content: center; font-size: 14px; background: var(--well); border: 1px solid var(--line); }
  }
</style>
