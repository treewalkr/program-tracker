<script lang="ts">
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import { EXPERIENCE_LABEL, sessionsByWeekday, sessionTag } from "@pt/shared";
  import { apiMode } from "$lib/api";
  import { adminApi, type AdminClientDetail } from "$lib/api/admin";
  import { lastSessionLabel, localToday, sampleAdminClientDetail, shortDay } from "$lib/adminClients";
  import SessionCard from "$lib/components/SessionCard.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Button from "$lib/ui/Button.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const SEX_LABEL = { female: "Female", male: "Male" } as const;

  /** Real data comes from the live API; mock mode and `?demo` show the sample platform. */
  const demo = $derived(page.url.searchParams.has("demo"));
  const useSample = $derived(apiMode === "mock" || demo);
  const id = $derived(page.params.id ?? "");
  const today = localToday();
  const backHref = $derived(`/admin/clients${demo ? "?demo" : ""}`);

  /** undefined = loading; null = no such client. */
  let detail = $state<AdminClientDetail | null | undefined>(undefined);
  let loadError = $state<string | null>(null);

  async function load(clientId: string, sample: boolean) {
    detail = undefined;
    loadError = null;
    if (sample) {
      detail = sampleAdminClientDetail(clientId, today);
      return;
    }
    try {
      const got = await adminApi.client(clientId);
      if (clientId === id) detail = got;
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  // (Re)load when the client or the data source changes — and only then.
  $effect(() => {
    const clientId = id;
    const sample = useSample;
    untrack(() => load(clientId, sample));
  });

  const client = $derived(detail?.client ?? null);
  const programme = $derived(detail?.programme ?? null);
  const last = $derived(client ? lastSessionLabel(client.lastSessionAt, today) : null);

  /** This week grouped Mon→Sun, then unscheduled ("Any day") last; empty days dropped. */
  const weekGroups = $derived.by(() => {
    if (!programme) return [];
    const by = sessionsByWeekday(programme.thisWeek.sessions);
    return [1, 2, 3, 4, 5, 6, 7, 0].map((day) => ({ day, sessions: by.get(day) ?? [] })).filter((g) => g.sessions.length > 0);
  });

  const meta = $derived.by(() => {
    if (!programme) return "";
    const parts = [`Week ${programme.week} of ${programme.of}${programme.over ? " · past the plan" : ""}`];
    if (programme.activatedAt) parts.push(`activated ${shortDay(programme.activatedAt, today)}`);
    if (programme.aiAssisted) parts.push("AI-assisted");
    return parts.join(" · ");
  });

  const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
</script>

<svelte:head><title>{client ? `${client.name} · All clients` : "Client · All clients"} · Program Tracker</title></svelte:head>

{#if demo && apiMode === "live"}
  <Note tone="warn" class="sample-note">
    Sample data — this client isn't real.
    <Button small variant="ghost" href={page.url.pathname}>Back to real data</Button>
  </Note>
{/if}

{#snippet unset()}<span class="unset">Not set</span>{/snippet}

{#if loadError}
  <PageHead title="Client" crumbs={[{ href: backHref, label: "All clients" }, { label: "Client" }]} />
  <Note tone="bad">
    Couldn't load this client — {loadError}.
    <Button small onclick={() => load(id, useSample)}>Try again</Button>
  </Note>
{:else if detail === undefined}
  <div class="layout">
    <SkeletonPanel height={240} />
    <SkeletonPanel height={360} />
  </div>
{:else if detail === null || !client}
  <PageHead title="Client not found" crumbs={[{ href: backHref, label: "All clients" }, { label: "Not found" }]} />
  <section class="panel">
    <EmptyState>
      No client with this id — it may have been deleted.
      {#snippet actions()}<Button href={backHref}>Back to all clients</Button>{/snippet}
    </EmptyState>
  </section>
{:else}
  <PageHead title={client.name} crumbs={[{ href: backHref, label: "All clients" }, { label: client.name }]} sub={`Read-only · client of ${client.trainer.name}`}>
    {#snippet titleSuffix()}
      <StatusPill status={client.status} />
      {#if client.trainer.access === "disabled"}<Pill tone="bad">Trainer disabled</Pill>{/if}
    {/snippet}
  </PageHead>

  <div class="layout">
    <Panel title="Basics" class="basics">
      <dl class="facts">
        <dt>Experience</dt>
        <dd>
          {#if client.experience}
            {EXPERIENCE_LABEL[client.experience].label} <span class="aside">{EXPERIENCE_LABEL[client.experience].band}</span>
          {:else}{@render unset()}{/if}
        </dd>
        <dt>Age</dt>
        <dd class="tnum">{#if client.age != null}{client.age}{:else}{@render unset()}{/if}</dd>
        <dt>Sex</dt>
        <dd>{#if client.sex}{SEX_LABEL[client.sex]}{:else}{@render unset()}{/if}</dd>
        <dt>Bodyweight</dt>
        <dd class="tnum">{#if client.bodyweightKg != null}{fmtNum(client.bodyweightKg)} kg{:else}{@render unset()}{/if}</dd>
        <dt>Height</dt>
        <dd class="tnum">{#if client.heightCm != null}{fmtNum(client.heightCm)} cm{:else}{@render unset()}{/if}</dd>
        <dt>Lifting sessions / week</dt>
        <dd class="tnum">{#if client.sessionsPerWeek != null}{client.sessionsPerWeek}{:else}{@render unset()}{/if}</dd>
        <dt>Training days</dt>
        <dd>
          {#if client.trainingDays?.length}
            {[...client.trainingDays].sort((a, b) => a - b).map((d) => DAY_NAMES[d - 1]).join(" ")}
          {:else}{@render unset()}{/if}
        </dd>
        <dt>Client since</dt>
        <dd class="tnum">{shortDay(client.clientSince, today)}</dd>
        <dt>Last session</dt>
        <dd class="tnum last {last?.tone}"><span title={client.lastSessionAt ?? "No session logged"}>{last?.text}</span></dd>
      </dl>
    </Panel>

    {#if programme}
      <Panel title={programme.name} count={`v${programme.version}`} class="programme">
        <p class="meta" class:over={programme.over}>{meta}</p>
        {#each weekGroups as g (g.day)}
          <div class="day-h" class:any={g.day === 0}>
            <span class="day-name">{g.day === 0 ? "Any day" : DAY_NAMES[g.day - 1]}</span>
            {#if g.day === 0}<span class="day-note">not placed on the calendar</span>{/if}
            {#if g.sessions.length > 1}<span class="day-count"><span class="num">{g.sessions.length}</span> sessions</span>{/if}
          </div>
          {#each g.sessions as s (s.id)}
            <SessionCard
              name={s.name}
              tag={sessionTag(s)}
              kind={s.kind}
              cardio={s.cardio}
              exercises={s.exercises.map((e) => ({ name: e.exerciseName ?? "", role: e.role, sets: e.prescribedSets }))}
            />
          {/each}
        {/each}
        <p class="legend">RPE colour: ≤6 easy, 7–8 hard, 9–10 max · a bare time = timed set</p>
      </Panel>
    {:else}
      <section class="panel programme">
        <EmptyState>No active programme — {client.trainer.name} hasn't activated one yet.</EmptyState>
      </section>
    {/if}
  </div>
{/if}

<style>
  :global(.note.sample-note) { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
  .layout { display: grid; grid-template-columns: 320px minmax(0, 1fr); gap: 16px; align-items: start; }
  .layout > :global(.panel) { margin: 0; }
  @media (max-width: 900px) {
    .layout { grid-template-columns: minmax(0, 1fr); }
  }

  .facts { display: grid; grid-template-columns: auto 1fr; gap: 10px 16px; margin: 0; padding: 14px 16px; font-size: 14px; }
  .facts dt { color: var(--muted); font-size: 13px; }
  .facts dd { margin: 0; color: var(--ink); }
  .aside { color: var(--muted); font-size: 12px; margin-left: 4px; }
  .unset { color: var(--faint); }
  .tnum { font-variant-numeric: tabular-nums; }
  .last.none { color: var(--muted); }
  .last.dormant { color: var(--warn); }

  .meta { margin: 10px 16px 2px; font-size: 13px; color: var(--muted); }
  .meta.over { color: var(--warn); }
  .day-h {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 12px 14px 0;
    border-top: 1px solid var(--line);
    font-size: 12px;
    color: var(--muted);
  }
  .day-h .day-name { font-weight: 600; color: var(--ink); }
  .day-h .day-note { color: var(--faint); }
  .day-h .day-count { margin-left: auto; }
  .legend { margin: 12px 16px; font: 400 13px/1.5 var(--font-ui); color: var(--muted); }
</style>
