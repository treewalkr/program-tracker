<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { ChatMessageDto, ClientDto, GenerationDto, ProgramDto } from "$lib/api/types";
  import { latestValidatedDraft, revisionChain } from "$lib/generation";
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
  let sendError = $state<string | null>(null);

  const target = $derived(latestValidatedDraft(allGens));
  const targetVersion = $derived(revisionChain(allGens, target?.id ?? "").length);
  const firstName = $derived(client?.name.split(" ")[0] ?? "this client");

  onMount(async () => {
    try {
      const [detail, gens, msgs] = await Promise.all([
        api.client(id),
        api.generations(id),
        api.chatMessages(id),
      ]);
      client = detail.client;
      current = detail.currentProgram;
      allGens = gens;
      messages = msgs;
    } finally {
      loading = false;
    }
  });

  async function clear() {
    await api.clearChat(id);
    messages = await api.chatMessages(id);
  }

  async function send() {
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    sending = true;
    sendError = null;
    try {
      const rows = await api.sendChatMessage({ clientId: id, message: trimmed });
      messages = [...messages, ...rows];
      draft = "";
    } catch (err) {
      sendError = (err as Error).message || "Send failed";
    } finally {
      sending = false;
    }
  }

  async function revise() {
    const trimmed = draft.trim();
    if (!trimmed || sending || !target) return;
    sending = true;
    sendError = null;
    try {
      const res = await api.reviseViaChat({ generationId: target.id, message: trimmed });
      messages = [...messages, ...res.messages];
      allGens = [res.generation, ...allGens];
      draft = "";
    } catch (err) {
      sendError = (err as Error).message || "Revision failed";
    } finally {
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

  <div class="chat-layout">
    {#if messages.length === 0}
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
              placeholder={`e.g. How has ${firstName}'s squat e1RM moved this block?`}
              bind:value={draft}
            ></textarea>
          </Field>

          {#if sendError}
            <Note tone="bad">{sendError}</Note>
          {/if}

          <div class="composer-actions">
            <div class="btn-group">
              <Button
                variant="primary"
                onclick={send}
                disabled={!draft.trim() || sending}
              >
                {sending ? "Sending…" : "Send"}
              </Button>

              {#if target}
                <Button
                  variant="default"
                  onclick={revise}
                  disabled={!draft.trim() || sending}
                >
                  Revise draft
                </Button>
              {/if}
            </div>

            {#if target}
              <p class="revise-hint">
                Sends as a revision to the latest draft (v{targetVersion}) — creates the next version.
              </p>
            {/if}
          </div>
        </div>
      </Panel>
    </div>
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
