<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { feedbackHandle, isPinned, unpinnedContext, type FeedbackItem, type FeedbackStatus } from "@pt/shared";
  import { feedbackApi, exportUrl, shotUrl } from "$lib/feedback/client";
  import { shortPath } from "$lib/feedback/capture";
  import { fmtDate, fmtDateTime } from "$lib/format";
  import Author from "$lib/feedback/Author.svelte";
  import Thread from "$lib/feedback/Thread.svelte";
  import { feedbackUnread } from "$lib/feedback/unread.svelte";
  import MuteToggle from "$lib/feedback/MuteToggle.svelte";
  import { STATUS_LABEL, STATUS_TONE } from "$lib/feedback/status";
  import Tooltip from "$lib/ui/Tooltip.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  type Filter = FeedbackStatus | "all";

  /** The admin triages; everyone else sees their own items, read-only. */
  const isAdmin = $derived.by(() => {
    const session = page.data.session;
    return session?.kind === "open" || (session?.kind === "signedIn" && session.trainer.isAdmin);
  });

  let items = $state<FeedbackItem[]>([]);
  let loaded = $state(false);
  let error = $state<string | null>(null);
  let filter = $state<Filter>("new");
  let copied = $state(false);
  /** Triage-note drafts keyed by item id; saved on blur. */
  let notes = $state<Record<string, string>>({});
  let busy = $state<Record<string, boolean>>({});
  /** Items that had unread activity when the page opened; stay marked for this visit. */
  let fresh = $state(new Set<string>());
  /** Handle from `/feedback#FB-012`, flashed once scrolled into view. */
  let flashed = $state<string | null>(null);

  /** New-ticket composer: a ticket written here, not pinned to an element. */
  let composing = $state(false);
  let draft = $state("");
  let draftPage = $state("");
  let filing = $state(false);
  let draftField = $state<HTMLTextAreaElement | null>(null);

  const counts = $derived(
    items.reduce(
      (acc, i) => ((acc[i.status] += 1), acc),
      { new: 0, accepted: 0, done: 0, wontfix: 0 } as Record<FeedbackStatus, number>,
    ),
  );
  const visible = $derived(filter === "all" ? items : items.filter((i) => i.status === filter));
  const tabs = $derived([
    ...(Object.keys(STATUS_LABEL) as FeedbackStatus[]).map((s) => ({
      id: s,
      label: STATUS_LABEL[s],
      count: String(counts[s]),
    })),
    { id: "all", label: "All", count: String(items.length) },
  ]);

  async function load() {
    try {
      items = await feedbackApi.list();
      notes = Object.fromEntries(items.map((i) => [i.id, i.triageNote ?? ""]));
      fresh = new Set(items.filter((i) => i.unread).map((i) => i.id));
      // Reporters follow their own few items: show them all at once.
      if (!isAdmin) filter = "all";
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not load feedback";
    } finally {
      loaded = true;
    }
  }

  onMount(async () => {
    await load();
    await jumpToHash();
  });

  /** `/feedback#FB-012` (email links, pins): show All, scroll to it, flash it. */
  async function jumpToHash() {
    const handle = /^#(FB-\d+)$/.exec(location.hash)?.[1];
    if (!handle || !items.some((i) => feedbackHandle(i.number) === handle)) return;
    filter = "all";
    await tick();
    document.getElementById(handle)?.scrollIntoView({
      block: "start",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
    flashed = handle;
    setTimeout(() => (flashed = null), 2400);
  }

  /** Opens the item's page and points at its element (handled by the feedback layer). */
  const showMeHref = (item: FeedbackItem) => {
    const path = item.context.route.path;
    return `${path}${path.includes("?") ? "&" : "?"}fbshow=${item.id}`;
  };

  /** Marks an unread item seen once at least half of it has been on screen. */
  function seenWhenVisible(node: HTMLElement, item: FeedbackItem) {
    if (!item.unread) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        items = items.map((i) => (i.id === item.id ? { ...i, unread: false } : i));
        feedbackUnread.markSeen(item.id);
      },
      { threshold: 0.5 },
    );
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  function replace(next: FeedbackItem) {
    items = items.map((i) => (i.id === next.id ? next : i));
  }

  /**
   * Per-item request counter. Blurring the note and clicking a status button
   * fire two PATCHes back to back; only the latest response may land, or a
   * stale one would roll the status back on screen.
   */
  const seq: Record<string, number> = {};

  async function triage(item: FeedbackItem, patch: { status?: FeedbackStatus; triageNote?: string | null }) {
    const n = (seq[item.id] = (seq[item.id] ?? 0) + 1);
    busy[item.id] = true;
    try {
      const next = await feedbackApi.triage(item.id, patch);
      if (seq[item.id] !== n) return;
      replace(next);
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not update feedback";
    } finally {
      if (seq[item.id] === n) busy[item.id] = false;
    }
  }

  function saveNote(item: FeedbackItem) {
    const next = (notes[item.id] ?? "").trim();
    if (next === (item.triageNote ?? "")) return;
    triage(item, { triageNote: next || null });
  }

  async function remove(item: FeedbackItem) {
    try {
      await feedbackApi.remove(item.id);
      items = items.filter((i) => i.id !== item.id);
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not delete feedback";
    }
  }

  async function openComposer() {
    composing = true;
    await tick();
    draftField?.focus();
  }

  function closeComposer() {
    composing = false;
    draft = "";
    draftPage = "";
  }

  /** Accepts `/clients/x`, `clients/x` or a full app URL; keeps path + query. */
  function pagePath(raw: string): string {
    const v = raw.trim();
    if (!v) return "";
    try {
      const u = new URL(v, location.origin);
      return u.origin === location.origin ? u.pathname + u.search : v;
    } catch {
      return v.startsWith("/") ? v : `/${v}`;
    }
  }

  async function fileTicket(e?: SubmitEvent) {
    e?.preventDefault();
    const comment = draft.trim();
    if (!comment || filing) return;
    filing = true;
    try {
      const context = unpinnedContext(pagePath(draftPage), {
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
        userAgent: navigator.userAgent,
        appVersion: __APP_VERSION__,
      });
      const { id } = await feedbackApi.submit({ comment, context });
      const item = await feedbackApi.get(id);
      items = [item, ...items];
      notes[item.id] = "";
      closeComposer();
      filter = isAdmin ? "new" : "all";
      error = null;
      const handle = feedbackHandle(item.number);
      await tick();
      document.getElementById(handle)?.scrollIntoView({ block: "nearest" });
      flashed = handle;
      setTimeout(() => (flashed = null), 2400);
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not file the ticket";
    } finally {
      filing = false;
    }
  }

  /** Show a capture at its CSS size: captures are taken at min(dpr, 2)x. */
  function fitShot(img: HTMLImageElement, dpr: number) {
    img.style.width = `${img.naturalWidth / Math.min(Math.max(dpr, 1), 2)}px`;
  }

  async function copyForAgent() {
    try {
      await navigator.clipboard.writeText(await feedbackApi.exportMarkdown("accepted"));
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not copy export";
    }
  }
</script>

<svelte:head><title>Feedback · Program Tracker</title></svelte:head>

<div class="page">
  <PageHead
    title="Feedback"
    sub={isAdmin
      ? "Comments pinned to the app in feedback mode. Accept what should be built — accepted items are what the coding agent reads."
      : "What you've pinned to the app in feedback mode, and where each item stands."}
  >
    {#snippet actions()}
      <Button onclick={openComposer} disabled={composing} aria-controls="new-ticket">New ticket</Button>
      {#if isAdmin}
        <Button href={exportUrl("accepted")} target="_blank" rel="noreferrer">Open export</Button>
        <Button variant="primary" onclick={copyForAgent} disabled={counts.accepted === 0}>
          {copied ? "Copied" : `Copy ${counts.accepted} for agent`}
        </Button>
      {/if}
    {/snippet}
  </PageHead>

  {#if error}
    <Note tone="bad" role="alert">{error}</Note>
  {/if}

  {#if composing}
    <form id="new-ticket" class="composer" onsubmit={fileTicket} aria-label="New ticket">
      <label class="field">
        <span>What should change?</span>
        <textarea
          rows="3"
          maxlength="5000"
          bind:this={draftField}
          bind:value={draft}
          placeholder="e.g. Let me duplicate last week's program for a client"
          onkeydown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) fileTicket();
            if (e.key === "Escape") closeComposer();
          }}
        ></textarea>
      </label>
      <label class="field page-field">
        <span>Page <span class="muted">— optional</span></span>
        <input type="text" bind:value={draftPage} placeholder="/clients" autocomplete="off" spellcheck="false" />
      </label>
      <p class="hint muted">
        Not about one thing on screen. To point at an element, turn on <strong>Feedback</strong> (bottom right) and click it.
      </p>
      <div class="actions">
        <Button type="submit" variant="primary" small disabled={!draft.trim() || filing}>
          {filing ? "Filing…" : "File ticket"}
        </Button>
        <Button type="button" small variant="ghost" onclick={closeComposer}>Cancel</Button>
      </div>
    </form>
  {/if}

  <Tabs items={tabs} value={filter} onchange={(id) => (filter = id as Filter)} label="Feedback status" idPrefix="fb" />

  <div role="tabpanel" id="panel-{filter}" aria-labelledby="fb-{filter}">
    {#if !loaded}
      <div class="list"><Skeleton h="120px" /><Skeleton h="120px" /></div>
    {:else if visible.length === 0}
      <EmptyState>
        {#if items.length === 0}
          No feedback yet. Use <strong>New ticket</strong>, or turn on <strong>Feedback</strong> (bottom right) and click anything in the app.
        {:else}
          Nothing {filter === "all" ? "here" : STATUS_LABEL[filter as FeedbackStatus].toLowerCase()}.
        {/if}
      </EmptyState>
    {:else}
      <ol class="list">
        {#each visible as item (item.id)}
          {@const c = item.context}
          <li
            class="item"
            class:fresh={fresh.has(item.id)}
            class:flash={flashed === feedbackHandle(item.number)}
            id={feedbackHandle(item.number)}
            aria-busy={busy[item.id] ?? false}
            use:seenWhenVisible={item}
          >
            <div class="body">
              <div class="meta">
                <span class="handle">{feedbackHandle(item.number)}</span>
                <Pill tone={STATUS_TONE[item.status]}>
                  {STATUS_LABEL[item.status]}{#if item.status === "done" && item.shippedIn}&nbsp;· v{item.shippedIn}{/if}
                </Pill>
                {#if fresh.has(item.id)}<span class="news">New activity</span>{/if}
                <span class="by"><Author author={item.author} /></span>
                <Tooltip text={fmtDateTime(item.createdAt)}>
                  {#snippet children(tipId)}
                    <button type="button" class="when" aria-describedby={tipId}><time datetime={item.createdAt}>{fmtDate(item.createdAt)}</time></button>
                  {/snippet}
                </Tooltip>
                <MuteToggle {item} onchange={(muted) => (items = items.map((i) => (i.id === item.id ? { ...i, muted } : i)))} />
              </div>

              <blockquote>{item.comment}</blockquote>

              <dl>
                {#if !isPinned(c)}
                  <dt>Page</dt>
                  <dd>
                    {#if c.route.path}<a href={c.route.path}>{c.route.path}</a>{:else}<span class="muted">General</span>{/if}
                    <span class="muted">&nbsp;· filed here, not pinned to an element</span>
                  </dd>
                {:else}
                <dt>Page</dt>
                <dd>
                  <a href={c.route.path}>{c.route.path}</a>{#if c.target.headings.length}<span class="muted">&nbsp;· {c.target.headings.join(" › ")}</span>{/if}
                  {#if !c.route.path.startsWith("/feedback")}
                    <a class="show-me" href={showMeHref(item)}>Show me</a>
                  {/if}
                </dd>
                <dt>Source</dt>
                <dd>
                  {#if item.source}
                    <code title={item.source}>{shortPath(item.source)}</code>
                    {#if c.target.chain.length}
                      <span class="muted">&nbsp;in {c.target.chain.slice(0, 2).map((e) => `${shortPath(e.file)}:${e.line}`).join(" ← ")}</span>
                    {/if}
                  {:else}
                    <code>{c.target.selector}</code>
                  {/if}
                </dd>
                {/if}
                <dt>Device</dt>
                <dd>{c.viewport.width}×{c.viewport.height} @{c.viewport.dpr}x · build <code>{c.appVersion}</code></dd>
              </dl>

              {#if item.hasElementShot}
                <figure class="shot">
                  <img
                    src={shotUrl(item.id, "element")}
                    alt="Screenshot of the element {feedbackHandle(item.number)} is about"
                    loading="lazy"
                    onload={(e) => fitShot(e.currentTarget as HTMLImageElement, c.viewport.dpr)}
                  />
                  {#if item.hasPageShot}
                    <figcaption>
                      <a href={shotUrl(item.id, "page")} target="_blank" rel="noreferrer">Open full-page screenshot</a>
                    </figcaption>
                  {/if}
                </figure>
              {/if}

              <Thread {item} />

              {#if isAdmin}
                <label class="triage">
                  <span>Triage note <span class="muted">— your call, read by the agent</span></span>
                  <textarea
                    rows="2"
                    bind:value={notes[item.id]}
                    onblur={() => saveNote(item)}
                    placeholder="e.g. Yes — show warm-up sets as muted chips"
                  ></textarea>
                </label>
              {:else if item.triageNote}
                <div class="team-note">
                  <span class="label">Note from the team</span>
                  <p>{item.triageNote}</p>
                </div>
              {/if}

              {#if isAdmin}
              <div class="actions">
                {#if item.status === "new"}
                  <Button small variant="primary" onclick={() => triage(item, { status: "accepted" })}>Accept</Button>
                  <Button small onclick={() => triage(item, { status: "wontfix" })}>Won't fix</Button>
                {:else if item.status === "accepted"}
                  <Button
                    small
                    title="Mark it done once the change is live — stamps the running version"
                    onclick={() => triage(item, { status: "done" })}>Mark done</Button
                  >
                  <Button small variant="ghost" onclick={() => triage(item, { status: "new" })}>Back to new</Button>
                {:else}
                  <Button small variant="ghost" onclick={() => triage(item, { status: "new" })}>Reopen</Button>
                {/if}
                <span class="spacer"></span>
                <ConfirmButton small variant="ghost" class="danger" onconfirm={() => remove(item)} />
              </div>
              {/if}
            </div>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

<style>
  .page {
    max-width: var(--page-max);
    padding: 24px 32px 96px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .item {
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 16px;
    background: var(--surface);
  }
  .item[aria-busy="true"] {
    opacity: 0.6;
  }
  .item {
    scroll-margin-top: 16px;
    transition: box-shadow 0.4s ease;
  }
  .item.fresh {
    border-left: 3px solid var(--blue);
    padding-left: 14px;
  }
  .item.flash {
    box-shadow: 0 0 0 3px var(--focus);
  }
  .news {
    font: 600 12px/1 var(--font-ui);
    color: var(--blue);
  }
  .shot {
    margin: 0;
    align-self: flex-start;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .shot img {
    display: block;
    max-width: 100%;
    max-height: 280px;
    object-fit: contain;
    object-position: left top;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: 0 0 0 4px var(--well);
  }
  figcaption {
    font-size: 12px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 8px;
  }
  .by {
    display: inline-flex;
    min-width: 0;
    max-width: 16rem;
  }
  button.when {
    appearance: none;
    background: none;
    border: 0;
    padding: 0;
    border-radius: 4px;
    cursor: default;
  }
  .when:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 2px;
  }
  .team-note {
    max-width: var(--measure-prose);
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--well);
    font-size: 13px;
    line-height: 1.5;
  }
  .team-note .label {
    display: block;
    font: 500 12px/1.2 var(--font-ui);
    color: var(--muted);
    margin-bottom: 2px;
  }
  .team-note p {
    margin: 0;
    white-space: pre-wrap;
  }
  .handle {
    font: 600 13px/1 var(--font-mono);
  }
  .when {
    font-size: 12px;
    color: var(--muted);
  }
  blockquote {
    margin: 0;
    padding: 2px 0 2px 12px;
    border-left: 3px solid var(--line-strong);
    font-size: 15px;
    line-height: 1.5;
    white-space: pre-wrap;
    max-width: var(--measure-prose);
  }
  dl {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 4px 12px;
    margin: 0;
    font-size: 12px;
  }
  dt {
    color: var(--muted);
  }
  dd {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  code {
    font: 12px/1.4 var(--font-mono);
    background: var(--chip-bg);
    border-radius: 4px;
    padding: 1px 5px;
  }
  .muted {
    color: var(--muted);
  }
  .show-me {
    margin-left: 8px;
    font-weight: 600;
    white-space: nowrap;
  }
  .triage {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font: 500 12px/1.2 var(--font-ui);
    max-width: var(--measure-form);
  }
  .triage .muted {
    font-weight: 400;
  }
  .triage textarea {
    font: 400 13px/1.5 var(--font-ui);
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    resize: vertical;
    color: var(--ink);
    background: var(--bg);
  }
  .triage textarea:focus {
    outline: none;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus);
  }
  .composer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font: 500 12px/1.2 var(--font-ui);
    max-width: var(--measure-form);
  }
  .field .muted {
    font-weight: 400;
  }
  .page-field {
    max-width: 22rem;
  }
  .field textarea,
  .field input {
    font: 400 14px/1.5 var(--font-ui);
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--ink);
    background: var(--bg);
  }
  .field textarea {
    resize: vertical;
  }
  .field input {
    font-family: var(--font-mono);
    font-size: 13px;
  }
  .field textarea:focus,
  .field input:focus {
    outline: none;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus);
  }
  .hint {
    margin: 0;
    font-size: 12px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .spacer {
    flex: 1;
  }
  @media (max-width: 760px) {
    .page {
      padding: 16px 16px 96px;
    }
  }
</style>
