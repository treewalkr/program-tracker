<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { fmtSet } from "$lib/format";
  import { localIso } from "$lib/overview";
  import type { ClientDto, ExerciseDto, ProgramDto, ProgramSessionDto, SessionLogDto } from "$lib/api/types";
  import { sessionTag, sessionsByWeekday, weekOf, type ExerciseRole } from "@pt/shared";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import RoleChip from "$lib/components/RoleChip.svelte";
  import ExercisePicker from "$lib/components/ExercisePicker.svelte";
  import LogStepper from "$lib/components/LogStepper.svelte";
  import {
    asPrescribed,
    blocksOf,
    cellNumber,
    isBlank,
    isSwapped,
    lastBySlot,
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
    type Cell,
    type FieldErrors,
    type LastSet,
    type Prescription,
    type SheetField,
    type SheetRow,
  } from "$lib/logSheet";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
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
  let date = $state(localIso(new Date()));
  let energy = $state<number>(7);
  let notes = $state("");
  let saving = $state(false);
  let oneClickBusy = $state(false);
  let savedCount = $state(0);
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

  let cardioForm = $state<{
    modality: string;
    durationMin: Cell;
    hrZone: string;
    intensity: string;
    distanceKm: Cell;
    rpe: Cell;
  }>({
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
  const prefillable = $derived(rows.some((r) => !r.skipped && isBlank(r.reps) && r.rx));
  const labels = $derived(rowLabels(rows, nameOf));
  const blocks = $derived(blocksOf(rows));
  /** A card's unique name for its buttons: "Bench back-off", "Row (2nd)". */
  const blockName = (b: { rows: Row[] }) => (labels.get(b.rows[0].key) ?? "").replace(/ (extra )?set \d+/, "");

  const selectedWeek = $derived(
    program?.weeks.find((w) => w.week === selectedWeekNumber) ?? program?.weeks[0] ?? null
  );

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const todayIso = (new Date().getDay() + 6) % 7 + 1;

  /** The week's sessions grouped Mon→Sun, unscheduled last as "Any day". */
  const sessionGroups = $derived.by(() => {
    if (!selectedWeek) return [];
    const by = sessionsByWeekday(selectedWeek.sessions);
    return [1, 2, 3, 4, 5, 6, 7, 0]
      .map((day) => ({
        day,
        label: day === 0 ? "Any day" : DAY_NAMES[day - 1],
        items: (by.get(day) ?? []).map((s: ProgramSessionDto) => ({ id: s.id, label: `${sessionTag(s)} · ${s.name}`, session: s })),
      }))
      .filter((g) => g.items.length > 0);
  });
  const weekSessionsList = $derived(sessionGroups.flatMap((g) => g.items));
  /** Default pick: the first session placed on today's weekday, else the first one. */
  const defaultSessionId = () =>
    (sessionGroups.find((g) => g.day === todayIso)?.items[0] ?? weekSessionsList[0])?.id ?? "";

  const selectedSession = $derived(
    sessionId ? weekSessionsList.find((ws) => ws.id === sessionId)?.session ?? null : null
  );
  const isCardioSession = $derived(selectedSession?.kind === "cardio");
  /** programExerciseId → its role in the session, for the card head. */
  const roles = $derived(
    new Map<string, ExerciseRole | undefined>((selectedSession?.exercises ?? []).map((e) => [e.id, e.role]))
  );

  const isBodyweight = (exerciseId: string) => catalogById.get(exerciseId)?.equipment === "bodyweight";

  function loadSession() {
    savedCount = 0;
    error = null;
    fieldErrors = {};
    current = 0;
    swapOpen = null;
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
    rows =
      session?.exercises.flatMap((e) =>
        e.prescribedSets.map((ps): Row => {
          const rx: Prescription = {
            reps: ps.reps,
            repsMin: ps.repsMin ?? null,
            amrap: ps.amrap,
            durationSeconds: ps.durationSeconds ?? null,
            targetWeightKg: ps.targetWeightKg ?? null,
            targetRpe: ps.targetRpe ?? null,
          };
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
          };
        })
      ) ?? [];
  }

  /** Fill the cardio form from a prescription (or a prior actual). */
  function prefillCardio(c?: ProgramSessionDto["cardio"]) {
    cardioForm = {
      modality: c?.modality ?? "",
      durationMin: c?.durationMin != null ? String(c.durationMin) : "",
      hrZone: c?.hrZone != null ? String(c.hrZone) : "",
      intensity: c?.intensity ?? "",
      distanceKm: c?.distanceKm != null ? String(c.distanceKm) : "",
      rpe: c?.targetRpe != null ? String(c.targetRpe) : "",
    };
  }

  /** Fill every empty cell of the sets still to do with exactly what was prescribed. */
  function prefill() {
    for (const r of rows) {
      if (r.skipped) continue;
      const p = asPrescribed(r.rx, { bodyweight: isBodyweight(r.exerciseId), swapped: isSwapped(r), last: r.last });
      if (isBlank(r.weight) && p.weight != null) r.weight = p.weight;
      if (isBlank(r.reps) && p.reps != null) r.reps = p.reps;
      if (isBlank(r.rpe) && p.rpe != null) r.rpe = p.rpe;
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (isCardioSession) {
      await saveCardio();
      return;
    }
    await save();
  }

  async function saveCardio() {
    if (!program || !sessionId) return;
    if (cardioForm.modality.trim() === "") {
      error = "Enter the modality — what did they do?";
      return;
    }
    saving = true;
    error = null;
    try {
      await api.logSession({
        clientId: id,
        programId: program.id,
        programSessionId: sessionId,
        date,
        notes: notes || undefined,
        kind: "cardio",
        cardio: {
          modality: cardioForm.modality.trim(),
          durationMin: cellNumber(cardioForm.durationMin) ?? null,
          hrZone: cellNumber(cardioForm.hrZone) ?? null,
          intensity: cardioForm.intensity.trim() === "" ? undefined : cardioForm.intensity.trim(),
          distanceKm: cellNumber(cardioForm.distanceKm),
          rpe: cellNumber(cardioForm.rpe),
        },
        sets: [],
      });
      notes = "";
      loadSession();
      savedCount = 1;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
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
    saving = true;
    error = null;
    try {
      await api.logSession({
        clientId: id,
        programId: program.id,
        programSessionId: sessionId,
        date,
        perceivedEnergy: energy,
        notes: notes || undefined,
        sets: filled.map(toLoggedSet),
      });
      const count = filled.length;
      notes = "";
      pastLogs = await api.sessionLogs(id).catch(() => pastLogs);
      loadSession();
      savedCount = count;
    } catch (err) {
      fieldErrors = serverFieldErrors((err as { issues?: unknown }).issues, filled);
      const flagged = Object.keys(fieldErrors).length > 0;
      error = flagged ? "Fix the highlighted cells, then save." : (err as Error).message;
      if (flagged) await focusFirstInvalid();
    } finally {
      saving = false;
    }
  }

  /** Put the trainer on the first flagged cell — on a phone, bring its card on screen first. */
  async function focusFirstInvalid() {
    const bad = rows.find((r) => Object.keys(fieldErrors[r.key] ?? {}).length > 0);
    if (bad) current = blocks.findIndex((b) => b.programExerciseId === bad.programExerciseId);
    await tick();
    document.querySelector<HTMLInputElement>('.sheet [aria-invalid="true"]')?.focus();
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
    }));
  }

  function removeSet(key: string) {
    rows = withoutExtra(rows, key);
  }

  function swap(programExerciseId: string, exerciseId: string) {
    rows = swapSlot(rows, programExerciseId, exerciseId);
    swapOpen = null;
  }

  function go(i: number) {
    current = Math.max(0, Math.min(blocks.length - 1, i));
    document.getElementById("log-sheet")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  /** A card is done once every set is entered or skipped. */
  const blockDone = (b: { rows: Row[] }) => b.rows.every((r) => r.skipped || !isBlank(r.reps));

  const fmtLast = (l: LastSet | null, timed: boolean) =>
    l == null ? "—" : `${l.weightKg != null ? `${l.weightKg} × ` : ""}${l.reps}${timed ? " s" : ""}`;
  const fmtRx = (r: Row) =>
    r.rx
      ? `${fmtSet({ reps: r.rx.reps, repsMin: r.rx.repsMin ?? undefined, amrap: r.rx.amrap, durationSeconds: r.rx.durationSeconds ?? undefined, targetWeightKg: r.rx.targetWeightKg })}${r.rx.targetRpe != null ? ` @ ${r.rx.targetRpe}` : ""}`
      : "—";
  const fmtDay = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  /** Placeholder = what "as prescribed" would log, so a blank cell reads as the plan. */
  const rxCell = (r: Row) =>
    asPrescribed(r.rx, { bodyweight: isBodyweight(r.exerciseId), swapped: isSwapped(r), last: r.last });

  /** One click: session happened exactly as prescribed (skips stay skipped). */
  async function logAsPrescribed() {
    oneClickBusy = true;
    if (isCardioSession) {
      prefillCardio(selectedSession?.cardio);
      await saveCardio();
    } else {
      prefill();
      const open = rows.find((r) => !r.skipped && !r.extra && isBlank(r.reps));
      if (open) {
        fieldErrors = { [open.key]: { reps: "Enter reps done" } };
        error = "AMRAP sets have no prescribed count — enter the reps done, then save.";
        await focusFirstInvalid();
      } else {
        await save();
      }
    }
    oneClickBusy = false;
  }

  onMount(async () => {
    const [detail, exercises] = await Promise.all([api.client(id), api.exercises()]);
    catalog = exercises;
    client = detail.client;
    program = detail.currentProgram;
    pastLogs = await api.sessionLogs(id);
    if (program && program.weeks?.length) {
      const initialWeek = weekOf(
        program,
        pastLogs.map((l) => ({ programId: l.programId, date: l.date, sets: [] }))
      );
      selectedWeekNumber = Math.max(1, Math.min(initialWeek, program.weeks.length));
      sessionId = defaultSessionId();
      loadSession();
    }
  });
</script>

<svelte:head><title>Log session · Program Tracker</title></svelte:head>

{#if client === null}
  <Skeleton h="140px" />
{:else}
  <PageHead
    title="Log a session"
    sub={`Enter what ${client.name.split(" ")[0]} actually did.`}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: "Log session" }]}
  >
    {#snippet actions()}
      {#if rows.length > 0 || isCardioSession}
        <Button variant="primary" onclick={logAsPrescribed} disabled={oneClickBusy || saving}>
          {#snippet icon()}{#if !oneClickBusy}<Icon name="bolt" />{/if}{/snippet}
          {oneClickBusy ? "Logging…" : "Did it as prescribed"}
        </Button>
      {/if}
    {/snippet}
  </PageHead>

  {#if !program}
    <section class="panel"><EmptyState>No active program — log sessions once a program is running.</EmptyState></section>
  {:else}
    {@const prog = program}
    <!-- novalidate: the sheet validates itself; a native bubble on a cell in a hidden phone card would block Save silently. -->
    <form onsubmit={submit} novalidate>
      <Panel title="Session">
        {#snippet act()}
          <div class="head-controls">
            <label class="label" for="log-week">Week</label>
            <select
              class="select"
              id="log-week"
              bind:value={selectedWeekNumber}
              onchange={() => {
                sessionId = defaultSessionId();
                loadSession();
              }}
            >
              {#each prog.weeks as w (w.week)}
                <option value={w.week}>Week {w.week}</option>
              {/each}
            </select>
            <label class="label" for="log-session">Session</label>
            <select
              class="select"
              id="log-session"
              bind:value={sessionId}
              onchange={loadSession}
            >
              {#each sessionGroups as g (g.day)}
                <optgroup label={g.label}>
                  {#each g.items as ws (ws.id)}
                    <option value={ws.id}>{ws.label}</option>
                  {/each}
                </optgroup>
              {/each}
            </select>
            <label class="label" for="log-date">Date</label>
            <input class="input date" id="log-date" type="date" bind:value={date} />
            {#if prefillable && !isCardioSession}
              <Button variant="ghost" small type="button" onclick={prefill}>Prefill prescribed</Button>
            {/if}
          </div>
        {/snippet}
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
          <div class="energy">
            <label class="label" for="log-energy">Perceived energy <span class="subtle">1–10</span></label>
            <input id="log-energy" type="range" min="1" max="10" bind:value={energy} />
            <span class="num big">{energy}</span>
          </div>
          <div class="notes">
            <Field label="Session notes" htmlFor="log-notes">
              <input class="input" id="log-notes" placeholder="Felt strong, bar speed good…" bind:value={notes} maxlength="2000" />
            </Field>
          </div>
          <div class="submit-row">
            <span class="subtle">cardio session — counts toward the weekly target</span>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save session"}
            </Button>
          </div>
        </div>
      {:else}
      <div class="sheet" id="log-sheet">
        {#if blocks.length > 1}
          <nav class="pager" aria-label="Exercises in this session">
            <button type="button" class="pg-btn prev" aria-label="Previous exercise" disabled={current === 0} onclick={() => go(current - 1)}>
              <Icon name="chevron" />
            </button>
            <ol class="pg-steps">
              {#each blocks as b, i (b.programExerciseId)}
                <li>
                  <button
                    type="button"
                    class="pg-step"
                    class:on={i === current}
                    class:done={blockDone(b)}
                    aria-current={i === current ? "step" : undefined}
                    aria-label={`${i + 1}. ${nameOf(b.rows[0].exerciseId)}${blockDone(b) ? ", done" : ""}`}
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

        {#each blocks as b, bi (b.programExerciseId)}
          {@const head = b.rows[0]}
          {@const role = roles.get(b.programExerciseId)}
          {@const swapped = isSwapped(head)}
          <section class="block" class:off={bi !== current} aria-labelledby={`blk-${b.programExerciseId}`}>
            <header class="blk-head">
              <div class="blk-title">
                {#if role}<RoleChip {role} />{/if}
                <h3 id={`blk-${b.programExerciseId}`}>{nameOf(head.exerciseId)}</h3>
                {#if swapped}
                  <span class="pill warn swap-pill">swapped · was {nameOf(head.slotExerciseId)}</span>
                {/if}
              </div>
              <div class="blk-act">
                {#if swapped}
                  <Button variant="ghost" small type="button" aria-label={`Undo swap on ${blockName(b)}`} onclick={() => swap(b.programExerciseId, head.slotExerciseId)}>Undo swap</Button>
                {/if}
                <Button
                  variant="ghost"
                  small
                  type="button"
                  aria-label={`Swap ${blockName(b)}`}
                  aria-expanded={swapOpen === b.programExerciseId}
                  onclick={() => (swapOpen = swapOpen === b.programExerciseId ? null : b.programExerciseId)}
                >Swap</Button>
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
              </div>
              {#if swapOpen === b.programExerciseId}
                <div class="blk-swap">
                  <ExercisePicker
                    value={head.exerciseId}
                    {catalog}
                    label={`Log ${nameOf(head.slotExerciseId)} as`}
                    onpick={(ex) => swap(b.programExerciseId, ex.id)}
                  />
                  <span class="subtle">Every set of this exercise logs under the pick. History shows the swap.</span>
                </div>
              {/if}
            </header>

            {#each b.rows as r (r.key)}
              {@const fe = fieldErrors[r.key]}
              {@const label = labels.get(r.key) ?? r.key}
              {@const p = rxCell(r)}
              {@const last = isSwapped(r) ? null : r.last}
              <div class="set" class:skipped={r.skipped} class:filled={!r.skipped && !isBlank(r.reps)} class:extra={r.extra}>
                <div class="meta">
                  <span class="m-set">
                    <span class="mob">Set&nbsp;</span><span class="tnum">{r.setNumber}</span>
                    {#if r.extra}<span class="tag">extra</span>{:else if r.type === "backoff"}<span class="tag">back-off</span>{/if}
                  </span>
                  <span class="m-rx tnum">{fmtRx(r)}</span>
                  <span class="m-last tnum" title={last ? `Last done ${fmtDay(last.date)}${last.rpe != null ? ` @ RPE ${last.rpe}` : ""}` : isSwapped(r) ? "Swapped — last time was a different exercise" : "Not logged yet in this slot"}>
                    <span class="mob">last&nbsp;</span>{fmtLast(last, r.timed)}
                  </span>
                </div>
                {#if r.skipped}
                  <span class="skip-note">Skipped — not logged</span>
                {:else}
                  <div class="c-kg">
                    <LogStepper bind:value={r.weight} label={`${label}, kg`} unit="kg" step={2.5} min={0} max={600} from={p.weight} placeholder={p.weight != null ? String(p.weight) : "—"} error={fe?.weight} errorId={`${r.key}-weight-err`} onedit={() => clearCell(r.key, "weight")} />
                  </div>
                  <div class="c-reps">
                    <LogStepper bind:value={r.reps} label={`${label}, ${r.timed ? "seconds" : "reps"}`} unit={r.timed ? "sec" : "reps"} step={r.timed ? 5 : 1} min={0} max={r.timed ? 3600 : 200} from={p.reps} inputmode="numeric" placeholder={p.reps != null ? String(p.reps) : r.rx?.amrap ? "max" : "—"} error={fe?.reps} errorId={`${r.key}-reps-err`} onedit={() => clearCell(r.key, "reps")} />
                  </div>
                  <div class="c-rpe">
                    <LogStepper bind:value={r.rpe} label={`${label}, RPE`} unit="RPE" step={0.5} min={1} max={10} from={p.rpe ?? 7.5} placeholder={p.rpe != null ? String(p.rpe) : "—"} error={fe?.rpe} errorId={`${r.key}-rpe-err`} onedit={() => clearCell(r.key, "rpe")} />
                  </div>
                {/if}
                <div class="c-skip">
                  {#if r.extra}
                    <button type="button" class="skip-btn" aria-label={`Remove ${label}`} title="Remove this set" onclick={() => removeSet(r.key)}>
                      <Icon name="x" /><span class="mob">Remove set</span>
                    </button>
                  {:else}
                    <button type="button" class="skip-btn" aria-pressed={!!r.skipped} aria-label={`${r.skipped ? "Undo skip" : "Skip"} ${label}`} title={r.skipped ? "Undo skip" : "Didn't happen — don't log it"} onclick={() => toggleSkip(r)}>
                      {#if r.skipped}<span>Undo</span>{:else}<span class="skip-word">Skip</span>{/if}
                    </button>
                  {/if}
                </div>
              </div>
            {/each}

            {#if bi < blocks.length - 1}
              <button type="button" class="next-ex" onclick={() => go(bi + 1)}>
                <span>Next: {nameOf(blocks[bi + 1].rows[0].exerciseId)}</span>
                <Icon name="chevron" />
              </button>
            {/if}
          </section>
        {/each}
      </div>
        <div class="panel-body foot">
          <div class="energy">
            <label class="label" for="log-energy">Perceived energy <span class="subtle">1–10</span></label>
            <input id="log-energy" type="range" min="1" max="10" bind:value={energy} />
            <span class="num big">{energy}</span>
          </div>
          <div class="notes">
            <Field label="Session notes" htmlFor="log-notes">
              <input class="input" id="log-notes" placeholder="Felt strong, bar speed good…" bind:value={notes} maxlength="2000" />
            </Field>
          </div>
          <div class="submit-row">
            <span class="subtle tally" aria-live="polite">
              {[
                `${counts.logged} logged`,
                counts.skipped ? `${counts.skipped} skipped` : "",
                counts.open ? `${counts.open} open` : "",
              ].filter(Boolean).join(" · ")}
            </span>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save session"}
            </Button>
          </div>
        </div>
      {/if}
      </Panel>
    </form>

    {#if savedCount > 0}
      <p class="ok-msg" role="status">
        {#if isCardioSession}
          Logged — counting toward this week's cardio target.
        {:else}
          Logged {savedCount} sets — now counting toward history and the next AI draft.
        {/if}
      </p>
    {/if}
    {#if error}
      <p class="err-msg" role="alert">{error}</p>
    {/if}

    <p class="subtle hint">
      “Did it as prescribed” logs the prescription: target loads (with none, the load last used in
      that same slot), the bottom of rep ranges, target RPE. Bodyweight stays bodyweight and
      skipped sets stay out. Deviated? Prefill, change what differs, skip what didn't happen, save.
    </p>
  {/if}
{/if}

<style>
  .head-controls {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
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

  .foot {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 22px;
    align-items: end;
    border-top: 1px solid var(--line);
  }
  .cardio-form {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
  }
  .energy { display: flex; align-items: center; gap: 10px; }
  .energy input[type="range"] { accent-color: var(--blue); }
  .energy .label { margin: 0; }
  .notes { min-width: 220px; }
  .submit-row { display: flex; align-items: center; gap: 14px; }

  .ok-msg { color: var(--good); font-weight: 600; margin-top: 14px; }
  .err-msg { color: var(--bad); font-weight: 600; margin-top: 14px; }
  .hint { margin-top: 10px; max-width: var(--measure-prose); }

  @media (max-width: 860px) {
    .foot { grid-template-columns: 1fr; }
    .cardio-form { grid-template-columns: 1fr; }
  }

  /* ---- Phone: one exercise card at a time, one set per row, 44px steppers ---- */
  @media (max-width: 640px) {
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
    .skip-word::after { content: " set"; }

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
    .head-controls :global(.btn) { grid-column: 1 / -1; min-height: 44px; justify-content: center; }
    .energy input[type="range"] { flex: 1; }
    .notes { min-width: 0; }
    .notes .input { min-height: 44px; }
    .submit-row { justify-content: space-between; }
    .submit-row :global(.btn) { min-height: 44px; padding: 0 22px; }
  }
</style>
