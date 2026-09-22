<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import type { ClientDto, ProgramDto, ProviderDto } from "$lib/api/types";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import { activeSignals, computeSignals, type Signal } from "$lib/signals";
  import { goto } from "$app/navigation";

  let clients = $state<ClientDto[] | null>(null);
  let providers = $state<ProviderDto[] | null>(null);
  let currentNames = $state<Record<string, string>>({});
  let signals = $state<{ client: ClientDto; program: ProgramDto; signal: Signal }[]>([]);
  let nameOf = $state((id: string) => id);

  onMount(async () => {
    try {
      const [cs, ps, exs] = await Promise.all([api.clients(), api.providers(), api.exercises()]);
      const names = new Map(exs.map((e) => [e.id, e.name]));
      nameOf = (id) => names.get(id) ?? id;
      clients = cs;
      providers = ps;
      for (const c of cs) {
        const detail = await api.client(c.id);
        currentNames[c.id] = detail.currentProgram?.name ?? "—";
        if (detail.currentProgram) {
          const logs = await api.sessionLogs(c.id);
          for (const signal of activeSignals(computeSignals(detail.currentProgram, logs, nameOf))) {
            signals.push({ client: c, program: detail.currentProgram, signal });
          }
        }
      }
      signals = [...signals];
    } catch (err) {
      console.error(err);
    }
  });
</script>

<svelte:head><title>Overview · Program Tracker</title></svelte:head>

<div class="page-head">
  <div>
    <h1>Overview</h1>
    <p class="sub">Monday, week 13 of the training year.</p>
  </div>
  <a class="btn" href="/clients">All clients</a>
</div>

{#if clients === null}
  <div class="panel"><div class="panel-body"><div class="skeleton" style="height:80px"></div></div></div>
{:else}
  {#if signals.length > 0}
    <section class="panel needs-review">
      <div class="panel-head">
        <h2>Needs review</h2>
        <span class="subtle">periodization signals — computed from logs, you decide</span>
      </div>
      <div class="sig-list">
        {#each signals as { client, signal } (signal.id)}
          <div class="sig" class:urgent={signal.severity === "urgent"} class:attention={signal.severity === "attention"}>
            <div class="sig-body">
              <div class="sig-top">
                <span class="sev-dot"></span>
                <strong>{signal.title}</strong>
                <a class="client-link" href={`/clients/${client.id}`}>{client.name}</a>
              </div>
              <p class="evidence">{signal.evidence}</p>
            </div>
            <div class="sig-actions">
              {#if signal.prefillNote}
                <a
                  class="btn small"
                  href={`/clients/${client.id}/generate?tpl=${signal.templateHint ?? ""}&note=${encodeURIComponent(signal.prefillNote)}`}
                >
                  ✦ Draft next block
                </a>
              {:else if signal.altHref}
                <a class="btn ghost small" href={signal.altHref}>{signal.altLabel}</a>
              {/if}
              <a class="btn ghost small" href={`/clients/${client.id}`}>Open client</a>
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <section class="panel" style="margin-top:{signals.length ? 18 : 0}px">
    <div class="panel-head">
      <h2>Clients</h2>
      <span class="subtle">{clients.filter((c) => c.status === "active").length} active</span>
    </div>
    <table class="sheet">
      <thead>
        <tr>
          <th>Client</th>
          <th>Status</th>
          <th>Days</th>
          <th>Current program</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each clients as c (c.id)}
          <tr class="rowlink" onclick={() => goto(`/clients/${c.id}`)}>
            <td>
              <strong>{c.name}</strong>
              {#if c.limitations}<span class="pill bad" style="margin-left:8px">limitations</span>{/if}
            </td>
            <td><StatusPill status={c.status} /></td>
            <td class="num">{c.daysPerWeek ?? "—"}/wk</td>
            <td>{currentNames[c.id] ?? "…"}</td>
            <td class="subtle">→</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>

  <section class="panel" style="margin-top:18px">
    <div class="panel-head">
      <h2>AI providers</h2>
      <span class="subtle">{apiMode === "mock" ? "demo registry" : "live registry"}</span>
    </div>
    <div class="panel-body provs">
      {#each providers ?? [] as p (p.id)}
        <div class="prov">
          <strong>{p.label}</strong>
          <span class="num subtle">{p.model}</span>
          {#if p.configured}<span class="pill good">ready</span>{:else}<span class="pill neutral">no key</span>{/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .sig-list { display: flex; flex-direction: column; }
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
  .sig-top { display: flex; align-items: center; gap: 9px; flex-wrap: wrap; }
  .client-link { font-size: 12.5px; color: var(--faint); }
  .client-link:hover { color: var(--ink); }
  .evidence { margin: 3px 0 0 18px; font-size: 13px; color: var(--muted); }
  .sig-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .btn.small { padding: 4px 10px; font-size: 13px; }

  .provs {
    display: flex;
    gap: 26px;
    flex-wrap: wrap;
  }
  .prov {
    display: flex;
    align-items: center;
    gap: 10px;
  }
</style>
