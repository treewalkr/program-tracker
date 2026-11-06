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
  import { cardioUnitLabel } from "@pt/shared";

  const DAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const RANK = { active: 0, paused: 1, archived: 2 } as const;
  /** Search only earns its place once the roster is longer than a glance. */
  const SEARCH_MIN = 6;

  let clients = $state<ClientDto[] | null>(null);
  let showForm = $state(false);
  let saving = $state(false);
  let search = $state("");
  let form = $state({
    name: "",
    email: "",
    goals: "",
    limitations: "",
    sessionsPerWeek: 3,
    trainingDays: [] as number[],
  });

  const q = $derived(search.trim().toLowerCase());
  const filtered = $derived(
    (clients ?? [])
      .filter((c) => q === "" || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .sort((a, b) => RANK[a.status] - RANK[b.status] || a.name.localeCompare(b.name))
  );
  const activeCount = $derived((clients ?? []).filter((c) => c.status === "active").length);
  const rosterLine = $derived(
    clients == null
      ? "…"
      : activeCount === clients.length
        ? `${clients.length} on the roster`
        : `${activeCount} active · ${clients.length} on the roster`
  );

  function days(c: ClientDto): string {
    return [...(c.trainingDays ?? [])].sort((a, b) => a - b).map((d) => DAY[d]).join(" ");
  }
  function cardio(c: ClientDto): string | null {
    return c.cardioTarget ? `+ ${c.cardioTarget.value} ${cardioUnitLabel(c.cardioTarget.unit)} cardio` : null;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    saving = true;
    try {
      const created = await api.createClient({
        name: form.name,
        email: form.email,
        goals: form.goals || null,
        limitations: form.limitations || null,
        sessionsPerWeek: Number(form.sessionsPerWeek),
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

<PageHead title="Clients" sub={rosterLine}>
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
      <Field label="Lifting sessions a week" htmlFor="f-sessions" hint="cardio sessions don't count">
        <select class="select" id="f-sessions" bind:value={form.sessionsPerWeek}>
          {#each [1, 2, 3, 4, 5, 6, 7] as n (n)}<option value={n}>{n}</option>{/each}
        </select>
      </Field>
      <div class="span2">
        <Field label="Available days" hint="sessions are placed on these days; a day can hold more than one">
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

{#if clients !== null && clients.length >= SEARCH_MIN}
  <input class="input search" type="search" placeholder="Search by name or email" bind:value={search} aria-label="Search clients" />
{/if}

{#if clients === null}
  <SkeletonPanel height={60} />
{:else if clients.length === 0}
  <section class="panel"><EmptyState>No clients yet — add your first one above.</EmptyState></section>
{:else if filtered.length === 0}
  <section class="panel"><EmptyState>No client matches “{search}”.</EmptyState></section>
{:else}
  <section class="panel">
    <table class="sheet roster">
      <thead>
        <tr><th>Client</th><th>Schedule</th><th>Goal</th><th>Limitations</th></tr>
      </thead>
      <tbody>
        {#each filtered as c (c.id)}
          <tr class="row" class:dim={c.status !== "active"} onclick={(e) => { if (!(e.target as HTMLElement).closest("a")) goto(`/clients/${c.id}`); }}>
            <td>
              <div class="who">
                <a class="rowlink-name" href={`/clients/${c.id}`}>{c.name}</a>
                {#if c.status !== "active"}<StatusPill status={c.status} />{/if}
              </div>
              <div class="subtle">{c.email}</div>
            </td>
            <td class="sched">
              {#if c.sessionsPerWeek}<span class="num">{c.sessionsPerWeek}</span> lifting / wk{:else}<span class="subtle">not set</span>{/if}
              {#if days(c) || cardio(c)}
                <div class="subtle">{[days(c), cardio(c)].filter(Boolean).join(" · ")}</div>
              {/if}
            </td>
            <td class="goal"><span class="clamp" title={c.goals ?? undefined}>{c.goals ?? "—"}</span></td>
            <td class="limcell">
              {#if c.limitations}<span class="clamp lim" title={c.limitations}>{c.limitations}</span>{:else}<span class="subtle">—</span>{/if}
            </td>
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
  .search { margin-bottom: 12px; max-width: 320px; }
  .row { cursor: pointer; }
  .row.dim td { color: var(--muted); }
  .who { display: flex; align-items: center; gap: 8px; }
  .sched { white-space: nowrap; }
  .num { font-family: var(--font-mono); font-weight: 600; }
  .clamp { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 340px; }
  .lim { color: var(--warn); }
  @media (max-width: 700px) {
    .grid { grid-template-columns: minmax(0, 1fr); }
    .search { max-width: none; }
    .roster thead { display: none; }
    .roster, .roster tbody, .roster tr, .roster td { display: block; width: 100%; }
    .roster tr { padding: 10px 12px; border-bottom: 1px solid var(--line); }
    .roster tr:last-child { border-bottom: none; }
    .roster td { padding: 2px 0; border: none; }
    .roster td.sched { white-space: normal; margin-top: 4px; }
    .roster td.limcell:has(.subtle) { display: none; }
    .clamp { max-width: none; }
  }
  .mb-18 { margin-bottom: 18px; }
</style>
