<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { ChatMessageDto, ClientDto, ExerciseDto, GenerationDto, ProgramDto } from "$lib/api/types";
  import { applyChatTurn, draftPreviewModel, submitChatTurn, type ChatTurnMode } from "$lib/chatRefine";
  import DraftPreview from "$lib/components/DraftPreview.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let allGens = $state<GenerationDto[]>([]);
  let messages = $state<ChatMessageDto[]>([]);
  let loading = $state(true);

  let draft = $state("");
  let sending = $state(false);
  let pendingMessage = $state<string | null>(null);
  let sendError = $state<string | null>(null);
  let catalogById = $state(new Map<string, ExerciseDto>());

  const preview = $derived(draftPreviewModel(allGens, pendingMessage !== null, catalogById));
  const firstName = $derived(client?.name.split(" ")[0] ?? "this client");
  const busy = $derived(sending || pendingMessage !== null);

  onMount(async () => {
    try {
      const [detail, gens, msgs, exList] = await Promise.all([
        api.client(id),
        api.generations(id),
        api.chatMessages(id),
        api.exercises(),
      ]);
      client = detail.client;
      current = detail.currentProgram;
      allGens = gens;
      messages = msgs;
      catalogById = new Map(exList.map((e) => [e.id, e]));
    } finally {
      loading = false;
    }
  });

  async function clear() {
    await api.clearChat(id);
    messages = await api.chatMessages(id);
  }

  /**
   * One chat turn. With a draft target, refine revises it straight away
   * (auto-apply — the preview pane shows skeletons, then the next version);
   * every other path is plain Q&A. All submit logic lives in $lib/chatRefine.
   */
  async function turn(mode: ChatTurnMode) {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    sendError = null;
    if (mode === "refine" && preview.target) {
      pendingMessage = trimmed;
    } else {
      sending = true;
    }
    draft = "";
    try {
      const res = await submitChatTurn(api, { clientId: id, target: preview.target, message: trimmed, mode });
      ({ messages, gens: allGens } = applyChatTurn({ messages, gens: allGens }, res));
    } catch (err) {
      draft = trimmed;
      sendError = (err as Error).message || (mode === "refine" ? "Revision failed" : "Send failed");
    } finally {
      pendingMessage = null;
      sending = false;
    }
  }
</script>

