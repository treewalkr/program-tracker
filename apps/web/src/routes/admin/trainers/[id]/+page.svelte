<script lang="ts">
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import { apiMode } from "$lib/api";
  import { adminApi, type AccessLogEntry } from "$lib/api/admin";
  import { fmtDateTime } from "$lib/format";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const live = apiMode === "live";
  const id = $derived(page.params.id ?? "");

  /** undefined = loading; null = no such trainer. */
  let log = $state<{ trainer: { id: string; name: string }; views: AccessLogEntry[] } | null | undefined>(undefined);
  let loadError = $state<string | null>(null);

  async function load(trainerId: string) {
    log = undefined;
    loadError = null;
    try {
      const got = await adminApi.accessLog(trainerId);
      if (trainerId === id) log = got;
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  $effect(() => {
    const trainerId = id;
    if (live) untrack(() => load(trainerId));
  });

  const ENDED: Record<NonNullable<AccessLogEntry["endedBy"]>, string> = {
    stop: "Stopped",
    expired: "Timed out",
    flag_off: "Switched off",
    disabled: "Account disabled",
  };

  /** "12 min" between two ISO times, at least 1. */
  const span = (from: string, to: string) =>
    `${Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 60_000))} min`;
</script>

<Crumbs items={[{ label: "Trainers", href: "/admin" }, { label: log?.trainer.name ?? "Trainer" }]} />
<PageHead title={log ? `${log.trainer.name} — access log` : "Access log"} sub="Every time an admin viewed this account, and anything written while edits were allowed." />

{#if !live}
  <Note tone="warn">The access log lives on the server — use the live API to see it.</Note>
{:else if loadError}
  <Note tone="bad" role="alert">Couldn't load the access log — {loadError}.</Note>
{:else if log === undefined}
  <SkeletonPanel title="Views" count rows={3} />
{:else if log === null}
  <EmptyState><p>No such trainer — they may have been removed.</p></EmptyState>
{:else}
  <Panel title="Views" count={log.views.length}>
    {#if log.views.length === 0}
      <p class="none">No one has viewed this account.</p>
    {:else}
      <ol class="views">
        {#each log.views as v (v.id)}
          <li>
            <div class="line">
              <strong>{v.admin.name}</strong>
              <span class="muted">viewed</span>
              {#if v.ticket}<a class="ticket" href="/feedback#{v.ticket.handle}">{v.ticket.handle}</a>{:else}<span class="muted">from Trainers</span>{/if}
              <span class="grow"></span>
              {#if v.endedBy}
                <Pill>{ENDED[v.endedBy]}</Pill>
              {:else}
                <Pill tone="warn">Viewing now</Pill>
              {/if}
              {#if v.writes.length}<Pill tone="warn">{v.writes.length} {v.writes.length === 1 ? "write" : "writes"}</Pill>{/if}
            </div>
            <div class="meta">
              <time datetime={v.startedAt}>{fmtDateTime(v.startedAt)}</time>
              {#if v.endedAt}· <span class="num">{span(v.startedAt, v.endedAt)}</span>{/if}
              {#if v.reason}· “{v.reason}”{/if}
            </div>
            {#if v.writes.length}
              <table class="writes">
                <caption class="sr-only">Writes during this view</caption>
                <thead><tr><th>When</th><th>Request</th><th class="r">Status</th></tr></thead>
                <tbody>
                  {#each v.writes as w, i (i)}
                    <tr>
                      <td><time datetime={w.at}>{fmtDateTime(w.at)}</time></td>
                      <td><code>{w.method} {w.route}</code></td>
                      <td class="r num" class:bad={w.status >= 400}>{w.status}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </Panel>
{/if}

<style>
  .none {
    margin: 0;
    padding: 14px 16px;
    color: var(--muted);
    font-size: 13px;
  }
  .views {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .views li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 16px;
    font-size: 13px;
  }
  .views li + li {
    border-top: 1px solid var(--line-soft);
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .grow {
    flex: 1;
  }
  .muted,
  .meta {
    color: var(--muted);
  }
  .meta {
    font-size: 12px;
  }
  .ticket {
    font: 500 12px/1.4 var(--font-mono);
  }
  .num {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .writes {
    margin-top: 6px;
    border-collapse: collapse;
    width: 100%;
    max-width: 640px;
    font-size: 12px;
  }
  .writes th,
  .writes td {
    padding: 4px 8px;
    border: 1px solid var(--line-soft);
    text-align: left;
  }
  .writes th {
    background: var(--well);
    font-weight: 500;
    color: var(--muted);
  }
  .writes code {
    font: 500 12px/1.4 var(--font-mono);
  }
  .r {
    text-align: right;
  }
  .writes td.bad {
    color: var(--bad);
  }
</style>
