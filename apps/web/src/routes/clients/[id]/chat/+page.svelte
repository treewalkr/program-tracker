<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { SlotChange } from "@pt/shared";
  import type {
    ChatMessageDto,
    ClientDto,
    ExerciseDto,
    GenerationDto,
    LlmVerdictDto,
    CoachingRuleDto,
    NoteAnchorDto,
    ProviderDto,
  } from "$lib/api/types";
  import { textAnchor } from "$lib/notes";
  import NoteEditor from "$lib/components/NoteEditor.svelte";
  import LearnedRule from "$lib/components/LearnedRule.svelte";
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
  import Verdict from "$lib/components/Verdict.svelte";
  import { clearDraft, readDraft, writeDraft } from "$lib/localDraft";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let allGens = $state<GenerationDto[]>([]);
  let messages = $state<ChatMessageDto[]>([]);
  /** Latest 👍/👎 per rateable assistant reply (null = not rated yet). */
  let verdicts = $state<Record<string, LlmVerdictDto | null>>({});
  const rateable = (m: ChatMessageDto) => m.role === "assistant" && (m.kind === "chat" || m.kind === "proposal");

  $effect(() => {
    const missing = messages.filter((m) => rateable(m) && !(m.id in verdicts)).map((m) => m.id);
    if (missing.length === 0) return;
    for (const mid of missing) verdicts[mid] = null;
    api
      .llmVerdicts(missing)
      .then((found) => {
        for (const v of found) verdicts[v.subjectId] = v;
      })
      .catch(() => {});
  });
  /** Selected text in an assistant reply → the floating "Note on this" button. */
  let selection = $state<{ messageId: string; anchor: NoteAnchorDto; x: number; y: number } | null>(null);
  /** The open text note (one at a time). */
  let noteOn = $state<{ messageId: string; anchor: NoteAnchorDto } | null>(null);
  /** "Remember this for next time?" per built-draft message. */
  let remember = $state<Record<string, { busy: boolean; rule: CoachingRuleDto | null; error: string | null }>>({});

  function readSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      selection = null;
      return;
    }
    const range = sel.getRangeAt(0).cloneRange();
    // Anchor on where the selection starts; a drag or triple-click that runs past the reply is clipped to it.
    const node = range.startContainer;
    const host = (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-reply-id]");
    if (host && !host.contains(range.endContainer)) range.setEnd(host, host.childNodes.length);
    const m = host ? messages.find((x) => x.id === host.dataset.replyId) : null;
    const anchor = m ? textAnchor(m.content, range.toString()) : null;
    if (!m || !anchor) {
      selection = null;
      return;
    }
    const rect = range.getBoundingClientRect();
    selection = { messageId: m.id, anchor, x: Math.max(8, rect.left), y: rect.bottom + 6 };
  }

  function noteOnSelection() {
    if (!selection) return;
    noteOn = { messageId: selection.messageId, anchor: selection.anchor };
    selection = null;
    window.getSelection()?.removeAllRanges();
  }

  /** Builds made from a chat request can teach a rule. */
  const teachable = (m: ChatMessageDto) => {
    const g = m.generationId ? allGens.find((x) => x.id === m.generationId) : null;
    return !!g?.draft && !!g.parentGenerationId && !!g.revisionMessage;
  };

  async function rememberThis(m: ChatMessageDto) {
    if (!m.generationId) return;
    remember[m.id] = { busy: true, rule: null, error: null };
    try {
      const rule = await api.extractChatRule({ generationId: m.generationId });
      remember[m.id] = { busy: false, rule, error: null };
    } catch (err) {
      remember[m.id] = { busy: false, rule: null, error: (err as Error).message || "Could not learn from this" };
    }
  }

  $effect(() => {
    if (!selection) return;
    const clear = () => (selection = null);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("resize", clear);
    return () => {
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("resize", clear);
    };
  });

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

  /* Unsent text survives a reload (iPad Safari drops background tabs), per client.
     The model pick is remembered per device for chats with no draft to follow. */
  const textKey = (clientId: string) => `pt.chat.text.${clientId}`;
  const PICK_KEY = "pt.chat.model";
  type Pick = { providerId: string; model: string; effort: string };
  /** Client whose saved text is in the composer; guards saving under the wrong id mid-switch. */
  let textFor = $state("");

  $effect(() => {
    if (id === textFor) return;
    textFor = id;
    draft = readDraft<string>(textKey(id))?.data ?? "";
    tick().then(autogrow);
  });

  // Size the composer to restored text once it mounts (it renders after loading).
  $effect(() => {
    if (textareaEl) autogrow();
  });

  $effect(() => {
    const text = draft;
    if (!textFor || textFor !== id) return;
    if (text.trim()) writeDraft(textKey(id), text);
    else clearDraft(textKey(id));
  });

  /** Apply the remembered pick only if the provider still offers that model and level. */
  function restorePick() {
    const pick = readDraft<Pick>(PICK_KEY)?.data;
    const p = pick && providers.find((x) => x.id === pick.providerId);
    if (!pick || !p) return;
    providerId = p.id;
    model = pick.model && p.models.includes(pick.model) ? pick.model : "";
    effort = pick.effort && p.effortLevels?.includes(pick.effort) ? pick.effort : "";
  }

  $effect(() => {
    const pick: Pick = { providerId, model, effort };
    if (!providers.length || !providerId) return;
    writeDraft(PICK_KEY, pick);
  });

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
      if (!preview.target) restorePick(); // a draft's own settings win (effect above)
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
    void api.recordLlmSignal({ subjectKind: "chat_message", subjectId: m.id, signal: "proposal_adjusted" }).catch(() => {});
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

  // Return adds a line: on iPad's on-screen keyboard it is the only way to, and an accidental
  // send costs an AI call. A hardware keyboard sends with ⌘/Ctrl+Return.
  const modKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘" : "Ctrl";

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !e.isComposing) {
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
        enterkeyhint="enter"
        aria-label="Message to AI"
        placeholder={preview.target
          ? "Ask about the numbers, or describe a change to the draft"
          : `Ask about ${firstName}'s training`}
      ></textarea>
      <div class="dock-row">
        <ModelSettings {providers} bind:providerId bind:model bind:effort />
        <span class="kbd">{modKey} ⏎ send</span>
        <button type="button" class="btn small send" disabled={!draft.trim() || busy || !providerId} onclick={send}>
          Send
        </button>
      </div>
    </div>
    {#if sendError}
      <div class="send-error"><Note tone="bad">{sendError}</Note></div>
    {/if}
    <p class="dock-hint">
      Return adds a new line. Tap Send, or press {modKey} Return on a keyboard.
      {#if preview.target && !openProposalId}Change requests come back as a proposal. Nothing is rebuilt until you press Build.{/if}
    </p>
  </div>
{/snippet}

{#snippet textNote(m: ChatMessageDto)}
  {#if noteOn?.messageId === m.id}
    {#key noteOn.anchor}
      <div class="text-note">
        <NoteEditor
          subjectKind="chat_message"
          subjectId={m.id}
          anchor={noteOn.anchor}
          clientId={id}
          clientName={firstName}
          onclose={() => (noteOn = null)}
        />
      </div>
    {/key}
  {/if}
{/snippet}

{#snippet thread()}
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div class="thread" role="log" aria-live="polite" aria-label="Conversation with AI" onpointerup={() => setTimeout(readSelection)} onkeyup={(e) => e.shiftKey && readSelection()}>
    {#each messages as m (m.id)}
      {#if m.role === "trainer"}
        <div class="you">{m.content}</div>
      {:else}
        <div class="ai">
          <div class="who"><Icon name="sparkle" />AI</div>
          {#if m.kind === "error"}
            <Note tone="bad">{m.content}</Note>
          {:else if m.kind === "proposal" && m.proposal}
            <div class="md" data-reply-id={m.id}>{@html renderMarkdown(m.content)}</div>
            <ChatProposal
              proposal={m.proposal}
              tags={tagsFor(m.proposal.parentGenerationId)}
              status={proposalStatus(m)}
              {elapsed}
              onbuild={() => build(m)}
              onadjust={() => adjust(m)}
            />
            <div class="ai-foot"><Verdict subjectKind="chat_message" subjectId={m.id} initial={verdicts[m.id] ?? null} noun="proposal" clientId={id} clientName={firstName} /></div>
            {@render textNote(m)}
          {:else if m.kind === "draft"}
            {@const stamp = stamps.get(m.id)}
            {@const text = stripDraftNotice(m.content)}
            {#if text}<div class="md">{@html renderMarkdown(text)}</div>{/if}
            {#if stamp}
              <VersionStamp {stamp} onpick={(c) => pick(c, stamp)} />
            {/if}
            {#if teachable(m)}
              {@const r = remember[m.id]}
              <div class="remember">
                {#if r?.rule}
                  <LearnedRule rule={r.rule} clientId={id} clientName={firstName} />
                {:else}
                  <button type="button" class="linkish" disabled={r?.busy} onclick={() => rememberThis(m)}>
                    <Icon name="sparkle" />{r?.busy ? "Learning…" : "Remember this for next time?"}
                  </button>
                  {#if r?.error}<span class="remember-err" role="alert">{r.error}</span>{/if}
                {/if}
              </div>
            {/if}
          {:else}
            <div class="md" data-reply-id={m.id}>{@html renderMarkdown(m.content)}</div>
            <div class="ai-foot">
              <Verdict subjectKind="chat_message" subjectId={m.id} initial={verdicts[m.id] ?? null} clientId={id} clientName={firstName} />
              {#if preview.target}<span class="answer-only">Answer only · draft unchanged</span>{/if}
            </div>
            {@render textNote(m)}
          {/if}
        </div>
      {/if}
    {/each}
    {#if selection}
      <button
        type="button"
        class="sel-note"
        style:left="{selection.x}px"
        style:top="{selection.y}px"
        onpointerdown={(e) => e.preventDefault()}
        onclick={noteOnSelection}
      >
        <Icon name="comment" />Note on this
      </button>
    {/if}
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
  .ai-foot {
    display: flex;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 4px 10px;
    margin-top: 6px;
  }
  .text-note {
    margin-top: 8px;
  }
  .sel-note {
    position: fixed;
    z-index: 30;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
    box-shadow: var(--shadow-overlay);
    font: 500 12px/1.4 var(--font-ui);
    color: var(--ink);
    cursor: pointer;
  }
  .sel-note:hover {
    background: var(--well);
  }
  .sel-note :global(svg) {
    width: 12px;
    height: 12px;
  }
  .remember {
    display: grid;
    justify-items: start;
    gap: 4px;
    margin-top: 6px;
  }
  .linkish {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0;
    border: 0;
    background: none;
    font: 500 12px/1.4 var(--font-ui);
    color: var(--blue);
    cursor: pointer;
  }
  .linkish:hover:not(:disabled) {
    text-decoration: underline;
  }
  .linkish:disabled {
    color: var(--muted);
    cursor: progress;
  }
  .linkish :global(svg) {
    width: 12px;
    height: 12px;
  }
  .remember-err {
    font-size: 12px;
    color: var(--bad);
  }
  .answer-only {
    font-size: 12px;
    line-height: 26px;
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
    border: 2px solid var(--blue-line);
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
    container-type: inline-size; /* the chat column is narrow beside the draft; size the row to it, not the viewport */
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--surface);
  }
  .dock-box:focus-within {
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus-ring);
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
    white-space: nowrap;
  }
  .send {
    flex: none;
  }
  @container (max-width: 480px) {
    .kbd {
      display: none;
    }
    .send {
      margin-left: auto;
    }
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
