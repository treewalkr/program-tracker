<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { ClientDto, ProgramDto, SessionLogDto } from "$lib/api/types";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let program = $state<ProgramDto | null>(null);
  let pastLogs = $state<SessionLogDto[]>([]);
  let sessionId = $state<string>("");
  let date = $state(new Date().toISOString().slice(0, 10));
  let energy = $state<number>(7);
  let notes = $state("");
  let saving = $state(false);
  let oneClickBusy = $state(false);
  let savedCount = $state(0);
  let error = $state<string | null>(null);

  interface Row {
    key: string;
    exerciseId: string;
    exerciseName: string;
    programExerciseId: string;
    setNumber: number;
    type: "warm_up" | "working" | "backoff";
    prescribedReps: number | null;
    targetRpe: number | null;
    lastWeight: number | null;
    weight: string;
    reps: string;
    rpe: string;
  }

  let rows = $state<Row[]>([]);

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

  const doneCount = $derived(rows.filter((r) => r.reps !== "").length);
  const prefillable = $derived(rows.length > 0 && doneCount < rows.length);

  function loadSession() {
    savedCount = 0;
    error = null;
    if (!program || !sessionId) {
      rows = [];
      return;
    }
    const session = program.sessions.find((s) => s.id === sessionId);
    rows =
      session?.exercises.flatMap((e) =>
        e.prescribedSets.map((ps) => ({
          key: `${e.id}-${ps.setNumber}`,
          exerciseId: e.exerciseId,
          exerciseName: e.exerciseName ?? e.exerciseId,
          programExerciseId: e.id,
          setNumber: ps.setNumber,
          type: ps.type,
          prescribedReps: ps.reps,
          targetRpe: ps.targetRpe ?? null,
          lastWeight: lastWeightByExercise.get(e.exerciseId) ?? null,
          weight: "",
          reps: "",
          rpe: "",
        }))
      ) ?? [];
  }

  /** Fill every empty row: weight from last time, reps + RPE from prescription. */
  function prefill() {
    for (const r of rows) {
      if (r.weight === "" && r.lastWeight != null) r.weight = String(r.lastWeight);
      if (r.reps === "") r.reps = String(r.prescribedReps ?? "");
      if (r.rpe === "") r.rpe = r.targetRpe != null ? String(r.targetRpe) : "";
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    await save(rows.filter((r) => r.reps !== "" || r.weight !== ""));
  }

  async function save(filled: typeof rows) {
    if (!program || !sessionId || filled.length === 0) {
      error = "Enter at least one set — weight and reps.";
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
        sets: filled.map((r) => ({
          programExerciseId: r.programExerciseId,
          exerciseId: r.exerciseId,
          setNumber: r.setNumber,
          type: r.type,
          weightKg: r.weight === "" ? undefined : Number(r.weight),
          reps: Number(r.reps || r.prescribedReps || 0),
          rpe: r.rpe === "" ? undefined : Number(r.rpe),
        })),
      });
      const count = filled.length;
      notes = "";
      loadSession();
      savedCount = count;
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }

  /** One click: session happened exactly as prescribed. */
  async function logAsPrescribed() {
    oneClickBusy = true;
    prefill();
    await save(rows);
    oneClickBusy = false;
  }

  onMount(async () => {
    const detail = await api.client(id);
    client = detail.client;
    program = detail.currentProgram;
    pastLogs = await api.sessionLogs(id);
    if (program) {
      sessionId = program.sessions[0]?.id ?? "";
      loadSession();
    }
  });
</script>

<svelte:head><title>Log session · Program Tracker</title></svelte:head>

