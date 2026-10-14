<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import type { ClientDto } from "$lib/api/types";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import WeekdayPicker from "$lib/components/WeekdayPicker.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import { goto } from "$app/navigation";

  let clients = $state<ClientDto[] | null>(null);
  let showForm = $state(false);
  let saving = $state(false);
  let search = $state("");
  let form = $state({
    name: "",
    email: "",
    goals: "",
    limitations: "",
    daysPerWeek: 3,
    trainingDays: [] as number[],
  });

  const filtered = $derived(
    (clients ?? []).filter(
      (c) =>
        search.trim() === "" ||
        c.name.toLowerCase().includes(search.trim().toLowerCase()) ||
        c.email.toLowerCase().includes(search.trim().toLowerCase())
    )
  );

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
        trainingDays: form.trainingDays.length ? form.trainingDays : undefined,
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

<PageHead title="Clients" sub={`${clients?.length ?? "…"} on the roster`}>
  {#snippet actions()}
    <Button variant={showForm ? "ghost" : "default"} onclick={() => (showForm = !showForm)}>
      {#snippet icon()}{#if !showForm}<Icon name="plus" />{/if}{/snippet}
      {#if showForm}Cancel{:else}Add client{/if}
    </Button>
  {/snippet}
</PageHead>

{#if showForm}
  <div class="mb-18">
  <Panel title="New client">
    <form class="panel-body grid" onsubmit={submit}>
      <Field label="Name" htmlFor="f-name">
        <input class="input" id="f-name" bind:value={form.name} required maxlength="120" />
      </Field>
      <Field label="Email" htmlFor="f-email">
        <input class="input" id="f-email" type="email" bind:value={form.email} required />
      </Field>
      <Field label="Training days per week" htmlFor="f-days">
        <select class="select" id="f-days" bind:value={form.daysPerWeek}>
          {#each [1, 2, 3, 4, 5, 6] as d}<option value={d}>{d}</option>{/each}
        </select>
      </Field>
      <div class="span2">
        <Field label="Which days" hint="drives the weekly plan grid">
          <WeekdayPicker bind:days={form.trainingDays} />
        </Field>
      </div>
      <div class="span2">
        <Field label="Goals" htmlFor="f-goals">
          <textarea class="textarea" id="f-goals" rows="2" bind:value={form.goals} maxlength="2000"></textarea>
        </Field>
      </div>
      <div class="span2">
        <Field label="Limitations" htmlFor="f-lim" hint="treated as hard constraints by the AI">
          <textarea class="textarea" id="f-lim" rows="2" bind:value={form.limitations} maxlength="2000"></textarea>
        </Field>
      </div>
      <div class="span2">
        <Button variant="primary" type="submit" disabled={saving || !form.name || !form.email}>
          {saving ? "Saving…" : "Save client"}
        </Button>
      </div>
    </form>
  </Panel>
  </div>
{/if}

{#if clients === null}
  <SkeletonPanel height={60} />
{:else if clients.length === 0}
  <section class="panel"><EmptyState>No clients yet — add your first one above.</EmptyState></section>
{:else if filtered.length === 0}
  <section class="panel"><EmptyState>No client matches “{search}”.</EmptyState></section>
{:else}
  <input class="input search" type="search" placeholder="Search clients…" bind:value={search} aria-label="Search clients" />
  <section class="panel">
    <table class="sheet">
      <thead>
        <tr><th>Client</th><th>Status</th><th>Days</th><th>Goal</th><th>Limitations</th></tr>
      </thead>
      <tbody>
        {#each filtered as c (c.id)}
          <tr class="rowlink">
            <td><a class="rowlink-name" href={`/clients/${c.id}`}><strong>{c.name}</strong></a><div class="subtle">{c.email}</div></td>
            <td><StatusPill status={c.status} /></td>
            <td class="r">{c.daysPerWeek ?? "—"} / wk</td>
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
  .search { margin-bottom: 12px; max-width: 320px; }
  .mb-18 { margin-bottom: 18px; }
</style>
