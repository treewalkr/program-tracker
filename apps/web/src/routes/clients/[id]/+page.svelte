<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { ClientDto, HistoryEntryDto, ProgramDto } from "$lib/api/types";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import SetChips from "$lib/components/SetChips.svelte";
  import { activeSignals, computeSignals, snoozeSignal, type Signal } from "$lib/signals";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let programs = $state<ProgramDto[] | null>(null);
  let history = $state<HistoryEntryDto[] | null>(null);
  let editing = $state(false);
  let saving = $state(false);
  let form = $state({ goals: "", limitations: "", daysPerWeek: 3 });
  let signals = $state<Signal[]>([]);
  let dismissedNow = $state<string[]>([]);

  const visibleSignals = $derived(signals.filter((s) => !dismissedNow.includes(s.id)));

  async function load() {
    const detail = await api.client(id);
    client = detail.client;
    current = detail.currentProgram;
    programs = detail.programs;
    history = await api.history(id);
    if (current) {
      const [logs, exs] = await Promise.all([api.sessionLogs(id), api.exercises()]);
      const names = new Map(exs.map((e) => [e.id, e.name]));
      signals = activeSignals(computeSignals(current, logs, (x) => names.get(x) ?? x));
    } else {
      signals = [];
    }
    form = {
      goals: detail.client.goals ?? "",
      limitations: detail.client.limitations ?? "",
      daysPerWeek: detail.client.daysPerWeek ?? 3,
    };
  }

  async function save() {
    saving = true;
    try {
      client = await api.updateClient(id, {
        goals: form.goals || null,
        limitations: form.limitations || null,
        daysPerWeek: Number(form.daysPerWeek),
      });
      editing = false;
    } finally {
      saving = false;
    }
  }

  onMount(load);
</script>

<svelte:head><title>{client?.name ?? "Client"} · Program Tracker</title></svelte:head>