{#if client === null}
  <div class="skeleton" style="height:140px"></div>
{:else}
  <div class="page-head">
    <div>
      <p class="crumb"><a href={`/clients/${id}`}>{client.name}</a> / Log session</p>
      <h1>Log a session</h1>
      <p class="sub">Enter what {client.name.split(" ")[0]} actually did.</p>
    </div>
    {#if rows.length > 0}
      <button class="btn" onclick={logAsPrescribed} disabled={oneClickBusy || saving}>
        {oneClickBusy ? "Logging…" : "⚡ Did it as prescribed"}
      </button>
    {/if}
  </div>

  {#if !program}
    <section class="panel"><div class="empty">No active program — log sessions once a program is running.</div></section>
  {:else}
    <form onsubmit={submit}>
      <section class="panel">
        <div class="panel-head">
          <h2>Session</h2>
          <div class="head-controls">
            <label class="label" for="log-session">From program</label>
            <select
              class="select"
              id="log-session"
              bind:value={sessionId}
              onchange={loadSession}
            >
              {#each program.sessions as s (s.id)}
                <option value={s.id}>{s.name}</option>
              {/each}
            </select>
            <label class="label" for="log-date">Date</label>
            <input class="input date" id="log-date" type="date" bind:value={date} />
            {#if prefillable}
              <button type="button" class="btn ghost small" onclick={prefill}>Prefill prescribed</button>
            {/if}
          </div>
        </div>
        <table class="sheet">
          <thead>
            <tr><th>Exercise</th><th>Set</th><th class="num-col">Prescribed</th><th class="num-col">Last</th><th class="num-col">kg</th><th class="num-col">Reps</th><th class="num-col">RPE</th></tr>
          </thead>
          <tbody>
            {#each rows as r (r.key)}
              <tr class:filled={r.reps !== ""}>
                <td>
                  <strong>{r.exerciseName}</strong>
                  {#if r.type === "warm_up"}<span class="subtle"> warm-up</span>{/if}
                </td>
                <td class="num">{r.setNumber}</td>
                <td class="num pre">
                  {r.prescribedReps}{#if r.type !== "warm_up" && r.targetRpe != null} @ {r.targetRpe}{/if}
                </td>
                <td class="num pre">{r.lastWeight ?? "—"}</td>
                <td class="cell"><input class="input tnum" type="number" inputmode="decimal" step="0.5" min="0" placeholder={r.lastWeight != null ? String(r.lastWeight) : "—"} bind:value={r.weight} /></td>
                <td class="cell"><input class="input tnum" type="number" inputmode="numeric" min="0" placeholder={String(r.prescribedReps ?? "")} bind:value={r.reps} /></td>
                <td class="cell"><input class="input tnum" type="number" inputmode="decimal" min="1" max="10" step="0.5" placeholder="—" bind:value={r.rpe} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
        <div class="panel-body foot">
          <div class="energy">
            <label class="label" for="log-energy">Perceived energy <span class="subtle">1–10</span></label>
            <input id="log-energy" type="range" min="1" max="10" bind:value={energy} />
            <span class="num big">{energy}</span>
          </div>
          <div class="notes">
            <label class="label" for="log-notes">Session notes</label>
            <input class="input" id="log-notes" placeholder="Felt strong, bar speed good…" bind:value={notes} maxlength="2000" />
          </div>
          <div class="submit-row">
            <span class="subtle">{doneCount}/{rows.length} sets filled</span>
            <button class="btn" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save session"}
            </button>
          </div>
        </div>
      </section>
    </form>

    {#if savedCount > 0}
      <p class="ok-msg" role="status">
        Logged {savedCount} sets — now counting toward history and the next AI draft.
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
  .crumb { margin: 0 0 4px; font-size: 13px; color: var(--faint); }
  .crumb a:hover { text-decoration: underline; }

  .head-controls {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .head-controls .label { margin: 0; }
  .head-controls .select { width: auto; }
  .date { width: 150px; }
  .btn.small { padding: 4px 10px; font-size: 13px; }

  th.num-col, td.num { text-align: right; }
  td.pre { color: var(--faint); }
  td.cell { width: 84px; }
  .tnum { text-align: right; font-family: var(--font-mono); padding: 5px 8px; }
  tr.filled td { background: #f9faf6; }

  .foot {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 22px;
    align-items: end;
  }
  .energy { display: flex; align-items: center; gap: 10px; }
  .energy .label { margin: 0; }
  .notes { min-width: 220px; }
  .submit-row { display: flex; align-items: center; gap: 14px; }

  .ok-msg { color: var(--good); font-weight: 600; margin-top: 14px; }
  .err-msg { color: var(--bad); font-weight: 600; margin-top: 14px; }
  .hint { margin-top: 10px; }

  @media (max-width: 860px) {
    .foot { grid-template-columns: 1fr; }
  }
</style>
