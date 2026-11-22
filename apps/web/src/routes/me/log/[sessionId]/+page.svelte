<script lang="ts">
  import { tick } from "svelte";
  import { page } from "$app/state";
  import { addDays, groupKind, localDateOf, modalityMetric, type PortalSession, type PortalWeek } from "@pt/shared";
  import { portalApi, PortalDuplicateError, type PortalSavedLog } from "$lib/api/portal";
  import { blocksOf, roundBreaks, roundOrder, setSkipReason, skipExercise, unskipExercise, withExtraSet, withoutExtra, MAX_SETS, SKIP_REASONS, type RoundBreak, type SkipReason } from "$lib/logSheet";
  import { EMPTY_READINESS, FLAG_NOTE_MAX, setFlagNote, toggleFlag, type ExerciseFlags, type ReadinessForm } from "$lib/logFlags";
  import LogStepper from "$lib/components/LogStepper.svelte";
  import LoadCell, { type LoadCellText } from "$lib/components/LoadCell.svelte";
  import ReadinessStrip, { type ReadinessText } from "$lib/components/log/ReadinessStrip.svelte";
  import CardioLogForm, { type CardioForm, type CardioFormText } from "$lib/components/log/CardioLogForm.svelte";
  import { cardioLogOf, type CardioFormError } from "$lib/cardioForm";
  import type { MessageKey } from "$lib/portal/messages";
  import { fmtDay, fmtShortDate, i18n, latinLang, t, weekdayName } from "$lib/portal/i18n.svelte";
  import { dayGroups, doneCount, focusSession } from "$lib/portal/week";
  import { modalityName, modalityStored } from "$lib/portal/modality";
  import { lastSetText, setParts, setTarget } from "$lib/portal/rx";
  import {
    buildPortalLog,
    cardioFormOf,
    cachedSession,
    defaultLogDate,
    extraRow,
    formOfSession,
    parsePortalDraft,
    portalDraftJson,
    portalDraftKey,
    portalWeekCacheJson,
    PORTAL_WEEK_CACHE_KEY,
    sameForm,
    setLoad,
    setsMissingKg,
    touchedExercises,
    type PortalLogForm,
    type PortalRow,
  } from "$lib/portal/logForm";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import RestTimer from "$lib/portal/RestTimer.svelte";
  import { restOf } from "$lib/portal/restTimer";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import { showLoad, units, weightCells, weightStepIn } from "$lib/units.svelte";

  let { data } = $props();
  /** Weight cells in the member's unit (kg passes straight through). */
  const kgCells = weightCells();
  const wUnit = $derived(units.weight === "lb" ? t("log.lb") : t("log.kg"));
  const me = $derived(data.portal.kind === "signedIn" ? data.portal.me : null);

  const sessionId = $derived(page.params.sessionId ?? "");
  const today = localDateOf(Date.now());

  let week = $state<PortalWeek | null>(null);
  let session = $state<PortalSession | null>(null);
  let loadState = $state<"loading" | "ready" | "missing" | "failed">("loading");

  let rows = $state<PortalRow[]>([]);
  let cardio = $state<CardioForm>(cardioFormOf(null));
  let readiness = $state<ReadinessForm>({ ...EMPTY_READINESS });
  let notes = $state("");
  let flags = $state<ExerciseFlags>({});
  /** The first change to the form (ISO): Save minus this is how long the session took. */
  let startedAt = $state<string | null>(null);
  /** A skipped exercise's rows as they were, so Undo skip brings back what was typed. */
  let beforeSkip = $state<Record<string, PortalRow[]>>({});
  let date = $state(today);
  let current = $state(0);
  let restored = $state(false);
  /** Opened from this phone's copy of the week: the connection dropped. */
  let offline = $state(false);
  /** RPE is optional: hidden until asked for, so kg and reps share one row on a phone. */
  let showRpe = $state(false);
  let feelOpen = $state(false);
  /** "Skip or pain?" opened on this card. Paging closes it, unless the card has a skip or pain to show. */
  let issuesOpen = $state(false);

  /** Set after a save was refused for missing kg: from then on the missing cells are ringed live. */
  let kgChecked = $state(false);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let saved = $state<{ log: PortalSavedLog; sets: number; replaced: boolean; skipped: boolean; pain: boolean } | null>(null);
  let undoing = $state(false);
  let undone = $state(false);

  const cardioSession = $derived(session?.kind === "cardio");
  const byCoach = $derived(session?.log?.loggedBy === "trainer");
  const byYou = $derived(session?.log?.loggedBy === "client");
  const blocks = $derived(blocksOf(rows));
  const block = $derived(blocks[Math.min(current, blocks.length - 1)] ?? null);
  /** The form as the page opened it — nothing touched yet, so nothing worth a draft. */
  /** The form as the page opened it — the client's own saved log, else the plan. */
  const freshForm = (s: PortalSession): PortalLogForm => formOfSession(s, defaultLogDate(s, week?.startDate ?? null, today));
  const pristine = $derived(session ? freshForm(session).rows : []);
  const touched = $derived(touchedExercises(pristine, rows));
  const missingKg = $derived(kgChecked && session ? setsMissingKg(session, rows) : []);
  const missingKeys = $derived(new Set(missingKg.map((r) => r.key)));
  const exerciseOf = (peId: string) => session?.exercises.find((e) => e.id === peId) ?? null;
  /**
   * The card's sets as they're done on the floor. A superset or circuit runs round by
   * round under a "Set N" header (extras last, under their own); a single exercise as built.
   * Display order only: the rows, drafts and the save keep their build order.
   */
  const rounds = $derived.by(() => {
    if (!block) return [];
    const shown = (block.group ? roundOrder(block.rows) : block.rows).filter((r) => !r.exerciseSkip);
    if (!block.group) return [{ key: "all", brk: null as RoundBreak | null, rows: shown }];
    const breaks = roundBreaks(shown);
    const out: { key: string; brk: RoundBreak | null; rows: PortalRow[] }[] = [];
    for (const r of shown) {
      const brk = breaks.get(r.key);
      if (brk || out.length === 0) out.push({ key: brk ? (brk.kind === "extra" ? "extra" : `round-${brk.n}`) : "all", brk: brk ?? null, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  });
  /** "Circuit · 3 rounds" over a group card's title. */
  const groupKicker = $derived.by(() => {
    if (!block?.group) return "";
    const n = Math.max(1, ...block.rows.filter((r) => !r.extra).map((r) => r.setNumber));
    const kind = groupKind(block.memberIds.length) === "Circuit" ? t("log.circuit") : t("log.superset");
    return `${kind} · ${n === 1 ? t("log.roundsOne") : t("log.rounds", { n })}`;
  });
  /** Every exercise on a card, as the Next button names it: "SkiErg + Wall Ball". */
  const blockName = (b: { memberIds: string[] }) => b.memberIds.map((id) => exerciseOf(id)?.exerciseName ?? "").join(" + ");
  /** The rest this exercise prescribes (a superset: its first member's), for the timer. */
  const blockRest = $derived(block ? restOf(block.memberIds.flatMap((id) => exerciseOf(id)?.prescribedSets ?? [])) : null);
  // never before the week (the server refuses it), never in the future
  const minDate = $derived(week ? week.startDate : today);
  const maxDate = $derived(week && week.endDate < today ? week.endDate : today);

  function fresh(s: PortalSession) {
    const f = freshForm(s);
    rows = f.rows;
    cardio = f.cardio;
    readiness = f.readiness;
    notes = f.notes;
    flags = f.flags;
    startedAt = null;
    beforeSkip = {};
    date = f.date;
    current = 0;
    kgChecked = false;
  }

  async function load(id: string) {
    loadState = "loading";
    // the recap links straight to the next session: same page, fresh state
    saved = null;
    undone = false;
    error = null;
    restored = false;
    showRpe = false;
    feelOpen = false;
    let w: PortalWeek | null;
    try {
      const dto = await portalApi.week();
      w = dto.weeks.find((x) => x.loggable) ?? null;
      offline = false;
      // kept on this phone, so a dropped connection mid-workout can still open the session
      try {
        if (w) localStorage.setItem(PORTAL_WEEK_CACHE_KEY, portalWeekCacheJson(w));
      } catch {
        // storage full or private mode: no offline copy, nothing else changes
      }
    } catch {
      const cached = cachedSession(readStored(PORTAL_WEEK_CACHE_KEY), id, today);
      if (!cached) {
        loadState = "failed";
        return;
      }
      w = cached.week;
      offline = true;
    }
    const s = w?.sessions.find((x) => x.id === id) ?? null;
    week = w;
    session = s;
    if (!s) {
      loadState = "missing";
      return;
    }
    fresh(s);
    const draft = parsePortalDraft(readStored(portalDraftKey(id)), rows, cardioFormOf(s.cardio));
    if (draft && !sameForm(draft, freshForm(s))) {
      rows = draft.rows;
      cardio = draft.cardio;
      readiness = draft.readiness;
      notes = draft.notes;
      flags = draft.flags;
      startedAt = draft.startedAt ?? null;
      date = draft.date >= minDate && draft.date <= maxDate ? draft.date : freshForm(s).date;
      restored = true;
    }
    // a restored draft or a saved log may already carry a skip or pain: never hide it
    issuesOpen = flaggedAt(0);
    loadState = "ready";
  }

  function readStored(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  $effect(() => {
    void load(sessionId);
  });

  // Autosave the half-filled form on this phone; a save or "start over" clears it.
  $effect(() => {
    if (loadState !== "ready" || !session || saved || byCoach) return;
    const form = { rows, cardio, readiness, notes, date, flags, startedAt };
    // untouched prefill is not a draft: write nothing until the first real edit
    const dirty = !sameForm(form, freshForm(session));
    if (dirty && !startedAt) startedAt = new Date().toISOString();
    const json = dirty ? portalDraftJson(form) : null;
    const key = portalDraftKey(session.id);
    const timer = setTimeout(() => {
      try {
        if (json) localStorage.setItem(key, json);
        else localStorage.removeItem(key);
      } catch {
        // storage full or private mode: the form still works, it just won't survive a reload
      }
    }, 400);
    return () => clearTimeout(timer);
  });

  function startOver() {
    if (!session) return;
    localStorage.removeItem(portalDraftKey(session.id));
    fresh(session);
    restored = false;
    issuesOpen = flaggedAt(0);
  }

  function addSet(peId: string) {
    const last = [...rows].reverse().find((r) => r.programExerciseId === peId);
    if (!last) return;
    rows = withExtraSet(rows, peId, (n) => extraRow(last, n));
  }

  function toggleSkip(peId: string) {
    if (rows.some((r) => r.programExerciseId === peId && r.exerciseSkip)) {
      rows = unskipExercise(rows, peId, beforeSkip[peId]);
      const { [peId]: _gone, ...rest } = beforeSkip;
      beforeSkip = rest;
    } else {
      beforeSkip = { ...beforeSkip, [peId]: rows.filter((r) => r.programExerciseId === peId) };
      rows = skipExercise(rows, peId);
    }
  }
  const skipReasonOf = (peId: string) => rows.find((r) => r.programExerciseId === peId)?.exerciseSkip ?? null;
  const hurtOn = (peId: string) => flags[peId]?.kind === "pain";
  /** This card's skips and pain, as the tags under its title name them. */
  const cardIssues = $derived(
    !block
      ? []
      : block.memberIds.flatMap((peId) => [
          ...(skipReasonOf(peId) ? [{ peId, kind: "skip" as const }] : []),
          ...(hurtOn(peId) ? [{ peId, kind: "pain" as const }] : []),
        ]),
  );
  /** The card's exercises that can take another set: not skipped, under the cap. */
  const addable = $derived(!block ? [] : block.memberIds.filter((peId) => !skipReasonOf(peId) && rows.filter((r) => r.programExerciseId === peId).length < MAX_SETS));
  const flaggedAt = (i: number) => (blocks[i]?.memberIds ?? []).some((peId) => skipReasonOf(peId) || hurtOn(peId));
  /** Page to a card: its "Skip or pain?" panel starts closed unless something on it is flagged. */
  function goTo(i: number) {
    current = i;
    issuesOpen = flaggedAt(i);
  }
  /** A tag opens the panel at its exercise's row. */
  async function openIssue(peId: string) {
    issuesOpen = true;
    await tick();
    const row = document.getElementById(`issue-${peId}`);
    if (!row) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    row.scrollIntoView({ block: "nearest", behavior: still ? "auto" : "smooth" });
    row.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
  }
  const toggleMissed = (key: string) => (rows = rows.map((r) => (r.key === key ? { ...r, skipped: !r.skipped } : r)));

  /** Page to the first set still missing its kg, scroll it into view, ring it, and put the cursor there. */
  async function jumpToMissing() {
    const first = missingKg[0];
    if (!first) return;
    const at = blocks.findIndex((b) => b.memberIds.includes(first.programExerciseId));
    if (at >= 0 && at !== current) goTo(at);
    await tick();
    const el = document.getElementById(`kg-${first.key}`);
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: still ? "auto" : "smooth" });
    el.focus({ preventScroll: true });
  }

  async function save() {
    if (!session || saving) return;
    error = null;
    cardioProblem = null;
    const built = buildPortalLog(session, { rows, cardio, readiness, notes, date, flags, startedAt }, byYou);
    if ("error" in built) {
      if (built.error === "kg") {
        kgChecked = true;
        await jumpToMissing();
        return;
      }
      if (built.error === "nothing") {
        error = t("log.nothing");
        return;
      }
      cardioProblem = built.error === "activity" ? "modality" : built.error;
      error = cardioErrorText(cardioProblem);
      return;
    }
    saving = true;
    try {
      const log = await portalApi.log(built.input);
      localStorage.removeItem(portalDraftKey(session.id));
      saved = { log, sets: built.sets, replaced: byYou, skipped: !!built.input.cardio?.skipped, pain: !!built.input.cardio?.pain?.reported || built.input.cardio?.skipped?.reason === "pain" };
      undone = false;
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof PortalDuplicateError) {
        // someone logged it meanwhile: show who, from fresh data
        error = e.existing.loggedBy === "trainer" ? t("log.byCoach") : t("log.byYou", { date: fmtShortDate(e.existing.date) });
        if (session) session = { ...session, log: { id: e.existing.id, loggedBy: e.existing.loggedBy, date: e.existing.date } };
      } else {
        const status = (e as { status?: unknown }).status;
        // the server's schema refused a value: say so, never "check your connection"
        error = status === 422 ? (/invalid log/.test((e as Error).message) ? t("log.invalid") : t("log.notThisWeek")) : t("log.error");
      }
    } finally {
      saving = false;
    }
  }

  async function undo() {
    if (!saved || undoing) return;
    undoing = true;
    try {
      await portalApi.deleteLog(saved.log.id);
      undone = true;
    } catch {
      error = t("log.error");
    } finally {
      undoing = false;
    }
  }

  const readinessText: ReadinessText = $derived({
    title: t("log.readiness"),
    optional: t("log.optional"),
    hint: t("log.readinessHint"),
    scale: {
      energy: { label: t("log.energy"), low: t("log.energyLow"), high: t("log.energyHigh") },
      sleep: { label: t("log.sleep"), low: t("log.sleepLow"), high: t("log.sleepHigh") },
      soreness: { label: t("log.soreness"), low: t("log.sorenessLow"), high: t("log.sorenessHigh") },
    },
    valueLabel: (label, v, max) => t("log.scaleValue", { label, v, max }),
  });
  const CARDIO_ERROR_KEY: Record<CardioFormError, MessageKey> = {
    modality: "log.cardioNeedsActivity",
    duration: "log.cardioNeedsDuration",
    durationRange: "log.cardioDurationRange",
    rpe: "log.cardioNeedsRpe",
    maxHr: "log.cardioMaxHr",
    avgHrRange: "log.cardioAvgHrRange",
    maxHrRange: "log.cardioMaxHrRange",
    distanceRange: "log.cardioDistanceRange",
    caloriesRange: "log.cardioCaloriesRange",
    intervalRange: "log.cardioIntervalRange",
  };
  const cardioText: CardioFormText = $derived({
    modality: t("cardio.activity"),
    modalityPlaceholder: t("cardio.activityPlaceholder"),
    duration: t("cardio.duration"),
    durationHint: t("cardio.durationHint"),
    underPlan: t("cardio.underPlan"),
    rpe: t("cardio.rpe"),
    rpeHint: t("cardio.rpeHint"),
    rpeFeel: [t("rpe.feel1"), t("rpe.feel2"), t("rpe.feel3"), t("rpe.feel4"), t("rpe.feel5")],
    distance: t("cardio.distance"),
    avgHr: t("cardio.avgHr"),
    maxHr: t("cardio.maxHr"),
    pain: t("cardio.pain"),
    painNote: t("cardio.painNote"),
    painSafety: t("cardio.painSafety"),
    more: t("cardio.more"),
    calories: t("cardio.calories"),
    intervals: t("cardio.intervals"),
    intervalsHint: t("cardio.intervalsHint"),
    rep: t("cardio.rep"),
    time: t("cardio.time"),
    pace: t("cardio.pace"),
    load: t("cardio.load"),
    skip: t("cardio.skip"),
    skipped: t("cardio.skipped"),
    skipReason: t("cardio.skipReason"),
    undoSkip: t("cardio.undoSkip"),
    reasons: { time: t("log.reason.time"), pain: t("log.reason.pain"), equipment: t("log.reason.equipment"), other: t("log.reason.other") },
    modalityError: t("log.cardioNeedsActivity"),
    maxHrError: t("log.cardioMaxHr"),
    minutes: t("cardio.min"),
    types: {
      warmup: t("iv.warmup"),
      work: t("iv.work"),
      active_recovery: t("iv.active_recovery"),
      passive_recovery: t("iv.passive_recovery"),
      cooldown: t("iv.cooldown"),
    },
    repOf: t("cardio.repOf"),
    optional: t("log.optional"),
    distanceUnits: { km: t("cardio.km"), mi: t("cardio.mi") },
    errors: Object.fromEntries(Object.entries(CARDIO_ERROR_KEY).map(([k, key]) => [k, t(key)])) as Record<CardioFormError, string>,
    junkTime: t("input.junkTime"),
    timePlaceholder: t("input.timePlaceholder"),
    rangeWords: { between: t("input.between"), atLeast: t("input.atLeast"), atMost: t("input.atMost") },
    paceWords: { perKm: t("unit.perKm"), perMi: t("unit.perMi"), per500m: t("unit.per500m"), kmh: t("unit.kmh"), mph: t("unit.mph") },
    kcal: t("unit.kcal"),
    // the member sees load as a plain number; AU is the coach's word
    loadUnit: "",
    stepWords: { up: t("input.increase"), down: t("input.decrease") },
  });
  /** The cardio field the last save was missing: ringed in the form as well as named by the save bar. */
  let cardioProblem = $state<CardioFormError | null>(null);
  const cardioErrorText = (e: CardioFormError) => t(CARDIO_ERROR_KEY[e]);
  // A corrected field clears its error: once a save named a problem, it's re-checked as the form changes.
  $effect(() => {
    if (!cardioProblem) return;
    const built = cardioLogOf(cardio);
    const now = "error" in built ? built.error : null;
    if (now === cardioProblem) return;
    cardioProblem = now;
    error = now ? cardioErrorText(now) : null;
  });

  /** The load cell's words for one set: BW or kg, and the switch named for the set. */
  const loadText = (r: PortalRow): LoadCellText => ({
    unit: wUnit,
    added: t("log.addedUnit", { unit: wUnit }),
    load: t("log.load"),
    bodyweight: t("log.bodyweight"),
    bw: t("log.bw"),
    addLoad: t("log.addLoad", { unit: wUnit }),
    toBw: t("log.toBw", { name: r.name, n: r.setNumber }),
    toLoad: t("log.toLoad", { name: r.name, n: r.setNumber }),
  });

  /** "Target 6–8 reps · 100 kg · RPE 8" — the plan beside the cells, always with its unit. */
  function targetOf(r: PortalRow): string {
    const ex = exerciseOf(r.programExerciseId);
    const ps = ex?.prescribedSets.find((s) => s.setNumber === r.setNumber);
    if (!ps || r.extra) return "";
    const [, ...rest] = setParts([ps], t);
    return [`${t("log.target")} ${setTarget(ps, t)}`, ...rest.filter((p) => !p.startsWith(t("rx.rest", { t: "" }).trim()))].join(" · ");
  }
  const feelSummary = $derived(
    (["energy", "sleep", "soreness"] as const)
      .filter((k) => readiness[k] != null)
      .map((k) => `${readinessText.scale[k].label} ${readiness[k]}`)
      .join(" · "),
  );
  /** The week as it stands after this save: how far along, and what's next. */
  const after = $derived.by(() => {
    if (!saved || !week || !session) return null;
    const id = session.id;
    const log = { id: saved.log.id, loggedBy: "client" as const, date: saved.log.date, ...(savedSkipped ? { skipped: true } : {}) };
    const w: PortalWeek = { ...week, sessions: week.sessions.map((s) => (s.id === id ? { ...s, log } : s)) };
    const next = focusSession(w, today);
    const day = next ? (dayGroups(w, today).find((g) => g.sessions.some((s) => s.id === next.id)) ?? null) : null;
    const when = !day ? "" : day.weekday === 0 ? t("week.anyDay") : day.isToday ? t("week.today") : weekdayName(day.weekday);
    return { done: doneCount(w), total: w.sessions.length, next, when };
  });
  /** The save said "didn't do it": noted, never counted as done. */
  const savedSkipped = $derived(!!saved?.skipped);
  const savedLine = $derived(
    !saved ? "" : savedSkipped ? t("log.savedSkippedLine") : cardioSession ? t("log.savedCardio") : saved.sets === 1 ? t("log.savedOneSet") : t("log.savedSets", { n: saved.sets }),
  );
</script>

<svelte:head><title>{session?.name ?? t("app.title")} · Program Tracker</title></svelte:head>

<svelte:window ononline={() => (offline = false)} />

<PortalBar coach={me?.trainer.name ?? null} />

<a class="back" href="/me"><Icon name="chevron" />{t("log.back")}</a>

{#if loadState === "loading"}
  <div class="sk" aria-hidden="true">
    <Skeleton shape="line" w="60%" h="26px" />
    <Skeleton h="120px" />
    <Skeleton h="220px" />
  </div>
  <p class="sr-only" role="status">{t("week.loading")}</p>
{:else if loadState === "failed"}
  <div class="empty" role="alert">
    <p class="empty-title">{t("week.error")}</p>
    <Button onclick={() => load(sessionId)}>{t("week.retry")}</Button>
  </div>
{:else if loadState === "missing" || !session}
  <div class="empty"><p class="empty-title">{t("log.notFound")}</p></div>
{:else if saved}
  <!-- After save: one calm confirmation, Undo beside it, then back to the week. -->
  <section class="recap" aria-live="polite">
    {#if undone}
      <h1>{t("log.undone")}</h1>
      <a class="btn primary done-btn" href="/me">{t("log.done")}</a>
    {:else}
      {#if savedSkipped}
        <h1>{t("log.savedSkipped")}</h1>
      {:else}
        <span class="tick" aria-hidden="true"><Icon name="check" /></span>
        <h1>{t("log.saved")}</h1>
      {/if}
      <p class="recap-line">{session.name} · {savedLine} · {fmtDay(saved.log.date)}</p>
      {#if saved.pain}<p class="safety" role="note">{t("cardio.painSafety")}</p>{/if}
      {#if after}
        <div class="week-now">
          <p class="count tnum">{t("log.weekCount", { done: after.done, total: after.total })}</p>
          <div class="bar" aria-hidden="true"><span style:width={`${(after.done / Math.max(1, after.total)) * 100}%`}></span></div>
          {#if after.next}
            <p class="next-line">
              <span class="next-k">{t("log.nextUp")}</span>
              <a href={`/me/log/${after.next.id}`} lang={latinLang(after.next.name)}>{after.next.name}</a>{#if after.when}<span class="next-when">{" · "}{after.when}</span>{/if}
            </p>
          {:else}
            <p class="next-line">{t("log.weekDone")}</p>
          {/if}
        </div>
      {/if}
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <div class="recap-actions">
        <a class="btn primary done-btn" href="/me">{t("log.done")}</a>
        {#if !saved.replaced}
          <Button onclick={undo} disabled={undoing}><Icon name="undo" />{undoing ? t("log.undoing") : t("log.undo")}</Button>
        {/if}
      </div>
    {/if}
  </section>
{:else}
  <!-- novalidate: a prescribed 12 s or 7.5 kg is off the steppers' step, and the browser would
       silently refuse it; buildPortalLog is the one gate. -->
  <form class="log" novalidate onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <header class="head">
      <h1 lang={latinLang(session.name)}>{session.name}</h1>
      <label class="date">
        <span>{t("log.date")}</span>
        <input class="input tnum" type="date" bind:value={date} min={minDate} max={maxDate} lang={i18n.locale} disabled={byCoach} />
      </label>
    </header>

    {#if session.notes}
      <!-- the coach's word on the whole session, before any set -->
      <p class="session-note"><span>{t("session.coachNote")}</span> {session.notes}</p>
    {/if}

    {#if byCoach}
      <Note tone="warn" role="note">{t("log.byCoach")}</Note>
    {:else if byYou && session.log}
      <Note tone="warn" role="note">{t("log.byYou", { date: fmtShortDate(session.log.date) })}</Note>
    {/if}
    {#if offline}
      <Note tone="warn" role="status">{t("log.offline")}</Note>
    {/if}
    {#if restored}
      <Note tone="ok" role="note" class="draft">
        <span>{t("log.draftRestored")}</span>
        <button type="button" class="link-btn" onclick={startOver}>{t("log.discard")}</button>
      </Note>
    {/if}

    {#if !byCoach}
      <!-- How they felt going in: optional, folded, first — before the work, as it happened. -->
      <details class="feel" bind:open={feelOpen}>
        <summary>
          <span class="sub-h">{t("log.readiness")}</span>
          <span class="opt">{feelSummary || t("log.optional")}</span>
          <Icon name="chevron" />
        </summary>
        <ReadinessStrip bind:value={readiness} variant="touch" text={readinessText} />
      </details>

      {#if !cardioSession && block}
        <p class="warmups">{t("log.warmups")}</p>
      {/if}

      {#if cardioSession}
        <CardioLogForm bind:value={cardio} text={cardioText} variant="touch" problem={cardioProblem} metric={modalityMetric(cardio.modality || session.cardio?.modality)} plannedSec={cardioFormOf(session.cardio).durationSec} showModality={(m) => modalityName(m, i18n.locale)} storeModality={modalityStored} notes={notesField} />
      {:else if block}
        <section class="ex" aria-labelledby="ex-title">
          <div class="pager">
            <button type="button" class="pg" aria-label={t("log.prev")} disabled={current === 0} onclick={() => goTo(current - 1)}>
              <Icon name="chevron" />
            </button>
            <p class="pg-pos tnum">{t("log.exercise", { n: current + 1, total: blocks.length })}</p>
            <button type="button" class="pg next" aria-label={t("log.next")} disabled={current >= blocks.length - 1} onclick={() => goTo(current + 1)}>
              <Icon name="chevron" />
            </button>
          </div>
          <div class="steps" aria-hidden="true">
            {#each blocks as b, i (b.key)}
              {@const done = b.memberIds.some((id) => touched.has(id) || flags[id])}
              <span class:on={i === current} class:done>{#if done}<Icon name="check" />{/if}</span>
            {/each}
          </div>

          {#if groupKicker}<p class="kicker">{groupKicker}</p>{/if}
          <h2 id="ex-title">
            {#each block.memberIds as peId, i (peId)}
              {#if i > 0}<span class="plus">{" + "}</span>{/if}<span lang={latinLang(exerciseOf(peId)?.exerciseName)}>{exerciseOf(peId)?.exerciseName ?? ""}</span>
            {/each}
          </h2>
          {#if cardIssues.length > 0}
            <!-- what's flagged stays in sight while the panel is shut; a tap opens it at that exercise -->
            <ul class="tags">
              {#each cardIssues as is (`${is.kind}-${is.peId}`)}
                {@const label = `${is.kind === "skip" ? t("log.tagSkipped") : t("log.tagPain")}${block.memberIds.length > 1 ? ` · ${exerciseOf(is.peId)?.exerciseName ?? ""}` : ""}`}
                <li>
                  <button type="button" class="tag" aria-controls="issues-panel" onclick={() => openIssue(is.peId)}>
                    <Pill tone={is.kind === "pain" ? "bad" : "neutral"}>{label}</Pill>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
          {#each block.memberIds as peId (peId)}
            {@const ex = exerciseOf(peId)}
            {#if ex?.notes}<p class="cue"><span>{t("session.coachNote")}</span> {ex.notes}</p>{/if}
            {#if ex?.last}
              <!-- a reference to beat or match, not a suggestion: the coach sets the load -->
              <p class="last"><span>{t("log.last", { date: fmtShortDate(ex.last.date) })}{#if block.memberIds.length > 1}{" · "}<span lang={latinLang(ex.exerciseName)}>{ex.exerciseName}</span>{/if}</span> <span class="tnum">{lastSetText(ex.last, t)}</span></p>
            {/if}
          {/each}

          <button type="button" class="rpe-toggle" aria-expanded={showRpe} aria-controls="rpe-def" onclick={() => (showRpe = !showRpe)}>
            {showRpe ? t("log.rpeHide") : t("log.rpeShow")}
          </button>
          {#if showRpe}<p class="rpe-def" id="rpe-def">{t("log.rpeDef")}</p>{/if}

          <ol class="sets">
            {#each rounds as g (g.key)}
              {#if g.brk}
                <li class="round">
                  <h3 class="round-h">{g.brk.kind === "extra" ? t("log.extraSets") : t("log.set", { n: g.brk.n })}</h3>
                  <ol class="sets">
                    {#each g.rows as r (r.key)}{@render setItem(r, true)}{/each}
                  </ol>
                </li>
              {:else}
                {#each g.rows as r (r.key)}{@render setItem(r, false)}{/each}
              {/if}
            {/each}
          </ol>
          {#if block.memberIds.length === 1}
            {#each addable as peId (peId)}
              <button type="button" class="add" onclick={() => addSet(peId)}><Icon name="plus" />{t("log.addSet")}</button>
            {/each}
          {:else if addable.length > 0}
            <!-- a group: one "Add a set" line, a name per exercise, instead of a stack of links -->
            <div class="adds" role="group" aria-label={t("log.addSet")}>
              <span class="adds-k" aria-hidden="true"><Icon name="plus" />{t("log.addSet")}</span>
              {#each addable as peId (peId)}
                {@const name = exerciseOf(peId)?.exerciseName ?? ""}
                <button type="button" class="add add-ex" aria-label={`${t("log.addSet")} · ${name}`} lang={latinLang(name)} onclick={() => addSet(peId)}>{name}</button>
              {/each}
            </div>
          {/if}

          <!-- What didn't go to plan, in the coach's own vocabulary: a skip (with a reason) or pain.
               Rarely needed, so one quiet link under the sets; the tags above keep anything flagged in sight. -->
          <button type="button" class="issues-toggle" aria-expanded={issuesOpen} aria-controls="issues-panel" onclick={() => (issuesOpen = !issuesOpen)}>
            {t("log.issues")}<Icon name="chevron" />
          </button>
          {#if issuesOpen}
            <div class="issues-panel" id="issues-panel">
              {#each block.memberIds as peId (peId)}
                {@const ex = exerciseOf(peId)}
                {@const skip = skipReasonOf(peId)}
                {@const hurt = hurtOn(peId)}
                {@const named = block.memberIds.length > 1}
                <div class="issues" id={`issue-${peId}`} role={named ? "group" : undefined} aria-labelledby={named ? `issue-${peId}-name` : undefined}>
                  {#if named}<p class="issue-name" id={`issue-${peId}-name`} lang={latinLang(ex?.exerciseName)}>{ex?.exerciseName ?? ""}</p>{/if}
                  <div class="issue-btns">
                    <button type="button" class="chip" aria-pressed={!!skip} onclick={() => toggleSkip(peId)}>{skip ? t("log.unskip") : t("log.skip")}</button>
                    <button type="button" class="chip" class:bad={hurt} aria-pressed={hurt} onclick={() => (flags = toggleFlag(flags, peId, "pain"))}>{t("log.hurt")}</button>
                  </div>
                  {#if skip}
                    <p class="issue-note">{t("log.skippedNote")}</p>
                    <div class="reasons" role="group" aria-label={t("log.skipWhy")}>
                      <span class="reasons-k">{t("log.skipWhy")}</span>
                      {#each SKIP_REASONS as reason (reason)}
                        <button type="button" class="chip sm" aria-pressed={skip.reason === reason} onclick={() => (rows = setSkipReason(rows, peId, skip.reason === reason ? null : (reason as SkipReason)))}>{t(`log.reason.${reason}`)}</button>
                      {/each}
                    </div>
                  {/if}
                  {#if hurt}
                    <label class="hurt">
                      <span>{t("log.hurtWhere")}</span>
                      <input class="input" type="text" maxlength={FLAG_NOTE_MAX} value={flags[peId]?.note ?? ""} oninput={(e) => (flags = setFlagNote(flags, peId, e.currentTarget.value))} />
                      <span class="hint">{t("log.hurtHint")}</span>
                    </label>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if blockRest}
            <!-- one timer for the whole session: paging to the next exercise doesn't reset a running rest -->
            <RestTimer seconds={blockRest} />
          {/if}

          {#if current < blocks.length - 1}
            <button type="button" class="btn next-ex" onclick={() => { goTo(current + 1); document.getElementById("ex-title")?.scrollIntoView({ block: "start" }); }}>
              <span>{t("log.next")} · {blockName(blocks[current + 1])}</span>
              <Icon name="chevron" />
            </button>
          {/if}
        </section>
      {/if}

      {#if !cardioSession}{@render notesField()}{/if}

      <div class="savebar">
        <div role="alert" class="alerts">
          {#if missingKg.length > 0}
            <button type="button" class="err err-btn" onclick={jumpToMissing}>
              {missingKg.length === 1 ? t("log.needKgOne") : t("log.needKg", { n: missingKg.length })}<Icon name="chevron" />
            </button>
          {:else if error}<p class="err">{error}</p>{/if}
        </div>
        <button type="submit" class="btn primary save" disabled={saving}>{saving ? t("log.saving") : t("log.save")}</button>
      </div>
    {/if}
  </form>
{/if}

{#snippet setItem(r: PortalRow, inRound: boolean)}
  {@const i = rows.findIndex((x) => x.key === r.key)}
  {@const target = targetOf(r)}
  <li class="set">
    <div class="set-head">
      <!-- the row's name over its target: in a round the header says the set, so the row names the exercise -->
      <span class="set-id">
        {#if inRound}
          <span class="set-n" lang={latinLang(r.name)}>{r.name}</span>
        {:else}
          <span class="set-n">{t("log.set", { n: r.setNumber })}</span>
        {/if}
        {#if target}<span class="set-rx">{target}</span>{/if}
      </span>
      {#if r.extra}
        <button type="button" class="rm" aria-label={inRound ? t("log.removeSetEx", { name: r.name, n: r.setNumber }) : t("log.removeSet", { n: r.setNumber })} onclick={() => (rows = withoutExtra(rows, r.key))}><Icon name="x" /></button>
      {:else}
        <button type="button" class="missed-btn" aria-pressed={!!r.skipped} aria-label={inRound ? t("log.missedLabelEx", { name: r.name, n: r.setNumber }) : t("log.missedLabel", { n: r.setNumber })} onclick={() => toggleMissed(r.key)}>{t("log.missed")}</button>
      {/if}
    </div>
    {#if r.skipped}
      <p class="missed-note">{t("log.missedNote")}</p>
    {:else}
    <div class="cells">
      {#if !r.timed}
        <!-- the load held or added: BW is none. kg is stored; the member sees and types their own unit -->
        <LoadCell
          bind:value={() => kgCells.get(r.key, rows[i].weight), (v) => (rows[i].weight = kgCells.set(r.key, v))}
          mode={r.load}
          onmode={(m) => (rows = setLoad(rows, r.key, m))}
          added={!!exerciseOf(r.programExerciseId)?.bodyweight}
          id={`kg-${r.key}`}
          error={missingKeys.has(r.key) ? t("log.kgCell") : undefined}
          errorId={`kg-${r.key}-err`}
          text={loadText(r)}
          label={`${r.name} ${t("log.set", { n: r.setNumber })}, ${exerciseOf(r.programExerciseId)?.bodyweight ? t("log.addedUnit", { unit: wUnit }) : wUnit}`} step={weightStepIn()} min={0} max={units.weight === "lb" ? 1300 : 600} from={r.rx?.targetWeightKg != null ? showLoad(r.rx.targetWeightKg) : null} />
      {/if}
      <LogStepper
        bind:value={rows[i].reps}
        label={`${r.name} ${t("log.set", { n: r.setNumber })}, ${r.timed ? t("log.seconds") : t("log.reps")}`}
        unit={r.timed ? t("log.seconds") : t("log.reps")}
        step={r.timed ? 5 : 1}
        min={0}
        max={r.timed ? 3600 : 200}
        inputmode="numeric"
      />
      {#if showRpe}
        <LogStepper bind:value={rows[i].rpe} label={`${r.name} ${t("log.set", { n: r.setNumber })}, RPE`} unit={`${t("log.rpe")} · ${t("log.optional")}`} step={0.5} min={1} max={10} from={r.rx?.targetRpe ?? 7} />
      {/if}
    </div>
    {/if}
  </li>
{/snippet}

{#snippet notesField()}
  <label class="notes">
    <span class="sub-h">{t("log.notes")}</span>
    <textarea class="input" rows="3" maxlength="2000" placeholder={cardioSession ? t("cardio.notesPlaceholder") : t("log.notesPlaceholder")} bind:value={notes}></textarea>
  </label>
{/snippet}

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    margin: 4px 0 0 -6px;
    padding: 0 6px;
    font: 500 16px/1 var(--font-ui);
    color: var(--blue);
  }
  .back :global(svg) { width: 16px; height: 16px; transform: rotate(90deg); }

  .sk { display: grid; gap: 14px; margin-top: 12px; }
  .sk :global(.skeleton) { display: block; }

  /* the narrow log sheet: LogStepper's 44px steppers key off this container */
  .log { container: logform / inline-size; display: grid; gap: 18px; margin-top: 8px; padding-bottom: 96px; }
  .head { display: grid; gap: 12px; }
  h1 { margin: 0; font: 600 24px/1.25 var(--font-ui); letter-spacing: -0.01em; text-wrap: balance; }
  .date { display: flex; align-items: center; gap: 12px; font-size: 14px; color: var(--muted); }
  .date .input { flex: 1; max-width: 220px; min-height: 44px; font-size: 16px; }
  .log :global(.draft) { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .link-btn {
    min-height: 44px;
    padding: 0 4px;
    font: 500 14px/1 var(--font-ui);
    color: inherit;
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .ex { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .pager { display: flex; align-items: center; gap: 8px; }
  .pg {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--ink);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .pg :global(svg) { width: 18px; height: 18px; transform: rotate(90deg); }
  .pg.next :global(svg) { transform: rotate(-90deg); }
  .pg:disabled { color: var(--faint); cursor: default; opacity: 0.6; }
  .pg-pos { flex: 1; margin: 0; text-align: center; font-size: 14px; color: var(--muted); }
  /* where you are, and a tick on every exercise you've changed */
  .steps { display: flex; gap: 4px; }
  .steps span {
    flex: 1;
    display: grid;
    place-items: center;
    height: 16px;
    border-radius: 4px;
    background: var(--well-2);
  }
  .steps span.done { color: var(--good); background: var(--good-bg); box-shadow: inset 0 0 0 1px var(--good-line); }
  .steps span.on { box-shadow: inset 0 0 0 2px var(--ink); }
  .steps span.on:not(.done) { background: var(--surface); }
  .steps span :global(svg) { width: 12px; height: 12px; }
  .rpe-def { margin: 0; font-size: 13px; color: var(--muted); text-wrap: pretty; }
  .rpe-toggle {
    justify-self: start;
    min-height: 44px;
    margin: -8px 0 -12px -4px;
    padding: 0 4px;
    font: 500 14px/1 var(--font-ui);
    color: var(--blue);
    background: none;
    border: 0;
    cursor: pointer;
  }
  h2 { margin: 4px 0 0; font: 600 20px/1.3 var(--font-ui); text-wrap: balance; }
  .plus { color: var(--muted); font-weight: 400; }
  .kicker { margin: 4px 0 -8px; font: 600 13px/1.3 var(--font-ui); color: var(--muted); }
  .cue { margin: 0; font-size: 14px; }
  .session-note { margin: 0; padding: 12px 16px; font-size: 16px; background: var(--well); border-radius: var(--radius); text-wrap: pretty; }
  .session-note span { font-weight: 600; color: var(--muted); }
  .warmups { margin: -6px 0; font-size: 13px; color: var(--muted); }
  .cue span { font-weight: 600; color: var(--muted); }
  .last { margin: 0; font-size: 14px; }
  .last > span:first-child { color: var(--muted); }
  .last .tnum { font-weight: 600; }

  /* skip or pain: tags under the title, a quiet link under the sets, the chips in a panel */
  .tags { display: flex; flex-wrap: wrap; gap: 0 4px; margin: -8px 0 -10px -6px; padding: 0; list-style: none; }
  .tag { display: inline-flex; align-items: center; max-width: 100%; min-height: 44px; padding: 0 6px; background: none; border: 0; border-radius: var(--radius); cursor: pointer; }
  .tag :global(.pill) { max-width: 100%; overflow: hidden; text-overflow: ellipsis; font-size: 13px; }
  .issues-toggle {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    justify-self: start;
    min-height: 44px;
    margin: -8px 0 -4px -4px;
    padding: 0 4px;
    font: 500 14px/1 var(--font-ui);
    color: var(--blue);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .issues-toggle :global(svg) { width: 14px; height: 14px; transition: transform 150ms ease-out; }
  .issues-toggle[aria-expanded="true"] :global(svg) { transform: rotate(180deg); }
  .issues-panel { display: grid; gap: 14px; padding: 12px; background: var(--well); border-radius: var(--radius); }
  .issues-panel .issues + .issues { padding-top: 14px; border-top: 1px solid var(--line); }
  .issue-name { margin: 0; font: 600 14px/1.3 var(--font-ui); }
  .issues-panel .chip:not([aria-pressed="true"]) { background: var(--surface); }
  .issues { display: grid; gap: 10px; }
  .issue-btns, .reasons { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .chip {
    min-height: 44px;
    padding: 0 14px;
    font: 500 14px/1 var(--font-ui);
    color: var(--ink);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 99px;
    cursor: pointer;
  }
  .chip[aria-pressed="true"] { color: var(--surface); background: var(--ink); border-color: var(--ink); }
  .chip.bad[aria-pressed="true"] { color: var(--bad); background: var(--bad-bg); border-color: var(--bad); }
  .chip.sm { min-height: 40px; padding: 0 12px; }
  .reasons-k { width: 100%; font-size: 13px; color: var(--muted); }
  .issue-note { margin: 0; font-size: 14px; color: var(--muted); }
  .hurt { display: grid; gap: 6px; font-size: 14px; }
  .hurt .input { min-height: 44px; font-size: 16px; }
  .hint { font-size: 13px; color: var(--muted); }
  /* 44px to hit, pulled into the row's margins so it sits on the name's line and its word
     lines up with the fields' right edge */
  .missed-btn {
    min-height: 44px;
    margin: -12px -8px -12px 0;
    padding: 0 8px;
    font: 500 13px/1 var(--font-ui);
    color: var(--muted);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius);
    cursor: pointer;
  }
  .missed-btn[aria-pressed="true"] { color: var(--ink); background: var(--well-2); border-color: var(--line); }
  .missed-note { margin: 0; font-size: 14px; color: var(--muted); }

  .sets { display: grid; margin: 0; padding: 0; list-style: none; }
  .set { display: grid; gap: 8px; padding: 12px 0; border-top: 1px solid var(--line-soft); }
  .set-head { display: flex; align-items: flex-start; gap: 8px; min-height: 24px; }
  .set-n { font: 600 16px/1.3 var(--font-ui); }
  /* a group card's round: the tinted band is the divider, so no rule above it */
  .round + .round { margin-top: 12px; }
  .round-h { margin: 4px 0 0; padding: 6px 10px; font: 600 14px/1.3 var(--font-ui); background: var(--well); border-radius: var(--radius); }
  .round .set:first-child { border-top: 0; }
  .set-id { display: grid; gap: 2px; min-width: 0; }
  .set-id + .missed-btn, .set-id + .rm { margin-left: auto; }
  .set-rx { font: 400 13px/1.35 var(--font-ui); font-variant-numeric: tabular-nums; color: var(--muted); }
  .rm {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    margin: -12px -14px -12px 0;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .rm :global(svg) { width: 16px; height: 16px; }
  /* both heads are one label line tall (the BW switch sits on the load label's baseline), so the fields line up */
  .cells { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 10px 12px; }
  @container logform (min-width: 520px) {
    .cells { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  /* the card's text links (Log RPE, Add a set, Skip or pain?) share the content's left edge: their 4px padding hangs outside it */
  .add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    min-height: 44px;
    margin-left: -4px;
    padding: 0 4px;
    font: 500 16px/1 var(--font-ui);
    color: var(--blue);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .add :global(svg) { width: 16px; height: 16px; }
  .adds { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 14px; }
  .adds-k { display: inline-flex; align-items: center; gap: 6px; font: 500 14px/1.3 var(--font-ui); color: var(--muted); }
  .adds-k :global(svg) { width: 14px; height: 14px; }
  .add-ex { min-width: 44px; margin-left: 0; justify-content: center; }
  /* a group names every exercise: wrap rather than widen the card */
  .next-ex { justify-content: space-between; gap: 12px; min-height: 48px; padding-block: 10px; font-size: 16px; line-height: 1.35; text-align: left; white-space: normal; }
  .next-ex :global(svg) { flex: none; width: 16px; height: 16px; transform: rotate(-90deg); }

  .feel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .feel summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 16px;
    cursor: pointer;
    list-style: none;
  }
  .feel summary::-webkit-details-marker { display: none; }
  .feel summary .opt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .feel summary :global(svg) { flex: none; width: 16px; height: 16px; color: var(--muted); transition: transform 150ms ease-out; }
  .feel[open] summary :global(svg) { transform: rotate(180deg); }
  .feel :global(.readiness) { padding: 4px 16px 16px; }
  .sub-h { margin: 0; font: 600 16px/1.3 var(--font-ui); }
  .opt { font-weight: 400; color: var(--muted); }
  .notes { display: grid; gap: 8px; }
  .notes textarea { min-height: 88px; font-size: 16px; resize: vertical; }

  /* one green action, always in reach: sticky over the safe area */
  .savebar {
    position: sticky;
    bottom: 0;
    display: grid;
    gap: 8px;
    margin: 0 -16px;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--bg);
    border-top: 1px solid var(--line);
  }
  .save { justify-content: center; width: 100%; min-height: 52px; font-size: 16px; font-weight: 600; }
  .err { margin: 0; font-size: 14px; font-weight: 500; color: var(--bad); }
  .alerts:empty { display: none; }
  .err-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    margin: -8px 0;
    padding: 0;
    font-family: var(--font-ui);
    text-align: left;
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .err-btn :global(svg) { flex: none; width: 14px; height: 14px; transform: rotate(-90deg); }
  /* the missing kg cell: ringed, not just red-bordered, so it's found at arm's length */
  .log :global(.lstep.invalid .lstep-input) { box-shadow: 0 0 0 2px var(--bad); position: relative; z-index: 1; }

  .recap { display: grid; justify-items: start; gap: 12px; margin-top: 10vh; }
  .tick {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 99px;
    color: var(--good);
    background: var(--good-bg);
    border: 1px solid var(--good-line);
  }
  .tick :global(svg) { width: 24px; height: 24px; }
  /* the one authored moment: the circle settles, then the tick draws itself */
  .tick { animation: tick-pop 420ms cubic-bezier(0.16, 1, 0.3, 1) both; }
  .tick :global(path) { stroke-dasharray: 24; animation: tick-draw 380ms 160ms cubic-bezier(0.16, 1, 0.3, 1) both; }
  @keyframes tick-pop { from { transform: scale(0.72); } }
  @keyframes tick-draw { from { stroke-dashoffset: 24; } }
  .week-now { display: grid; gap: 8px; width: 100%; padding: 12px 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .count { margin: 0; font-weight: 600; }
  .bar { height: 6px; border-radius: 99px; background: var(--well-2); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: 99px; background: var(--good); }
  .next-line { margin: 0; font-size: 14px; color: var(--muted); }
  .next-k { margin-right: 6px; font-weight: 600; color: var(--ink); }
  .next-line a { display: inline-block; padding: 12px 0; margin: -12px 0; font-weight: 500; }
  .recap-line { margin: 0; color: var(--muted); }
  .recap-actions { display: grid; gap: 10px; width: 100%; margin-top: 12px; }
  .recap-actions :global(.btn) { justify-content: center; min-height: 48px; font-size: 16px; }
  .done-btn { justify-content: center; min-height: 48px; font-size: 16px; width: 100%; }

  .empty { display: grid; justify-items: center; gap: 8px; margin-top: 16px; padding: 40px 16px; text-align: center; border: 1px dashed var(--line); border-radius: var(--radius); }
  .empty-title { margin: 0; font-weight: 600; }

  @media (prefers-reduced-motion: reduce) {
    .feel summary :global(svg), .issues-toggle :global(svg) { transition: none; }
    .tick, .tick :global(path) { animation: none; }
  }
  @media (min-width: 700px) {
    .savebar { margin: 0; border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-overlay-up); bottom: 12px; }
  }
  .safety { margin: 0; padding: 10px 14px; border-left: 3px solid var(--warn); background: var(--warn-bg); color: var(--warn-ink); font: 500 15px/1.5 var(--font-ui); text-align: left; text-wrap: pretty; }
</style>