{#if client === null}
  <div class="skeleton" style="height:140px"></div>
{:else}
  <div class="page-head">
    <div>
      <p class="crumb"><a href="/clients">Clients</a> / {client.name}</p>
      <h1>{client.name} <StatusPill status={client.status} /></h1>
      <p class="sub">{client.email} · {client.daysPerWeek ?? "?"} days/week</p>
    </div>
    <div class="actions">
      <button class="btn ghost" onclick={() => (editing = !editing)}>{editing ? "Cancel" : "Edit profile"}</button>
      <a class="btn ghost" href={`/clients/${id}/log`}>Log session</a>
      <a class="btn ghost" href={`/clients/${id}/programs/new`}>Write program</a>
      {#if current}
        <a class="btn" href={`/clients/${id}/generate`}>✦ Generate next block</a>
      {:else}
        <a class="btn" href={`/clients/${id}/generate`}>✦ Generate first program</a>
      {/if}
    </div>
  </div>

  {#if visibleSignals.length > 0}
    <section class="panel sig-panel">
      {#each visibleSignals as signal (signal.id)}
        <div class="sig" class:urgent={signal.severity === "urgent"} class:attention={signal.severity === "attention"}>
          <div class="sig-body">
            <div class="sig-top">
              <span class="sev-dot"></span>
              <strong>{signal.title}</strong>
            </div>
            <p class="evidence">{signal.evidence}</p>
          </div>
          <div class="sig-actions">
            {#if signal.prefillNote}
              <a
                class="btn small"
                href={`/clients/${id}/generate?tpl=${signal.templateHint ?? ""}&note=${encodeURIComponent(signal.prefillNote)}`}
              >
                ✦ Draft next block
              </a>
            {/if}
            <button
              class="btn ghost small"
              onclick={() => {
                snoozeSignal(signal.id, 7);
                dismissedNow = [...dismissedNow, signal.id];
              }}
            >
              Snooze 1 week
            </button>
          </div>
        </div>
      {/each}
    </section>
  {/if}

  {#if editing}
    <section class="panel" style="margin-bottom:18px">
      <div class="panel-head"><h2>Profile</h2><span class="subtle">feeds every AI draft</span></div>
      <form
        class="panel-body grid"
        onsubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div>
          <label class="label" for="p-days">Training days per week</label>
          <select class="select" id="p-days" bind:value={form.daysPerWeek}>
            {#each [1, 2, 3, 4, 5, 6, 7] as d}<option value={d}>{d}</option>{/each}
          </select>
        </div>
        <div class="span">
          <label class="label" for="p-goals">Goals</label>
          <textarea class="textarea" id="p-goals" rows="2" bind:value={form.goals}></textarea>
        </div>
        <div class="span">
          <label class="label" for="p-lim">Limitations — hard constraints for the AI</label>
          <textarea class="textarea" id="p-lim" rows="2" bind:value={form.limitations}></textarea>
        </div>
        <div class="span"><button class="btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button></div>
      </form>
    </section>
  {/if}

  <div class="cols">
    <div class="col-main">
      {#if current}
        <section class="panel">
          <div class="panel-head">
            <h2>Current program</h2>
            <div class="head-right">
              <span class="subtle">v{current.version}{#if current.aiAssisted} · <span title="Created from an AI draft">✦ AI-assisted</span>{/if}</span>
              <a class="btn ghost small" href={`/programs/${current.id}`}>Open</a>
            </div>
          </div>
          <div class="panel-body sessions">
            {#each current.sessions as s (s.id)}
              <div class="session">
                <h3>{s.name}</h3>
                {#each s.exercises as e (e.id)}
                  <div class="exrow">
                    <span class="exname">{e.exerciseName}</span>
                    <SetChips sets={e.prescribedSets} />
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </section>
      {:else}
        <section class="panel">
          <div class="empty">
            No active program. Generate one with AI or build it manually.
            <div style="margin-top:12px"><a class="btn" href={`/clients/${id}/generate`}>✦ Generate first program</a></div>
          </div>
        </section>
      {/if}

      {#if history !== null && history.length > 0}
        <section class="panel" style="margin-top:18px">
          <div class="panel-head">
            <h2>Progress · 8 weeks</h2>
            <span class="subtle">working sets, best estimated 1RM</span>
          </div>
          <table class="sheet">
            <thead><tr><th>Exercise</th><th class="num-col">Best e1RM</th><th>Recent sets</th></tr></thead>
            <tbody>
              {#each history as h (h.exerciseName)}
                <tr>
                  <td><strong>{h.exerciseName}</strong></td>
                  <td class="num big">{h.bestE1rm}<span class="unit">kg</span></td>
                  <td class="sets">{h.recentSets.join(", ")}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </section>
      {/if}
    </div>

    <div class="col-side">
      <section class="panel">
        <div class="panel-head"><h2>Programs</h2></div>
        <table class="sheet">
          <tbody>
            {#each programs ?? [] as p (p.id)}
              <tr class="rowlink" onclick={() => goto(`/programs/${p.id}`)}>
                <td>
                  <div><strong>{p.name}</strong></div>
                  <div class="subtle">v{p.version}{#if p.aiAssisted} · ✦ AI{/if}</div>
                </td>
                <td><StatusPill status={p.status} /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>

      {#if client.limitations}
        <section class="panel warn-panel" style="margin-top:18px">
          <div class="panel-head"><h2>Limitations</h2></div>
          <div class="panel-body">{client.limitations}</div>
        </section>
      {/if}

      {#if client.goals}
        <section class="panel" style="margin-top:18px">
          <div class="panel-head"><h2>Goals</h2></div>
          <div class="panel-body">{client.goals}</div>
        </section>
      {/if}
    </div>
  </div>
{/if}

<style>
  .sig-panel { margin-bottom: 18px; }
  .sig {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 14px;
    padding: 12px 18px;
    border-bottom: 1px solid var(--line);
    flex-wrap: wrap;
  }
  .sig:last-child { border-bottom: none; }
  .sig.urgent .sev-dot { background: var(--bad); }
  .sig.attention .sev-dot { background: var(--warn); }
  .sev-dot { width: 9px; height: 9px; border-radius: 99px; background: var(--good); flex-shrink: 0; }
  .sig-top { display: flex; align-items: center; gap: 9px; }
  .evidence { margin: 3px 0 0 18px; font-size: 13px; color: var(--muted); }
  .sig-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn.small { padding: 4px 10px; font-size: 13px; }
  .crumb { margin: 0 0 4px; font-size: 13px; color: var(--faint); }
  .crumb a:hover { text-decoration: underline; }
  h1 { display: flex; align-items: center; gap: 10px; }

  .cols { display: grid; grid-template-columns: 1fr 280px; gap: 18px; align-items: start; }

  .grid { display: grid; grid-template-columns: 160px 1fr; gap: 14px; }
  .span { grid-column: 1 / -1; }

  .head-right { display: flex; align-items: center; gap: 12px; }

  .sessions { display: flex; flex-direction: column; gap: 4px; }
  .session { padding: 10px 0; border-bottom: 1px solid var(--line); }
  .session:last-child { border-bottom: none; padding-bottom: 2px; }
  .session h3 { margin-bottom: 8px; }
  .exrow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 5px 0;
    flex-wrap: wrap;
  }
  .exname { font-weight: 600; min-width: 170px; }

  .num-col { text-align: right; }
  td.num { text-align: right; white-space: nowrap; }
  .unit { font-size: 12px; color: var(--faint); margin-left: 3px; font-weight: 400; }
  .sets { font-family: var(--font-mono); font-size: 12.5px; color: var(--muted); }

  .warn-panel { border-color: #e5b8b8; }
  .warn-panel .panel-head { border-color: #eed3d3; }

  .btn.small { padding: 4px 10px; font-size: 13px; }

  @media (max-width: 900px) {
    .cols { grid-template-columns: 1fr; }
  }
</style>
