<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import type { ClientDto } from "$lib/api/types";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import { goto } from "$app/navigation";

  let clients = $state<ClientDto[] | null>(null);
  let showForm = $state(false);
  let saving = $state(false);
  let form = $state({ name: "", email: "", goals: "", limitations: "", daysPerWeek: 3 });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    try {
      const created = await api.createClient({
        name: form.name,
        email: form.email,
        goals: form.goals || null,
        limitations: form.limitations || null,
        daysPerWeek: Number(form.daysPerWeek),
      });
      goto(`/clients/${created.id}`);
    } finally {
      saving = false;
    }
  }

  onMount(async () => {
    clients = await api.clients();
  });
</script>

<svelte:head><title>Clients · Program Tracker</title></svelte:head>

<div class="page-head">
  <div>
    <h1>Clients</h1>
    <p class="sub">{clients?.length ?? "…"} on the roster</p>
  </div>
  <button class="btn" onclick={() => (showForm = !showForm)}>
    {showForm ? "Cancel" : "Add client"}
  </button>
</div>

{#if showForm}
  <section class="panel" style="margin-bottom:18px">
    <div class="panel-head"><h2>New client</h2></div>
    <form class="panel-body grid" onsubmit={submit}>
      <div>
        <label class="label" for="f-name">Name</label>
        <input class="input" id="f-name" bind:value={form.name} required maxlength="120" />
      </div>
      <div>
        <label class="label" for="f-email">Email</label>
        <input class="input" id="f-email" type="email" bind:value={form.email} required />
      </div>
      <div>
        <label class="label" for="f-days">Training days per week</label>
        <select class="select" id="f-days" bind:value={form.daysPerWeek}>
          {#each [1, 2, 3, 4, 5, 6] as d}<option value={d}>{d}</option>{/each}
        </select>
      </div>
      <div class="span2">
        <label class="label" for="f-goals">Goals</label>
        <textarea class="textarea" id="f-goals" rows="2" bind:value={form.goals} maxlength="2000"></textarea>
      </div>
      <div class="span2">
        <label class="label" for="f-lim">Limitations <span class="subtle">— treated as hard constraints by the AI</span></label>
        <textarea class="textarea" id="f-lim" rows="2" bind:value={form.limitations} maxlength="2000"></textarea>
      </div>
      <div class="span2">
        <button class="btn" type="submit" disabled={saving || !form.name || !form.email}>
          {saving ? "Saving…" : "Save client"}
        </button>
      </div>
    </form>
  </section>
{/if}

{#if clients === null}
  <div class="panel"><div class="panel-body"><div class="skeleton" style="height:60px"></div></div></div>
{:else if clients.length === 0}
  <section class="panel"><div class="empty">No clients yet — add your first one above.</div></section>
{:else}
  <section class="panel">
    <table class="sheet">
      <thead>
        <tr><th>Client</th><th>Status</th><th>Days</th><th>Goal</th><th>Limitations</th></tr>
      </thead>
      <tbody>
        {#each clients as c (c.id)}
          <tr class="rowlink">
            <td><a class="rowlink-name" href={`/clients/${c.id}`}><strong>{c.name}</strong></a><div class="subtle">{c.email}</div></td>
            <td><StatusPill status={c.status} /></td>
            <td class="num">{c.daysPerWeek ?? "—"}/wk</td>
            <td class="goal">{c.goals ?? "—"}</td>
            <td>{#if c.limitations}<span class="pill bad">yes</span>{:else}<span class="subtle">none</span>{/if}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </section>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr 160px;
    gap: 14px;
  }
  .span2 { grid-column: 1 / -1; }
  .goal { max-width: 320px; }
</style>
