<script lang="ts">
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import { feedbackHandle } from "@pt/shared";
  import { apiMode } from "$lib/api";
  import { adminApi } from "$lib/api/admin";
  import { ago } from "$lib/draftReview";
  import {
    ERROR,
    byRecent,
    counts as countAll,
    fromSentEmails,
    groupByDay,
    hourlyBuckets,
    inFilter,
    lastActivity,
    matches,
    queueLag,
    sampleOutbox,
    span,
    tabOf,
    type OutboxFilter,
    type OutboxSnapshot,
  } from "$lib/emailOutbox";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import SignalRow from "$lib/components/SignalRow.svelte";
  import OutboxHealth from "$lib/components/OutboxHealth.svelte";
  import OutboxActivity from "$lib/components/OutboxActivity.svelte";
  import OutboxRow from "$lib/components/OutboxRow.svelte";

  /**
   * Admin monitor for notification email: is mail flowing, what is stuck,
   * what failed and why. Live data is today's send log (finished sends
   * only); `?demo` — and mock mode — show a sample outbox with the queue,
   * retries and actions the outbox pattern will bring. Addresses are masked
   * and no message content is kept.
   */

  const demo = $derived(page.url.searchParams.has("demo"));
  const useSample = $derived(apiMode === "mock" || demo);

  let snap = $state<OutboxSnapshot | null>(null);
  let loadError = $state<string | null>(null);
  let now = $state(Date.now());
  let filter = $state<OutboxFilter>("all");
  let query = $state("");
  let announce = $state("");

  async function load() {
    loadError = null;
    snap = null;
    try {
      snap = fromSentEmails(await adminApi.sentEmails());
      now = Date.now();
    } catch (err) {
      loadError = (err as Error).message || "the server didn't answer";
    }
  }

  // (Re)load when the source flips between sample and real data — and only then.
  $effect(() => {
    const sample = useSample;
    untrack(() => {
      filter = "all";
      if (sample) {
        const t = Date.now();
        loadError = null;
        now = t;
        snap = sampleOutbox(t);
      } else if (apiMode === "live") {
        load();
      }
    });
  });

  // Relative times ("next try in 2 min") stay honest.
  $effect(() => {
    const t = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(t);
  });

  const isOutbox = $derived(snap?.source === "outbox");
  const all = $derived(snap ? [...snap.messages].sort(byRecent) : []);
  const c = $derived(countAll(all, now));
  const lag = $derived(queueLag(all, now));
  const buckets = $derived(hourlyBuckets(all, now));

  const attention = $derived(isOutbox ? all.filter((m) => m.status === "dead" || m.status === "retrying") : []);
  const shown = $derived(all.filter((m) => inFilter(m, filter) && matches(m, query)));
  /** Rows rendered so far; a new filter or search starts the page over. */
  const PAGE = 25;
  let limit = $derived.by(() => {
    void filter;
    void query;
    return PAGE;
  });
  const groups = $derived(groupByDay(shown.slice(0, limit), now));
  const more = $derived(shown.length - limit);
  /** Day headers count the whole day, not just the rows rendered so far. */
  const dayTotals = $derived(new Map(groupByDay(shown, now).map((g) => [g.key, g.messages.length])));

  const tab = $derived(tabOf(filter));
  const tabs = $derived([
    { id: "all", label: "All", count: String(all.length) },
    ...(isOutbox ? [{ id: "queue", label: "In queue", count: String(c.queued + c.sending + c.retrying) }] : []),
    { id: "failed", label: "Failed", count: String(c.dead) },
    { id: "sent", label: "Sent", count: String(c.sent) },
  ]);

  const sub = $derived.by(() => {
    if (!snap) return "Notification emails to trainers. Addresses are masked; no message content is kept.";
    if (snap.dispatcher) {
      const ran = span(now - Date.parse(snap.dispatcher.lastRunAt));
      const lead = snap.dispatcher.healthy ? `Dispatcher ran ${ran} ago` : `Dispatcher silent for ${ran}`;
      return lag === null ? `${lead} · queue empty` : `${lead} · ${c.queued} waiting · oldest ${span(lag)}`;
    }
    if (!all.length) return "No emails sent yet.";
    const last = all.find((m) => m.sentAt);
    const parts = [last ? `Last send ${ago(last.sentAt!, now)}` : "Nothing delivered yet"];
    parts.push(c.dead24h ? `${c.dead24h} failed in 24 h` : "no failures in 24 h");
    return parts.join(" · ");
  });

  const EMPTY: Record<string, { text: string; good?: boolean }> = {
    all: { text: "No emails yet." },
    queue: { text: "Queue is empty — everything has gone out.", good: true },
    queued: { text: "Nothing queued — the dispatcher is keeping up.", good: true },
    sending: { text: "Nothing in flight right now.", good: true },
    retrying: { text: "No retries pending.", good: true },
    failed: { text: "No failed emails — all clear.", good: true },
    sent: { text: "Nothing delivered yet." },
  };
  const FILTER_NAME: Partial<Record<OutboxFilter, string>> = {
    queued: "queued",
    sending: "sending",
    retrying: "retrying",
  };

  // —— sample-only actions ——————————————————————————————
  const timers = new Set<ReturnType<typeof setTimeout>>();
  $effect(() => () => timers.forEach(clearTimeout));

  const find = (id: string) => snap?.messages.find((m) => m.id === id);
  const who = (id: string) => {
    const m = find(id);
    return m ? `${m.label} to ${m.recipient?.name ?? "removed account"}` : "Email";
  };

  function retry(id: string) {
    const m = find(id);
    if (!m) return;
    m.status = "sending";
    m.nextAttemptAt = null;
    announce = `Retrying ${who(id)}.`;
    const t = setTimeout(() => {
      timers.delete(t);
      const x = find(id);
      if (!x || x.status !== "sending") return;
      const at = Date.now();
      const ms = 640 + Math.round(Math.random() * 900);
      x.attempts.push({ at: new Date(at).toISOString(), ok: true, ms });
      x.sentAt = new Date(at + ms).toISOString();
      x.status = "sent";
      now = Date.now();
      announce = `${who(id)} sent.`;
    }, 1600);
    timers.add(t);
  }

  function discard(id: string) {
    if (!snap) return;
    announce = `Discarded ${who(id)}.`;
    snap.messages = snap.messages.filter((m) => m.id !== id);
  }

  const evidence = (m: (typeof attention)[number]) => {
    const tries = m.attempts.length;
    if (m.status === "retrying") {
      const next = m.nextAttemptAt ? ` · next in ${span(Date.parse(m.nextAttemptAt) - now)}` : "";
      return `Attempt ${tries}/${m.maxAttempts}${next} · queued ${ago(m.createdAt, now)}`;
    }
    return `Gave up after ${tries} ${tries === 1 ? "attempt" : "attempts"} · ${ago(lastActivity(m), now)}`;
  };
