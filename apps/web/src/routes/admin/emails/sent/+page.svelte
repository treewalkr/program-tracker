<script lang="ts">
  import { onMount } from "svelte";
  import { feedbackHandle } from "@pt/shared";
  import { apiMode } from "$lib/api";
  import { adminApi, type SentEmail } from "$lib/api/admin";
  import { ago } from "$lib/draftReview";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  /**
   * Admin log of notification emails sent to trainers. The server keeps no
   * bodies or addresses; the recipient's address comes back masked.
   */

  let sends = $state<SentEmail[] | null>(null);
  let loadError = $state<string | null>(null);

  const KIND: Record<string, string> = {
    "feedback.created": "New ticket",
    "feedback.reply": "Reply",
    "feedback.status": "Status change",
  };
  const ERROR: Record<string, string> = {
    provider_error: "Provider refused",
    not_configured: "Email off",
  };

  const failed = $derived(sends?.filter((s) => s.error).length ?? 0);

  const stamp = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  async function load() {
    loadError = null;
    try {
      sends = await adminApi.sentEmails();
    } catch (err) {
      loadError = (err as Error).message || "the server didn't answer";
    }
  }

  onMount(() => {
    if (apiMode === "live") load();
  });
</script>

<svelte:head><title>Sent emails · Program Tracker</title></svelte:head>

<PageHead
  title="Sent emails"
  sub="Notification emails sent to trainers, newest first. Addresses are masked and no message content is kept."
/>

{#if apiMode !== "live"}
  <Note tone="warn">The send log lives on the server — switch to the live API to see it.</Note>
{:else if loadError}
  <Note tone="bad">
    Couldn't load the send log — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else if !sends}
  <SkeletonPanel />
{:else}
  <Panel title="Recent sends" count={sends.length}>
    {#snippet act()}
      {#if failed}<Pill tone="bad">{failed} failed</Pill>{/if}
    {/snippet}
    {#if sends.length === 0}
      <EmptyState>Nothing sent yet. Emails show here once a new ticket, reply or status change notifies someone.</EmptyState>
    {:else}
      <div class="scroll">
        <table class="sheet">
          <thead>
            <tr>
              <th>Sent</th>
              <th>To</th>
              <th>Email</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            {#each sends as s (s.id)}
              <tr class:bad={s.error}>
                <td class="when"><time datetime={s.sentAt} title={stamp(s.sentAt)}>{ago(s.sentAt)}</time></td>
                <td>
                  {#if s.recipient}
                    <div class="name">{s.recipient.name}</div>
                    <div class="addr">{s.recipient.email}</div>
                  {:else}
                    <span class="gone">Removed account</span>
                  {/if}
                </td>
                <td>
                  <div class="what">
                    {#if s.feedbackNumber !== null}
                      <a href="/feedback#{feedbackHandle(s.feedbackNumber)}">{s.label}</a>
                    {:else}
                      {s.label}
                    {/if}
                  </div>
                  <div class="kind">{KIND[s.kind] ?? s.kind}</div>
                </td>
                <td>
                  {#if s.error}
                    <Pill tone="bad">{ERROR[s.error] ?? s.error}</Pill>
                  {:else}
                    <Pill tone="good">Sent</Pill>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </Panel>
{/if}

<style>
  .scroll { overflow-x: auto; }
  .when {
    white-space: nowrap;
    font: 400 12px/1.6 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .name { font-weight: 600; }
  .addr, .kind {
    font-size: 12px;
    color: var(--muted);
  }
  .addr { font-family: var(--font-mono); }
  .what a { color: var(--ink); }
  .gone { color: var(--faint); font-style: italic; }
</style>
