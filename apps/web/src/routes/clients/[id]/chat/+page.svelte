<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { SlotChange } from "@pt/shared";
  import type { ChatMessageDto, ClientDto, ExerciseDto, GenerationDto, ProviderDto } from "$lib/api/types";
  import {
    applyChatTurn,
    draftPreviewModel,
    findBuildingChild,
    fmtElapsed,
    renderMarkdown,
    stripDraftNotice,
    submitBuild,
    submitChatTurn,
    versionStamps,
    versionView,
    type VersionStamp as Stamp,
  } from "$lib/chatRefine";
  import DraftPreview from "$lib/components/DraftPreview.svelte";
  import ChatProposal from "$lib/components/ChatProposal.svelte";
  import { draftSessionTags } from "$lib/draftReview";
  import VersionStamp from "$lib/components/VersionStamp.svelte";
  import ModelSettings from "$lib/components/ModelSettings.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let allGens = $state<GenerationDto[]>([]);
  let messages = $state<ChatMessageDto[]>([]);
  let loading = $state(true);
  let catalogById = $state(new Map<string, ExerciseDto>());

  let providers = $state<ProviderDto[]>([]);
  let providerId = $state("");
  let model = $state("");
  let effort = $state("");
  /** Pickers follow the target draft's provider once one exists. */
  let pickersFollowTarget = false;

  let draft = $state("");
  let sending = $state(false);
  let sendError = $state<string | null>(null);
  let building = $state<{ messageId: string; parentGenerationId: string; startedAt: number; childId: string | null } | null>(null);
  let now = $state(Date.now());
  /** Version shown in the draft pane; null = latest. */
  let view = $state<number | null>(null);
  let stripOpen = $state(false);

  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let scrollEl = $state<HTMLDivElement | null>(null);
  let paneEl = $state<HTMLDivElement | null>(null);
  let benchEl = $state<HTMLElement | null>(null);
  /** Desktop: the bench fills the viewport below its own top edge (banners vary). */
  let benchHeight = $state<number | null>(null);

  const preview = $derived(draftPreviewModel(allGens, building !== null, catalogById));
  const latest = $derived(preview.version);
  const shown = $derived(view !== null && view <= latest ? view : latest);
  const vview = $derived(preview.target ? versionView(allGens, preview.target.id, shown, catalogById) : null);
  const stamps = $derived(versionStamps(messages, allGens));
  /** Track labels for the draft a proposal targets (`change.day` = draft position). */
  const tagsFor = (genId: string | null | undefined) =>
    draftSessionTags(allGens.find((g) => g.id === genId)?.draft?.sessions ?? []);
  const shownUnproposed = $derived.by(() => {
    if (!vview) return [];
    for (const s of stamps.values()) if (s.generationId === vview.generation.id) return s.unproposed ?? [];
    return [];
  });
  const openProposalId = $derived.by(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.kind === "proposal" && m.proposal) {
        return !m.proposal.builtGenerationId && m.proposal.parentGenerationId === preview.target?.id ? m.id : null;
      }
    }
    return null;
  });
  const elapsed = $derived(building ? fmtElapsed(now - building.startedAt) : null);
  const busy = $derived(sending || building !== null);
  const firstName = $derived(client?.name.split(" ")[0] ?? "this client");
  const programName = $derived(preview.target?.draft?.name ?? null);
  const sub = $derived(
    [
      programName ?? "No draft yet",
      client?.sessionsPerWeek ? `${client.sessionsPerWeek} sessions/week` : null,
      client?.goals ? `goal ${client.goals}` : null,
    ]
      .filter(Boolean)
      .join(" · ")
  );

  // Pickers follow the target draft once; a draft on the provider's default
  // model maps to "" so the select shows "(provider default)" instead of blank.
  $effect(() => {
    const target = preview.target;
    if (!pickersFollowTarget && target && providers.length) {
      pickersFollowTarget = true;
      providerId = target.providerId;
      const def = providers.find((p) => p.id === target.providerId)?.model;
      model = target.model === def ? "" : target.model;
      effort = target.effort ?? "";
    }
  });

  // Elapsed-time tick while a version builds.
  $effect(() => {
    if (!building) return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });

  // Keep the newest message in view.
  $effect(() => {
    void messages.length;
    void sending;
    tick().then(() => {
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
      if (window.matchMedia("(max-width: 980px)").matches) window.scrollTo(0, document.body.scrollHeight);
    });
  });

  $effect(() => {
    if (!benchEl) return;
    const el = benchEl;
    const fit = () => {
      benchHeight = window.matchMedia("(max-width: 980px)").matches
        ? null
        : Math.max(420, window.innerHeight - el.getBoundingClientRect().top - window.scrollY - 24);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  });

  onMount(async () => {
    try {
      const [detail, gens, msgs, exList, providerList] = await Promise.all([
        api.client(id),
        api.generations(id),
        api.chatMessages(id),
        api.exercises(),
        api.providers(),
      ]);
      client = detail.client;
      allGens = gens;
      messages = msgs;
      catalogById = new Map(exList.map((e) => [e.id, e]));
      providers = providerList;
      if (!providerId && providers.length) providerId = providers[0].id;
    } finally {
      loading = false;
    }
  });

  async function clear() {
    await api.clearChat(id);
    messages = await api.chatMessages(id);
  }

  /** Send: question → answer; change request on a draft → proposal. Never rebuilds. */
  async function send() {
    const text = draft.trim();
    if (!text || busy || !providerId) return;
    sendError = null;
    const optimistic: ChatMessageDto = {
      id: `pending-${Date.now()}`,
      role: "trainer",
      kind: "revision",
      content: text,
      generationId: null,
      createdAt: new Date().toISOString(),
    };
    messages = [...messages, optimistic];
    draft = "";
    sending = true;
    try {
      const res = await submitChatTurn(api, {
        clientId: id,
        target: preview.target,
        message: text,
        providerId: providerId || undefined,
        model: model || undefined,
        effort: effort || undefined,
      });
      ({ messages, gens: allGens } = applyChatTurn(
        { messages: messages.filter((m) => m.id !== optimistic.id), gens: allGens },
        res
      ));
    } catch (err) {
      messages = messages.filter((m) => m.id !== optimistic.id);
      draft = text;
      sendError = (err as Error).message || "Send failed";
    } finally {
      sending = false;
    }
  }

  /** Build a proposal into the next version; polls so Cancel can find the pending child. */
  async function build(m: ChatMessageDto) {
    if (!m.proposal || busy) return;
    sendError = null;
    const parentGenerationId = m.proposal.parentGenerationId;
    building = { messageId: m.id, parentGenerationId, startedAt: Date.now(), childId: null };
    const poll = setInterval(async () => {
      try {
        const gens = await api.generations(id);
        const child = findBuildingChild(gens, parentGenerationId);
        if (child && building) building.childId = child.id;
      } catch {
        // polling is best-effort; the build request reports real failures
      }
    }, 3000);
    try {
      const res = await submitBuild(api, {
        messageId: m.id,
        providerId: providerId || undefined,
        model: model || undefined,
        effort: effort || undefined,
      });
      ({ messages, gens: allGens } = applyChatTurn({ messages, gens: allGens }, res));
      messages = await api.chatMessages(id);
      allGens = await api.generations(id);
      view = null;
    } catch (err) {
      sendError = (err as Error).message || "Build failed";
    } finally {
      clearInterval(poll);
      building = null;
    }
  }

  async function cancel() {
    if (!building) return;
    if (!building.childId) {
      sendError = "Still starting — try Cancel again in a few seconds.";
      return;
    }
    try {
      await api.cancelGeneration(building.childId);
    } catch (err) {
      // The build may have finished in the meantime; only report while still building.
      if (building) sendError = (err as Error).message;
    }
  }

  /** Adjust: put the request that produced this proposal back in the composer. */
  function adjust(m: ChatMessageDto) {
    const i = messages.findIndex((x) => x.id === m.id);
    for (let j = i - 1; j >= 0; j--) {
      if (messages[j].role === "trainer") {
        draft = messages[j].content;
        break;
      }
    }
    textareaEl?.focus();
  }

  function proposalStatus(m: ChatMessageDto): "open" | "building" | "built" | "superseded" {
    if (m.proposal?.builtGenerationId) return "built";
    if (building?.messageId === m.id) return "building";
    return m.id === openProposalId ? "open" : "superseded";
  }

  /** Change row clicked: show that version and point at the row. */
  async function pick(c: SlotChange, s: Stamp) {
    view = s.version;
    stripOpen = true;
    await tick();
    const day = paneEl?.querySelector<HTMLElement>(`.session-slot[data-day="${c.day}"]`);
    const row = c.afterSlot != null ? day?.querySelector<HTMLElement>(`.exrow[data-slot="${c.afterSlot}"]`) : null;
    const el = row ?? day;
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    if (row) {
      row.classList.add("flash");
      setTimeout(() => row.classList.remove("flash"), 1600);
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function autogrow() {
    if (!textareaEl) return;
    textareaEl.style.height = "auto";
    textareaEl.style.height = `${Math.min(textareaEl.scrollHeight, 160)}px`;
  }

  const starters = $derived([
    `How has ${firstName}'s back squat e1RM moved over the last 4 weeks?`,
    `Which sessions did ${firstName} miss this block?`,
    `Draft a 6-week block for ${firstName}${client?.sessionsPerWeek ? `, ${client.sessionsPerWeek} sessions a week` : ""}`,
  ]);
</script>

{#snippet composer()}
  <div class="dock">
    <div class="dock-box">
      <textarea
        bind:this={textareaEl}
        bind:value={draft}
        oninput={autogrow}
        onkeydown={onKeydown}
        rows="2"
        maxlength="2000"
        aria-label="Message to AI"
        placeholder={preview.target
          ? "Ask about the numbers, or describe a change to the draft"
          : `Ask about ${firstName}'s training`}
      ></textarea>
      <div class="dock-row">
        <ModelSettings {providers} bind:providerId bind:model bind:effort />
        <span class="kbd">⏎ send · ⇧⏎ new line</span>
        <button type="button" class="btn small send" disabled={!draft.trim() || busy || !providerId} onclick={send}>
          Send
        </button>
      </div>
    </div>
    {#if sendError}
      <div class="send-error"><Note tone="bad">{sendError}</Note></div>
    {/if}
    {#if preview.target && !openProposalId}
      <p class="dock-hint">Change requests come back as a proposal. Nothing is rebuilt until you press Build.</p>
    {/if}
  </div>
{/snippet}

{#snippet thread()}
  <div class="thread" role="log" aria-live="polite" aria-label="Conversation with AI">
    {#each messages as m (m.id)}
      {#if m.role === "trainer"}
        <div class="you">{m.content}</div>
      {:else}
        <div class="ai">
          <div class="who"><Icon name="sparkle" />AI</div>
          {#if m.kind === "error"}
            <Note tone="bad">{m.content}</Note>
          {:else if m.kind === "proposal" && m.proposal}
            <div class="md">{@html renderMarkdown(m.content)}</div>
            <ChatProposal
              proposal={m.proposal}
              tags={tagsFor(m.proposal.parentGenerationId)}
              status={proposalStatus(m)}
              {elapsed}
              onbuild={() => build(m)}
              onadjust={() => adjust(m)}
            />
          {:else if m.kind === "draft"}
            {@const stamp = stamps.get(m.id)}
            {@const text = stripDraftNotice(m.content)}
            {#if text}<div class="md">{@html renderMarkdown(text)}</div>{/if}
            {#if stamp}
              <VersionStamp {stamp} onpick={(c) => pick(c, stamp)} />
            {/if}
          {:else}
            <div class="md">{@html renderMarkdown(m.content)}</div>
            {#if preview.target}<div class="answer-only">Answer only · draft unchanged</div>{/if}
          {/if}
        </div>
      {/if}
    {/each}
    {#if sending}
      <div class="ai" role="status">
        <div class="who"><Icon name="sparkle" />AI</div>
        <div class="working"><span class="spinner" aria-hidden="true"></span>Thinking…</div>
      </div>
    {/if}
  </div>
{/snippet}

{#if loading}
  <div class="mt-16"><Skeleton h="180px" w="100%" /></div>
{:else if !client}
  <EmptyState>Client not found.</EmptyState>
{:else}
  <PageHead
    title={`${firstName}'s next block`}
    crumbs={[
      { href: "/clients", label: "Clients" },
      { href: `/clients/${id}`, label: client.name },
      { label: "Draft chat" },
    ]}
    {sub}
  >
    {#snippet actions()}
      <ConfirmButton
        label="Clear chat"
        confirmLabel="Really clear?"
        variant="ghost"
        small
        disabled={messages.length === 0 || busy}
        onconfirm={clear}
      />
    {/snippet}
  </PageHead>

  {#if !preview.target && messages.length === 0}
    <section class="panel solo">
      <div class="chat-empty">
        <h2>Ask about {firstName}'s training, or have AI draft the next block</h2>
        <p>Answers cite logged sessions. A draft only becomes a program after you review and approve it.</p>
        <div class="starters">
          {#each starters as s (s)}
            <button type="button" class="starter" onclick={() => { draft = s; textareaEl?.focus(); }}>{s}</button>
          {/each}
        </div>
      </div>
      {@render composer()}
    </section>
  {:else if !preview.target || !vview}
    <section class="panel solo chat" bind:this={benchEl} style:height={benchHeight ? `${benchHeight}px` : null}>
      <div class="scroll" bind:this={scrollEl}>{@render thread()}</div>
      {@render composer()}
    </section>
  {:else}
    <div class="bench" bind:this={benchEl} style:height={benchHeight ? `${benchHeight}px` : null}>
      <section class="panel col chat" aria-label="Conversation">
        <div class="panel-head"><h2>Conversation</h2></div>
        <div class="scroll" bind:this={scrollEl}>{@render thread()}</div>
        {@render composer()}
      </section>
      <div class="col draft" bind:this={paneEl}>
        <DraftPreview
          view={vview}
          {latest}
          unproposed={shownUnproposed}
          building={building ? { next: latest + 1, elapsed: elapsed ?? "0:00" } : null}
          reviewHref={`/clients/${id}/generate`}
          onview={(v) => (view = v)}
          oncancel={cancel}
          bind:open={stripOpen}
        />
      </div>
    </div>
  {/if}
{/if}

<style>
  .mt-16 {
    margin-top: 16px;
  }
  .bench {
    min-height: 420px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(380px, 0.95fr);
    gap: 16px;
  }
  .col {
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .solo {
    max-width: 800px;
    display: flex;
    flex-direction: column;
  }
  .solo.chat {
    min-height: 420px;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .thread {
    padding: 20px 20px 12px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .you {
    align-self: flex-end;
    max-width: 78%;
    background: var(--well);
    border: 1px solid var(--line-soft);
    border-radius: 6px;
    padding: 8px 12px;
    font-size: 14px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .ai {
    font-size: 14px;
    line-height: 1.6;
    max-width: 68ch;
  }
  .md :global(p) {
    margin: 0 0 8px;
  }
  .md :global(p:last-child) {
    margin-bottom: 0;
  }
  .md :global(ul) {
    margin: 0 0 8px;
    padding-left: 18px;
  }
  .who {
    display: flex;
    gap: 6px;
    align-items: center;
    font: 600 12px/1 var(--font-ui);
    color: var(--muted);
    margin-bottom: 6px;
  }
  .who :global(svg) {
    width: 13px;
    height: 13px;
  }
  .answer-only {
    margin-top: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .working {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--muted);
    font-size: 13px;
  }
  .spinner {
    width: 13px;
    height: 13px;
    border-radius: 99px;
    border: 2px solid #b6e3ff;
    border-top-color: var(--blue);
    animation: spin 0.9s linear infinite;
    flex: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .dock {
    flex: none;
    padding: 12px 16px 14px;
    border-top: 1px solid var(--line);
  }
  .dock-box {
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
  }
  .dock-box:focus-within {
    border-color: var(--blue);
    box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
  }
  .dock textarea {
    display: block;
    width: 100%;
    border: 0;
    resize: none;
    min-height: 48px;
    max-height: 160px;
    padding: 10px 12px 2px;
    font: 14px/1.5 var(--font-ui);
    color: var(--ink);
    background: transparent;
    outline: none;
    caret-color: var(--blue);
  }
  .dock textarea::placeholder {
    color: var(--muted);
  }
  .dock-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 8px;
  }
  .kbd {
    font: 500 11px/1 var(--font-mono);
    color: var(--muted);
    margin-left: auto;
  }
  .dock-hint {
    margin: 8px 2px 0;
    font-size: 12px;
    color: var(--muted);
  }
  .send-error {
    margin-top: 8px;
  }

  .chat-empty {
    padding: 36px 28px 20px;
    max-width: 560px;
  }
  .chat-empty h2 {
    font-size: 16px;
    margin-bottom: 6px;
  }
  .chat-empty p {
    color: var(--muted);
    margin: 0 0 16px;
  }
  .starters {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .starter {
    font: 400 13px/1.35 var(--font-ui);
    text-align: left;
    padding: 7px 12px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
    cursor: pointer;
  }
  .starter:hover {
    background: var(--well);
    border-color: var(--line-strong);
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 3s;
    }
  }

  @media (max-width: 980px) {
    .bench {
      height: auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .col.draft {
      order: -1;
      position: sticky;
      top: 0;
      z-index: 4;
    }
    .col.chat,
    .solo.chat {
      border: 0;
      height: auto;
      min-height: 0;
    }
    .col.chat .panel-head {
      display: none;
    }
    .scroll {
      overflow: visible;
    }
    .thread {
      padding: 8px 0 12px;
    }
    .dock {
      position: sticky;
      bottom: 0;
      z-index: 5;
      background: var(--surface);
      padding: 10px 0 12px;
    }
    .you {
      max-width: 90%;
    }
    .kbd {
      display: none;
    }
    .send {
      margin-left: auto;
      min-height: 32px;
    }
  }
</style>
