<script lang="ts">
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { page } from "$app/state";
  import { feedbackHandle, isPinned, unpinnedContext, type FeedbackItem, type FeedbackStatus } from "@pt/shared";
  import {
    attachmentImages,
    attachmentUrl,
    feedbackApi,
    exportUrl,
    ticketImageCaption,
    ticketShots,
    type TriagePatch,
  } from "$lib/feedback/client";
  import AttachmentInput from "$lib/feedback/AttachmentInput.svelte";
  import AttachmentStrip from "$lib/feedback/AttachmentStrip.svelte";
  import { ImageTray } from "$lib/feedback/tray.svelte";
  import { shortPath } from "$lib/feedback/capture";
  import { fmtDate, fmtDateTime } from "$lib/format";
  import Author from "$lib/feedback/Author.svelte";
  import Thread from "$lib/feedback/Thread.svelte";
  import TicketEditor from "$lib/feedback/TicketEditor.svelte";
  import { ago } from "$lib/draftReview";
  import { feedbackUnread } from "$lib/feedback/unread.svelte";
  import { ticketDetails } from "$lib/feedback/details.svelte";
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
  import Lightbox, { type LightboxImage } from "$lib/ui/Lightbox.svelte";

  type Filter = FeedbackStatus | "all";

  /** The admin triages; everyone else sees their own items, read-only. */
  const isAdmin = $derived.by(() => {
    const session = page.data.session;
    return session?.kind === "open" || (session?.kind === "signedIn" && session.trainer.isAdmin);
  });

  /** The signed-in trainer; null with auth off (then everyone is the admin). */
  const viewerId = $derived(page.data.session?.kind === "signedIn" ? page.data.session.trainer.id : null);

  let items = $state<FeedbackItem[]>([]);
  let loaded = $state(false);
  let error = $state<string | null>(null);
  let filter = $state<Filter>("new");
  /** The accepted list was just copied for the agent. */
  let copied = $state(false);
  /** Triage-note drafts keyed by item id; saved on blur. */
  let notes = $state<Record<string, string>>({});
  type CardAction = FeedbackStatus | "delete";
  /** The action running on each card: its button spins, the card's other actions wait. */
  let pending = $state<Record<string, CardAction | null>>({});
  /** A failed triage or delete, shown beside that card's actions. */
  let cardError = $state<Record<string, string | null>>({});
  type NoteState = { kind: "saving" } | { kind: "saved" } | { kind: "error"; message: string };
  /** Triage-note save state under each textarea. */
  let noteState = $state<Record<string, NoteState | null>>({});
  const savedTimers: Record<string, ReturnType<typeof setTimeout>> = {};
  /** Items that had unread activity when the page opened; stay marked for this visit. */
  let fresh = $state(new Set<string>());
  /** Handle from `/feedback#FB-012`, flashed once scrolled into view. */
  let flashed = $state<string | null>(null);

  /** New-ticket composer: a ticket written here, not pinned to an element. */
  let composing = $state(false);
  let draft = $state("");
  let draftPage = $state("");
  let filing = $state(false);
  const draftImages = new ImageTray();
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

  /** "Show me" for a page the viewer can't open (another trainer's client): its screenshots instead. */
  let shots = $state<LightboxImage[]>([]);
  let shotsOpen = $state(false);
  let shotIndex = $state(0);
  function showShots(item: FeedbackItem) {
    shots = ticketShots(item);
    shotIndex = 0;
    shotsOpen = shots.length > 0;
  }

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

  /** The reporter and the admin may edit an open ticket's comment and images. */
  const canEdit = (item: FeedbackItem) =>
    (item.status === "new" || item.status === "accepted") &&
    (isAdmin || (viewerId !== null && item.author?.id === viewerId));

  /** The ticket open in the inline editor. */
  let editingId = $state<string | null>(null);

  async function closeEditor(item: FeedbackItem, next?: FeedbackItem) {
    if (next) replace(next);
    editingId = null;
    await tick();
    document.getElementById(`fb-edit-${item.id}`)?.focus();
  }

  /**
   * Per-item request counter. Blurring the note and clicking a status button
   * fire two PATCHes back to back; only the latest response may land, or a
   * stale one would roll the status back on screen.
   */
  const seq: Record<string, number> = {};

  /** Sends a patch; null when it landed (or a newer one superseded it), else the error to show. */
  async function triage(item: FeedbackItem, patch: TriagePatch): Promise<string | null> {
    const n = (seq[item.id] = (seq[item.id] ?? 0) + 1);
    try {
      const next = await feedbackApi.triage(item.id, patch);
      if (seq[item.id] === n) replace(next);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : "Could not update feedback";
    }
  }

  /** Moves a card's status; a failure shows beside its actions. True once it landed. */
  async function setStatus(item: FeedbackItem, patch: TriagePatch & { status: FeedbackStatus }): Promise<boolean> {
    if (pending[item.id]) return false;
    pending[item.id] = patch.status;
    cardError[item.id] = null;
    const failed = await triage(item, patch);
    pending[item.id] = null;
    cardError[item.id] = failed;
    return !failed;
  }

  async function saveNote(item: FeedbackItem) {
    const next = (notes[item.id] ?? "").trim();
    if (next === (item.triageNote ?? "")) return;
    clearTimeout(savedTimers[item.id]);
    noteState[item.id] = { kind: "saving" };
    const failed = await triage(item, { triageNote: next || null });
    if (failed) {
      noteState[item.id] = { kind: "error", message: failed };
      return;
    }
    noteState[item.id] = { kind: "saved" };
    savedTimers[item.id] = setTimeout(() => (noteState[item.id] = null), 2000);
  }

  async function remove(item: FeedbackItem) {
    if (pending[item.id]) return;
    pending[item.id] = "delete";
    cardError[item.id] = null;
    try {
      await feedbackApi.remove(item.id);
      items = items.filter((i) => i.id !== item.id);
    } catch (err) {
      cardError[item.id] = err instanceof Error ? err.message : "Could not delete feedback";
    } finally {
      pending[item.id] = null;
    }
  }

  /** The card whose Won't-fix row is open, and each card's reason draft. */
  let closing = $state<string | null>(null);
  let reasons = $state<Record<string, string>>({});

  async function openWontfix(item: FeedbackItem) {
    closing = item.id;
    await tick();
    document.getElementById(`fb-reason-${item.id}`)?.focus();
  }

  async function cancelWontfix(item: FeedbackItem) {
    closing = null;
    await tick();
    document.getElementById(`fb-wontfix-${item.id}`)?.focus();
  }

  /** The reason, when given, posts as a public reply and the Won't-fix email quotes it. */
  async function confirmWontfix(item: FeedbackItem) {
    const reason = (reasons[item.id] ?? "").trim();
    if (!(await setStatus(item, { status: "wontfix", ...(reason ? { reason } : {}) }))) return;
    closing = null;
    reasons[item.id] = "";
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
    draftImages.clear();
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
    if (!comment || filing || draftImages.busy) return;
    filing = true;
    try {
      const context = unpinnedContext(pagePath(draftPage), {
        viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
        userAgent: navigator.userAgent,
        appVersion: __APP_VERSION__,
      });
      const { id } = await feedbackApi.submit({ comment, context, uploads: draftImages.files });
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

{#snippet spinner()}<span class="spinner" aria-hidden="true"></span>{/snippet}

<!-- Another trainer's client or program page would 404: show the path, don't link it. -->
{#snippet pageLink(item: FeedbackItem)}
  {#if item.reachable}
    <a href={item.context.route.path}>{item.context.route.path}</a>
  {:else}
    <span title="Belongs to a client or program you don't have">{item.context.route.path}</span>
  {/if}
{/snippet}

<!-- The element close-up large (as before), every other image as a thumbnail; one viewer for all. -->
{#snippet ticketImages(item: FeedbackItem)}
  {@const images = attachmentImages(item.id, item.attachments, ticketImageCaption(item))}
  {@const el = item.attachments.findIndex((a) => a.kind === "element")}
  {#if images.length}
    {@const strip = { ref: undefined as AttachmentStrip | undefined }}
    {#if el >= 0}
      {@const path = item.context.route.path}
      <figure class="shot">
        <figcaption>
          <span class="shot-kind">Screenshot</span>
          <span>{images[el].caption}{#if path}&nbsp;· <span class="shot-route">{path}</span>{/if}</span>
        </figcaption>
        <button type="button" class="shot-open" onclick={() => strip.ref?.show(el)} aria-label="Enlarge {images[el].alt}">
          <img
            src={attachmentUrl(item.id, item.attachments[el].id)}
            alt="Screenshot of the element {feedbackHandle(item.number)} is pinned to{path ? ` on ${path}` : ''}"
            loading="lazy"
            onload={(e) => fitShot(e.currentTarget as HTMLImageElement, item.context.viewport.dpr)}
          />
        </button>
      </figure>
    {/if}
    <AttachmentStrip bind:this={strip.ref} {images} skip={el >= 0 ? [el] : []} label="Images on {feedbackHandle(item.number)}" />
  {/if}
{/snippet}

<Lightbox images={shots} bind:open={shotsOpen} bind:index={shotIndex} label="Ticket screenshots" />

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
    <form
      id="new-ticket"
      class="composer"
      class:dropping={draftImages.dragging}
      onsubmit={fileTicket}
      aria-label="New ticket"
      {@attach draftImages.zone}
    >
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
      <AttachmentInput tray={draftImages} disabled={filing} label="the new ticket" />
      <label class="field page-field">
        <span>Page <span class="muted">— optional</span></span>
        <input type="text" bind:value={draftPage} placeholder="/clients" autocomplete="off" spellcheck="false" />
      </label>
      <p class="hint muted">
        Not about one thing on screen. To point at an element, turn on <strong>Feedback</strong> (bottom right) and click it.
      </p>
      <div class="actions">
        <Button type="submit" variant="primary" small disabled={!draft.trim() || filing || draftImages.busy}>
          {filing ? "Filing…" : "File ticket"}
        </Button>
        <Button type="button" small variant="ghost" onclick={closeComposer}>Cancel</Button>
      </div>
    </form>
  {/if}

  <div class="tabbar">
    <Tabs items={tabs} value={filter} onchange={(id) => (filter = id as Filter)} label="Feedback status" idPrefix="fb" />
    <!-- One choice for every ticket: page, source and device under each comment. -->
    <button
      type="button"
      class="details-toggle"
      aria-pressed={ticketDetails.open}
      aria-controls={visible.map((i) => `fb-details-${i.id}`).join(" ") || undefined}
      onclick={ticketDetails.toggle}
    >
      Show details
    </button>
  </div>

  <div role="tabpanel" id="panel-{filter}" aria-labelledby="fb-{filter}">
    {#if !loaded}
      <ul class="list" aria-busy="true">
        <li class="sr-only" role="status">Loading feedback…</li>
        {#each { length: 3 }, i (i)}
          <li class="item" aria-hidden="true">
            <div class="body skel-item">
              <span class="skel-meta">
                <Skeleton shape="line" h="10px" w="44px" />
                <Skeleton shape="round" h="20px" w="64px" />
                <Skeleton shape="line" h="10px" w="96px" />
              </span>
              <Skeleton shape="line" h="12px" w={["72%", "58%", "66%"][i]} />
              <Skeleton shape="line" h="12px" w={["44%", "52%", "30%"][i]} />
            </div>
          </li>
        {/each}
      </ul>
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
            aria-busy={!!pending[item.id]}
            use:seenWhenVisible={item}
          >
            <div class="body">
              <div class="meta">
                {#if fresh.has(item.id)}<span class="lamp" aria-hidden="true"></span>{/if}
                <span class="handle">{feedbackHandle(item.number)}</span>
                <Pill tone={STATUS_TONE[item.status]}>
                  {STATUS_LABEL[item.status]}{#if item.status === "done" && item.shippedIn}&nbsp;· v{item.shippedIn}{/if}
                </Pill>
                {#if fresh.has(item.id)}<span class="news">New activity</span>{/if}
                <span class="by"><Author author={item.author} fallback="Filed before sign-in" /></span>
                <Tooltip text={fmtDateTime(item.createdAt)}>
                  {#snippet children(tipId)}
                    <button type="button" class="when" aria-describedby={tipId}><time datetime={item.createdAt}>{fmtDate(item.createdAt)}</time></button>
                  {/snippet}
                </Tooltip>
                {#if item.editedAt}
                  {@const by = item.editedBy && item.editedBy.id !== item.author?.id ? item.editedBy.name : null}
                  <Tooltip text="Edited {fmtDateTime(item.editedAt)}{item.editedBy ? ` by ${item.editedBy.name}` : ''}">
                    {#snippet children(tipId)}
                      <button type="button" class="when" aria-describedby={tipId}>
                        edited · <time datetime={item.editedAt}>{ago(item.editedAt!)}</time>{#if by}&nbsp;by {by}{/if}
                      </button>
                    {/snippet}
                  </Tooltip>
                {/if}
                <span class="spacer"></span>
                <MuteToggle {item} onchange={(muted) => (items = items.map((i) => (i.id === item.id ? { ...i, muted } : i)))} />
              </div>

              {#if editingId === item.id}
                <TicketEditor
                  {item}
                  {viewerId}
                  onsaved={(next) => closeEditor(item, next)}
                  onreload={replace}
                  oncancel={() => closeEditor(item)}
                />
              {:else}
                <h2 class="comment">{item.comment}</h2>
              {/if}

              <div class="ticket-bar">
                {#if canEdit(item) && editingId !== item.id}
                  <button
                    type="button"
                    id="fb-edit-{item.id}"
                    class="details-toggle"
                    aria-label="Edit {feedbackHandle(item.number)}"
                    onclick={() => (editingId = item.id)}>Edit</button
                  >
                {/if}
                {#if isPinned(c) && !c.route.path.startsWith("/feedback")}
                  <!-- filed on /feedback itself: nothing to jump to -->
                  {#if item.reachable}
                    <a class="show-me" href={showMeHref(item)}>Show me</a>
                  {:else if ticketShots(item).length}
                    <button
                      type="button"
                      class="show-me linkish"
                      title="This page belongs to a client you don't have — showing the screenshot instead"
                      onclick={() => showShots(item)}>Show me</button
                    >
                  {/if}
                {/if}
              </div>

              <dl id="fb-details-{item.id}" hidden={!ticketDetails.open}>
                <dt>Page</dt>
                <dd>
                  {#if c.route.path}{@render pageLink(item)}{:else}<span class="muted">General</span>{/if}
                  {#if !isPinned(c)}
                    <span class="muted">&nbsp;· filed here, not pinned to an element</span>
                  {:else if c.target.headings.length}
                    <span class="muted">&nbsp;· {c.target.headings.join(" › ")}</span>
                  {/if}
                </dd>
                {#if isPinned(c)}
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

              {#if editingId !== item.id}{@render ticketImages(item)}{/if}

              <Thread {item} onchange={replace} collapsible />
            </div>

            {#if isAdmin}
              {@const busy = !!pending[item.id]}
              {@const handle = feedbackHandle(item.number)}
              {@const note = noteState[item.id]}
              <div class="triage-box">
                <div class="triage">
                  <div class="note-head">
                    <label for="fb-note-{item.id}">Triage note <span class="muted">— private, read by the agent</span></label>
                    <p class="note-state" class:bad={note?.kind === "error"} aria-live="polite">
                    {#if note?.kind === "saving"}
                      Saving…
                    {:else if note?.kind === "saved"}
                      <span out:fade={{ duration: 300 }}>Saved</span>
                    {:else if note?.kind === "error"}
                      Not saved: {note.message}
                      <button type="button" class="linkish" onclick={() => saveNote(item)}>Retry</button>
                    {/if}
                    </p>
                  </div>
                  <textarea
                    id="fb-note-{item.id}"
                    rows="2"
                    bind:value={notes[item.id]}
                    onblur={() => saveNote(item)}
                    placeholder="e.g. Yes — show warm-up sets as muted chips"
                  ></textarea>
                </div>
                <div class="actions">
                {#if item.status === "new"}
                  <Button
                    small
                    disabled={busy}
                    aria-label="Accept {handle}"
                    icon={pending[item.id] === "accepted" ? spinner : undefined}
                    onclick={() => setStatus(item, { status: "accepted" })}>Accept</Button
                  >
                  <Button
                    small
                    id="fb-wontfix-{item.id}"
                    disabled={busy}
                    aria-label="Won't fix {handle}"
                    aria-expanded={closing === item.id}
                    aria-controls="fb-closing-{item.id}"
                    onclick={() => (closing === item.id ? cancelWontfix(item) : openWontfix(item))}>Won't fix</Button
                  >
                {:else if item.status === "accepted"}
                  <Button
                    small
                    disabled={busy}
                    aria-label="Mark done {handle}"
                    icon={pending[item.id] === "done" ? spinner : undefined}
                    title="Mark it done once the change is live — stamps the running version"
                    onclick={() => setStatus(item, { status: "done" })}>Mark done</Button
                  >
                  <Button
                    small
                    variant="ghost"
                    disabled={busy}
                    aria-label="Back to new {handle}"
                    icon={pending[item.id] === "new" ? spinner : undefined}
                    onclick={() => setStatus(item, { status: "new" })}>Back to new</Button
                  >
                {:else}
                  <Button
                    small
                    variant="ghost"
                    disabled={busy}
                    aria-label="Reopen {handle}"
                    icon={pending[item.id] === "new" ? spinner : undefined}
                    onclick={() => setStatus(item, { status: "new" })}>Reopen</Button
                  >
                {/if}
                <span class="spacer"></span>
                <ConfirmButton
                  small
                  variant="ghost"
                  class="danger"
                  disabled={busy}
                  label={pending[item.id] === "delete" ? "Deleting…" : "Delete"}
                  subject={handle}
                  onconfirm={() => remove(item)}
                />
                </div>
                {#if closing === item.id && item.status === "new"}
                  <div class="closing" id="fb-closing-{item.id}">
                    <div class="triage">
                      <label for="fb-reason-{item.id}">Reason for the reporter <span class="muted">(optional) — posts as a reply</span></label>
                      <textarea
                        id="fb-reason-{item.id}"
                        rows="2"
                        maxlength="5000"
                        bind:value={reasons[item.id]}
                        placeholder="e.g. Supersets log as one block on purpose, so totals match the program"
                        onkeydown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) confirmWontfix(item);
                          if (e.key === "Escape") cancelWontfix(item);
                        }}
                      ></textarea>
                    </div>
                    <div class="actions">
                      <Button
                        small
                        variant="primary"
                        disabled={busy}
                        aria-label="Won't fix {handle}, confirm"
                        icon={pending[item.id] === "wontfix" ? spinner : undefined}
                        onclick={() => confirmWontfix(item)}>Won't fix</Button
                      >
                      <Button small variant="ghost" onclick={() => cancelWontfix(item)}>Cancel</Button>
                    </div>
                  </div>
                {/if}
                {#if cardError[item.id]}
                  <p class="card-error" role="alert">{cardError[item.id]}</p>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</div>

<style>
  /* The shell pads the page; this column only caps the reading width. */
  .page {
    max-width: 960px;
    padding-bottom: 32px;
  }
  /* Focus rings: solid blue (the translucent --focus stays as the halo around inputs). */
  .page :global(:focus-visible) {
    outline-color: var(--blue);
  }
  /* Small buttons reach the 24px minimum target. */
  .page :global(.btn.small) {
    min-height: 24px;
  }
  .page > :global(.note) {
    margin-bottom: 16px;
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
    background: var(--surface);
    overflow: hidden;
  }
  .item {
    scroll-margin-top: 16px;
    transition: box-shadow 0.4s ease;
  }
  /* New activity: a lamp beside the handle plus the label — never an edge stripe. */
  .lamp {
    width: 8px;
    height: 8px;
    border-radius: 99px;
    background: var(--blue);
    flex: none;
  }
  .item.flash {
    box-shadow: 0 0 0 3px var(--focus);
  }
  .news {
    font: 600 12px/1 var(--font-ui);
    color: var(--blue);
  }
  /* The pinned element: a framed screenshot, capped so it never outweighs the comment. */
  .shot {
    margin: 0;
    align-self: flex-start;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 8px 8px;
    background: var(--well);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
  }
  figcaption {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 2px 8px;
    font-size: 12px;
    color: var(--muted);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .shot-kind {
    font: 600 12px/1.4 var(--font-ui);
    color: var(--ink);
  }
  .shot-route {
    font-family: var(--font-mono);
  }
  .shot img {
    display: block;
    max-width: 100%;
    max-height: 200px;
    object-fit: contain;
    object-position: left top;
    border: 1px solid var(--line-soft);
    border-radius: 4px;
    background: var(--surface);
  }
  .shot-open {
    display: block;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    cursor: zoom-in;
    max-width: 100%;
  }
  .shot-open:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
    padding: 14px 16px 16px;
  }
  .skel-item { gap: 10px; }
  .skel-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
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
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    background: none;
    border: 0;
    padding: 0;
    border-radius: 4px;
    cursor: default;
  }
  .when:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  .handle {
    font: 600 13px/1 var(--font-mono);
  }
  .when {
    font-size: 12px;
    color: var(--muted);
  }
  /* The comment is the ticket's headline — and its heading, so the list is navigable by heading. */
  .comment {
    margin: 0;
    letter-spacing: normal;
    font: 500 15px/1.5 var(--font-ui);
    color: var(--ink);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
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
  /* Under the comment: Edit, then Show me. */
  .ticket-bar:empty {
    display: none;
  }
  .ticket-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: -4px;
    font-size: 12px;
  }
  .details-toggle {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    padding: 2px 4px;
    margin-left: -4px;
    border: 0;
    border-radius: 4px;
    background: none;
    font: 500 12px/1.2 var(--font-ui);
    color: var(--muted);
    cursor: pointer;
  }
  .details-toggle:hover {
    color: var(--ink);
    background: var(--hover-soft);
  }
  .details-toggle:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  dl[hidden] {
    display: none;
  }
  .show-me {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    font-weight: 600;
    white-space: nowrap;
  }
  .linkish {
    padding: 0;
    border: 0;
    background: none;
    color: var(--blue);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
  .linkish:hover {
    text-decoration: underline;
  }
  /* Admin-only triage sits in the box footer, apart from what the reporter wrote. */
  .triage-box {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px;
    border-top: 1px solid var(--line-soft);
    background: var(--well);
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
  /* Label left, save state right: "Saving…" / "Saved" / the error never shifts the layout. */
  .note-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 2px 12px;
  }
  .note-state {
    margin: 0;
    font: 400 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .note-state.bad,
  .card-error {
    color: var(--bad);
  }
  .card-error {
    margin: 0;
    font-size: 12px;
  }
  /* The clicked button's spinner; the card's text keeps full contrast meanwhile. */
  .spinner {
    width: 12px;
    height: 12px;
    flex: none;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 99px;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
  /* Won't fix: the optional reason, inline under the actions. */
  .closing {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 10px;
    border-top: 1px solid var(--line-soft);
  }
  .composer.dropping {
    outline: 2px dashed var(--blue);
    outline-offset: -6px;
  }
  .composer {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 8px;
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
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .tabbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 12px;
    margin: 16px 0 18px;
    border-bottom: 1px solid var(--line);
  }
  .tabbar :global(.tabs) {
    flex: 1 1 auto;
    margin: 0 0 -1px;
    border-bottom: 0;
  }
  .tabbar .details-toggle {
    margin-left: auto;
  }
  .details-toggle[aria-pressed="true"] {
    color: var(--ink);
    background: var(--well-2);
  }
  .spacer {
    flex: 1;
  }
  @media (max-width: 520px) {
    dl {
      grid-template-columns: 1fr;
      gap: 0;
    }
    dd + dt {
      margin-top: 6px;
    }
    .body {
      padding: 12px;
    }
    .triage-box {
      padding: 12px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .item {
      transition: none;
    }
    .spinner {
      animation-duration: 2.4s;
    }
  }
</style>
