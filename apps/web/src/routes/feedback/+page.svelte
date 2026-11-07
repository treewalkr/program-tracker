<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { feedbackHandle, type FeedbackItem, type FeedbackStatus } from "@pt/shared";
  import { feedbackApi, exportUrl, shotUrl } from "$lib/feedback/client";
  import { shortPath } from "$lib/feedback/capture";
  import { fmtDate, fmtDateTime } from "$lib/format";
  import Author from "$lib/feedback/Author.svelte";
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

  const STATUS_LABEL: Record<FeedbackStatus, string> = {
    new: "New",
    accepted: "Accepted",
    done: "Done",
    wontfix: "Won't fix",
  };
  const STATUS_TONE: Record<FeedbackStatus, "good" | "warn" | "bad" | "neutral"> = {
    new: "warn",
    accepted: "good",
    done: "neutral",
    wontfix: "neutral",
  };

  let items = $state<FeedbackItem[]>([]);
  let loaded = $state(false);
  let error = $state<string | null>(null);
  let filter = $state<Filter>("new");
  let copied = $state(false);
  /** Triage-note drafts keyed by item id; saved on blur. */
  let notes = $state<Record<string, string>>({});
  let busy = $state<Record<string, boolean>>({});

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
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not load feedback";
    } finally {
      loaded = true;
    }
  }

  onMount(load);

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

  <Tabs items={tabs} value={filter} onchange={(id) => (filter = id as Filter)} label="Feedback status" idPrefix="fb" />

  <div role="tabpanel" id="panel-{filter}" aria-labelledby="fb-{filter}">
    {#if !loaded}
      <div class="list"><Skeleton h="120px" /><Skeleton h="120px" /></div>
    {:else if visible.length === 0}
      <EmptyState>
        {#if items.length === 0}
          No feedback yet. Turn on <strong>Feedback</strong> (bottom right) and click anything in the app.
        {:else}
          Nothing {filter === "all" ? "here" : STATUS_LABEL[filter as FeedbackStatus].toLowerCase()}.
        {/if}
      </EmptyState>
    {:else}
      <ol class="list">
        {#each visible as item (item.id)}
          {@const c = item.context}
          <li class="item" aria-busy={busy[item.id] ?? false}>
            <div class="body">
              <div class="meta">
                <span class="handle">{feedbackHandle(item.number)}</span>
                <Pill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Pill>
                <span class="by"><Author author={item.author} /></span>
                <Tooltip text={fmtDateTime(item.createdAt)}>
                  {#snippet children(tipId)}
                    <time class="when" datetime={item.createdAt} tabindex="0" aria-describedby={tipId}>{fmtDate(item.createdAt)}</time>
                  {/snippet}
                </Tooltip>
              </div>

              <blockquote>{item.comment}</blockquote>

              <dl>
                <dt>Page</dt>
                <dd><a href={c.route.path}>{c.route.path}</a>{#if c.target.headings.length}<span class="muted">&nbsp;· {c.target.headings.join(" › ")}</span>{/if}</dd>
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
                  <Button small onclick={() => triage(item, { status: "done" })}>Mark done</Button>
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
  .when {
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