{#if loading}
  <div class="mt-16"><Skeleton h="180px" w="100%" /></div>
{:else if !client}
  <EmptyState>Client not found.</EmptyState>
{:else}
  <PageHead
    title="Ask AI"
    crumbs={[
      { href: "/clients", label: "Clients" },
      { href: `/clients/${id}`, label: client.name },
      { label: "Ask AI" },
    ]}
    sub={`${client.name} — numbers, progress, and the draft loop`}
  >
    {#snippet actions()}
      <ConfirmButton
        label="Clear chat"
        confirmLabel="Really clear?"
        variant="ghost"
        disabled={messages.length === 0}
        onconfirm={clear}
      />
    {/snippet}
  </PageHead>

  <div class={preview.target ? "refine-layout" : "chat-layout"}>
    <div class="chat-col">
      {#if messages.length === 0 && pendingMessage === null}
        <EmptyState>
          <p>Ask about {firstName}'s numbers, or send a revision to the latest draft.</p>
        </EmptyState>
      {:else}
        <Panel title="Transcript">
          <div class="panel-body transcript">
            {#each messages as m (m.id)}
              <div class={`msg-row ${m.role} ${m.kind}`}>
                <div class="msg-meta">
                  <span class="role-label">{m.role === "trainer" ? "You" : "AI"}</span>
                  {#if m.kind === "revision"}
                    <span class="chip-rev">revision</span>
                  {/if}
                </div>
                <div class="msg-content">
                  {#if m.kind === "error"}
                    <Note tone="bad">{m.content}</Note>
                  {:else}
                    <div class="content-text">{m.content}</div>
                  {/if}
                  {#if m.kind === "draft"}
                    <div class="mt-8">
                      <a class="act" href={`/clients/${id}/generate`}>Open review</a>
                    </div>
                  {/if}
                </div>
              </div>
            {/each}
            {#if pendingMessage !== null}
              <div class="msg-row trainer pending">
                <div class="msg-meta">
                  <span class="role-label">You</span>
                  <span class="chip-rev">revision</span>
                </div>
                <div class="msg-content">
                  <div class="content-text">{pendingMessage}</div>
                </div>
              </div>
              <div class="msg-row assistant pending">
                <div class="msg-meta">
                  <span class="role-label">AI</span>
                </div>
                <div class="msg-content">
                  <div class="content-text pending-note">Revising draft v{preview.version} → v{preview.nextVersion}…</div>
                  <div class="pending-skeletons">
                    <Skeleton h="14px" w="100%" />
                    <Skeleton h="14px" w="100%" />
                  </div>
                </div>
              </div>
            {/if}
          </div>
        </Panel>
      {/if}

      <div class="mt-16">
        <Panel title="Message">
          <div class="panel-body composer">
            <Field label="Message" htmlFor="chat-message">
              <textarea
                id="chat-message"
                class="textarea"
                rows="2"
                maxlength="2000"
                placeholder={preview.target
                  ? "e.g. Pull week 3 volume back 20%"
                  : `e.g. How has ${firstName}'s squat e1RM moved this block?`}
                bind:value={draft}
              ></textarea>
            </Field>

            {#if sendError}
              <Note tone="bad">{sendError}</Note>
            {/if}

            <div class="composer-actions">
              <div class="btn-group">
                {#if preview.target}
                  <Button
                    variant="primary"
                    onclick={() => turn("refine")}
                    disabled={!draft.trim() || busy}
                  >
                    {pendingMessage !== null ? "Revising…" : "Send"}
                  </Button>
                  <Button
                    variant="ghost"
                    onclick={() => turn("ask")}
                    disabled={!draft.trim() || busy}
                  >
                    Ask without changing
                  </Button>
                {:else}
                  <Button
                    variant="primary"
                    onclick={() => turn("refine")}
                    disabled={!draft.trim() || busy}
                  >
                    {sending ? "Sending…" : "Send"}
                  </Button>
                {/if}
              </div>

              {#if preview.target}
                <p class="revise-hint">
                  Each message revises the draft (v{preview.version} → v{preview.version + 1}). Approve stays on
                  the review page.
                </p>
              {/if}
            </div>
          </div>
        </Panel>
      </div>
    </div>

    {#if preview.target}
      <div class="preview-col">
        <DraftPreview model={preview} reviewHref={`/clients/${id}/generate`} />
      </div>
    {/if}
  </div>
{/if}

<style>
  .mt-16 {
    margin-top: 16px;
  }
  .mt-8 {
    margin-top: 8px;
  }
  .chat-layout {
    max-width: 800px;
  }
  .refine-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  @media (max-width: 900px) {
    .refine-layout {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .transcript {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .msg-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 14px;
    border-radius: 6px;
    background: var(--well);
    border: 1px solid var(--line);
  }
  .msg-row.trainer {
    background: var(--surface);
  }
  .msg-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .role-label {
    font: 600 12px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .chip-rev {
    font: 500 11px/1 var(--font-ui);
    padding: 2px 6px;
    border-radius: 99px;
    background: var(--blue-well);
    color: var(--blue);
    border: 1px solid var(--blue-line);
    text-transform: uppercase;
  }
  .content-text {
    white-space: pre-wrap;
    font-size: 14px;
    line-height: 1.55;
    color: var(--ink);
  }
  .pending-note {
    color: var(--muted);
    font-style: italic;
  }
  .pending-skeletons {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
  }
  .composer {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .composer-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .btn-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .revise-hint {
    margin: 0;
    font: 400 12px/1.4 var(--font-ui);
    color: var(--muted);
  }
  a.act {
    font: 500 13px/1 var(--font-ui);
    color: var(--blue);
    text-decoration: underline;
  }
</style>
