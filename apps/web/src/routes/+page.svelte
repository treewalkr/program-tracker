<script lang="ts">
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import type { ClientDto, ProviderDto } from "$lib/api/types";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import { goto } from "$app/navigation";

  let clients = $state<ClientDto[] | null>(null);
  let providers = $state<ProviderDto[] | null>(null);
  let currentNames = $state<Record<string, string>>({});

  onMount(async () => {
    try {
      const [cs, ps] = await Promise.all([api.clients(), api.providers()]);
      clients = cs;
      providers = ps;
      for (const c of cs) {
        const detail = await api.client(c.id);
        currentNames[c.id] = detail.currentProgram?.name ?? "—";
      }
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
  <section class="panel">
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
