<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { fmtSet } from "$lib/format";
  import { localIso } from "$lib/overview";
  import type { ClientDto, ProgramDto, ProgramSessionDto, SessionLogDto } from "$lib/api/types";
  import { sessionTag, sessionsByWeekday, weekOf, type SetType } from "@pt/shared";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import {
    cellNumber,
    isBlank,
    rowFilled,
    serverFieldErrors,
    toLoggedSet,
    validateRows,
    type Cell,
    type FieldErrors,
  } from "$lib/logSheet";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let program = $state<ProgramDto | null>(null);
  let pastLogs = $state<SessionLogDto[]>([]);
  /** id → name; program docs saved before the exerciseName schema fix carry no name. */
  let exerciseNames = $state(new Map<string, string>());
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

  interface Row {
    key: string;
    exerciseId: string;
    exerciseName: string;
    programExerciseId: string;
    setNumber: number;
    type: SetType;
    prescribedReps: number | null;
    prescribedMin: number | null;
    prescribedDuration: number | null;
    prescribedAmrap: boolean;
    prescribedWeight: number | null;
    targetRpe: number | null;
    lastWeight: number | null;
    weight: Cell;
    reps: Cell;
    rpe: Cell;
  }

  let rows = $state<Row[]>([]);

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

  /** Most recent working-set weight per exercise — "same as last time" default. */
  const lastWeightByExercise = $derived.by(() => {
    const map = new Map<string, number>();
    for (const log of [...pastLogs].sort((a, b) => a.date.localeCompare(b.date))) {
      for (const s of log.sets) {
        if (s.type !== "working" || s.weightKg == null) continue;
        map.set(s.exerciseId, Number(s.weightKg));
      }
    }
    return map;
  });

  const doneCount = $derived(rows.filter((r) => !isBlank(r.reps)).length);
  const prefillable = $derived(rows.length > 0 && doneCount < rows.length);

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

  function loadSession() {
    savedCount = 0;
    error = null;
    fieldErrors = {};
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
        e.prescribedSets.map((ps) => ({
          key: `${e.id}-${ps.setNumber}`,
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName ?? exerciseNames.get(e.exerciseId) ?? e.exerciseId,
          programExerciseId: e.id,
          setNumber: ps.setNumber,
          type: ps.type,
          prescribedReps: ps.reps,
          prescribedMin: ps.repsMin ?? null,
          prescribedDuration: ps.durationSeconds ?? null,
          prescribedAmrap: ps.amrap,
          prescribedWeight: ps.targetWeightKg ?? null,
          targetRpe: ps.targetRpe ?? null,
          lastWeight: lastWeightByExercise.get(e.exerciseId) ?? null,
          weight: "",
          reps: "",
          rpe: "",
        }))
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

  /** Fill every empty row: weight from prescription (else last time), reps + RPE from prescription. */
  function prefill() {
    for (const r of rows) {
      if (isBlank(r.weight) && (r.prescribedWeight ?? r.lastWeight) != null) {
        r.weight = r.prescribedWeight ?? r.lastWeight;
      }
      if (isBlank(r.reps)) {
        const target = r.prescribedDuration ?? r.prescribedReps;
        if (target != null && target > 0) r.reps = target;
      }
      if (isBlank(r.rpe) && r.targetRpe != null) r.rpe = r.targetRpe;
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (isCardioSession) {
      await saveCardio();
      return;
    }
    await save(rows.filter(rowFilled));
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

  async function save(filled: typeof rows) {
    if (!program || !sessionId || filled.length === 0) {
      error = "Enter at least one set — weight and reps.";
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

  /** Put the trainer on the first flagged cell — it may be far up the sheet. */
  async function focusFirstInvalid() {
    await tick();
    document.querySelector<HTMLInputElement>('.sheet [aria-invalid="true"]')?.focus();
  }

  /** Editing a flagged cell clears its flag; the rest stay until the next save. */
  function clearCell(key: string, field: "weight" | "reps" | "rpe") {
    if (!fieldErrors[key]?.[field]) return;
    const { [field]: _, ...rest } = fieldErrors[key];
    fieldErrors = { ...fieldErrors, [key]: rest };
  }

  /** One click: session happened exactly as prescribed. */
  async function logAsPrescribed() {
    oneClickBusy = true;
    if (isCardioSession) {
      prefillCardio(selectedSession?.cardio);
      await saveCardio();
    } else {
      prefill();
      await save(rows);
    }
    oneClickBusy = false;
  }

  onMount(async () => {
    const [detail, catalog] = await Promise.all([api.client(id), api.exercises()]);
    exerciseNames = new Map(catalog.map((e) => [e.id, e.name]));
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
    <form onsubmit={submit}>
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
      <div class="table-wrap">
        <table class="sheet">
          <thead>
            <tr><th>Exercise</th><th>Set</th><th class="num-col">Prescribed</th><th class="num-col">Last</th><th class="num-col">kg</th><th class="num-col">Reps</th><th class="num-col">RPE</th></tr>
          </thead>
          <tbody>
            {#each rows as r (r.key)}
              {@const fe = fieldErrors[r.key]}
              <tr class:filled={!isBlank(r.reps)}>
                <td>
                  <strong>{r.exerciseName}</strong>
                </td>
                <td class="num">{r.setNumber}</td>
                <td class="num pre">
                  {fmtSet({ reps: r.prescribedReps ?? 0, repsMin: r.prescribedMin ?? undefined, amrap: r.prescribedAmrap, durationSeconds: r.prescribedDuration ?? undefined, targetWeightKg: r.prescribedWeight })}{#if r.targetRpe != null} @ {r.targetRpe}{/if}
                </td>
                <td class="num pre">{r.lastWeight ?? "—"}</td>
                <td class="cell"><input class="input tnum" type="number" inputmode="decimal" step="0.5" min="0" aria-label={`${r.exerciseName} set ${r.setNumber}, kg`} placeholder={r.prescribedWeight != null ? String(r.prescribedWeight) : r.lastWeight != null ? String(r.lastWeight) : "—"} bind:value={r.weight} aria-invalid={fe?.weight ? true : undefined} aria-describedby={fe?.weight ? `${r.key}-weight-err` : undefined} oninput={() => clearCell(r.key, "weight")} />{#if fe?.weight}<span class="cell-err" id={`${r.key}-weight-err`}>{fe.weight}</span>{/if}</td>
                <td class="cell"><input class="input tnum" type="number" inputmode="numeric" min="0" aria-label={`${r.exerciseName} set ${r.setNumber}, reps`} placeholder={r.prescribedDuration != null ? String(r.prescribedDuration) : r.prescribedReps === 0 && r.prescribedAmrap ? "max" : String(r.prescribedReps ?? "")} bind:value={r.reps} aria-invalid={fe?.reps ? true : undefined} aria-describedby={fe?.reps ? `${r.key}-reps-err` : undefined} oninput={() => clearCell(r.key, "reps")} />{#if fe?.reps}<span class="cell-err" id={`${r.key}-reps-err`}>{fe.reps}</span>{/if}</td>
                <td class="cell"><input class="input tnum" type="number" inputmode="decimal" min="1" max="10" step="0.5" aria-label={`${r.exerciseName} set ${r.setNumber}, RPE`} placeholder="—" bind:value={r.rpe} aria-invalid={fe?.rpe ? true : undefined} aria-describedby={fe?.rpe ? `${r.key}-rpe-err` : undefined} oninput={() => clearCell(r.key, "rpe")} />{#if fe?.rpe}<span class="cell-err" id={`${r.key}-rpe-err`}>{fe.rpe}</span>{/if}</td>
              </tr>
            {/each}
          </tbody>
        </table>
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
            <span class="subtle">{doneCount}/{rows.length} sets filled</span>
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
      “Did it as prescribed” logs every set instantly: weights from last session, reps and
      RPE targets from the program. Deviated? Prefill, adjust the rows that differ, save.
    </p>
  {/if}
{/if}

<style>
  .table-wrap { overflow-x: auto; }

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

  th.num-col, td.num { text-align: right; }
  td.pre { color: var(--faint); }
  td.cell { width: 84px; }
  .tnum { text-align: right; font-family: var(--font-mono); padding: 5px 8px; }
  tr.filled td { background: var(--well); }
  td.cell .input[aria-invalid="true"] { border-color: var(--bad); }
  .cell-err { display: block; margin-top: 3px; font-size: 11px; line-height: 1.2; color: var(--bad); text-align: right; }

  .foot {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 22px;
    align-items: end;
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
  .hint { margin-top: 10px; }

  @media (max-width: 860px) {
    .foot { grid-template-columns: 1fr; }
    .cardio-form { grid-template-columns: 1fr; }
  }
</style>