</script>

<svelte:head><title>Email outbox · Program Tracker</title></svelte:head>

{#if demo && apiMode === "live"}
  <Note tone="warn" class="sample-note">
    Sample data — not real sends. Retry and Discard only change this preview.
    <a href={page.url.pathname}>Back to real data</a>
  </Note>
{/if}

<PageHead title="Email outbox" {sub}>
  {#snippet actions()}
    {#if apiMode === "live" && !demo && all.length}
      <Button href="?demo" variant="ghost" small>Preview with sample data</Button>
    {/if}
  {/snippet}
</PageHead>

{#if loadError}
  <Note tone="bad">
    Couldn't load the send log — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else if !snap}
  <SkeletonPanel />
{:else if !all.length && !isOutbox}
  <p class="quiet">
    <Icon name="mail" size={16} />
    <span>Nothing sent yet. Emails show here once a new ticket, reply or status change notifies someone.</span>
    <a href="?demo">Preview with sample data</a>
  </p>
{:else}
  <div class="stack">
    <section class="panel overview" aria-label="Outbox health">
      <OutboxHealth counts={c} {lag} source={snap.source} {filter} onfilter={(f) => (filter = f)} />
      <OutboxActivity {buckets} />
    </section>

    {#if attention.length}
      <Panel title="Needs attention" count={attention.length} class="attention">
        {#each attention as m (m.id)}
          <SignalRow severity={m.status === "dead" ? "urgent" : "attention"} evidence={evidence(m)}>
            {#snippet title()}
              <span class="att-title">
                <Pill tone={m.status === "dead" ? "bad" : "warn"}>
                  {ERROR[m.attempts.at(-1)?.error ?? ""] ?? "Failed"}
                </Pill>
                {#if m.feedbackNumber !== null}
                  <a href="/feedback#{feedbackHandle(m.feedbackNumber)}">{m.label}</a>
                {:else}
                  {m.label}
                {/if}
                <span class="att-who">to {m.recipient?.name ?? "removed account"}</span>
              </span>
            {/snippet}
            {#snippet actions()}
              <Button small onclick={() => retry(m.id)}>Retry now</Button>
              <ConfirmButton small label="Discard" onconfirm={() => discard(m.id)} />
            {/snippet}
          </SignalRow>
        {/each}
      </Panel>
    {/if}

    <Panel class="messages" title="Messages" count={shown.length === all.length ? all.length : `${shown.length} of ${all.length}`}>
      <div class="bar">
        <Tabs items={tabs} value={tab} idPrefix="outbox" label="Filter messages" onchange={(id) => (filter = id as OutboxFilter)} />
        <input
          class="input search"
          type="search"
          bind:value={query}
          placeholder="Name or ticket (FB-12)"
          aria-label="Search by recipient name or ticket"
        />
      </div>
      {#if FILTER_NAME[filter]}
        <p class="scope">
          Showing {FILTER_NAME[filter]} only ·
          <button type="button" class="linkish" onclick={() => (filter = "queue")}>show everything in queue</button>
        </p>
      {/if}
      <div id="panel-{tab}" role="tabpanel" aria-labelledby="outbox-{tab}">
        {#if !shown.length}
          {@const e = query.trim() ? { text: `No emails match “${query.trim()}”.` } : EMPTY[filter]}
          <p class="none" class:good={e.good}>
            {#if e.good}<Icon name="check" />{/if}
            {e.text}
          </p>
        {:else}
          {#each groups as g (g.key)}
            <h3 class="day">{g.label} <span class="day-n">{dayTotals.get(g.key) ?? g.messages.length}</span></h3>
            {#each g.messages as m (m.id)}
              <OutboxRow message={m} {now} />
            {/each}
          {/each}
          {#if more > 0}
            <div class="more">
              <Button small onclick={() => (limit += PAGE)}>Show {Math.min(more, PAGE)} more</Button>
              <span>{more} older not shown</span>
            </div>
          {/if}
        {/if}
      </div>
    </Panel>
  </div>
{/if}

<p class="sr" role="status" aria-live="polite">{announce}</p>

<style>
  :global(.sample-note) {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    margin-bottom: 16px;
  }
  :global(.sample-note) a { color: inherit; font-weight: 600; }

  .quiet {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    margin: 0;
    padding: 10px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 14px;
  }
  .quiet :global(svg) { color: var(--faint); flex: none; }
  .quiet span { flex: 1 1 18rem; }

  .stack {
    display: grid;
    gap: 16px;
    min-width: 0;
  }
  .overview :global(.activity) { padding-top: 14px; }

  .att-title {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
  }
  .att-title a { color: var(--ink); }
  .att-who { font-weight: 400; color: var(--muted); }

  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px 16px;
    padding: 0 16px;
    border-bottom: 1px solid var(--line);
  }
  .bar :global(.tabs) {
    margin: 0 0 -1px;
    border-bottom: none;
    flex: 1 1 auto;
  }
  .search {
    width: 15rem;
    margin: 8px 0;
  }

  .more {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 16px;
    border-top: 1px solid var(--line-soft);
    font-size: 13px;
    color: var(--muted);
  }

  .scope {
    margin: 0;
    padding: 8px 16px;
    font-size: 13px;
    color: var(--muted);
    border-bottom: 1px solid var(--line-soft);
  }
  .linkish {
    appearance: none;
    border: none;
    background: none;
    padding: 0;
    font: inherit;
    color: var(--blue);
    cursor: pointer;
  }
  .linkish:hover { text-decoration: underline; }

  .day {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: 0;
    padding: 6px 16px;
    background: var(--well);
    border-bottom: 1px solid var(--line-soft);
    font: 600 12px/1.3 var(--font-ui);
    color: var(--muted);
  }
  .day-n {
    font: 400 12px/1 var(--font-mono);
    color: var(--faint);
    margin-left: 6px;
  }

  .none {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 14px 16px;
    font-size: 14px;
    color: var(--muted);
  }
  .none.good { color: var(--good); }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* The main column is the container (layout: `container: main`), so these
     follow the space the page actually gets, not the window. */
  @container main (max-width: 600px) {
    :global(.attention .signal) { flex-wrap: wrap; row-gap: 0; }
    :global(.attention .signal .act) { flex: 1 1 100%; margin: 4px 0 0 20px; }
    .bar { padding: 0 8px; }
    .search { width: 100%; margin: 8px 0 0; order: -1; }
    .bar :global(.tabs) { flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden; gap: 0; }
    .bar :global(.tabs button) { padding: 8px 10px; flex: none; }
  }
</style>
