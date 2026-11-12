<script lang="ts">
  import { onMount } from "svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Button from "$lib/ui/Button.svelte";
  import { accountApi, type NotificationPatch, type NotificationSettings } from "$lib/account";
  import { feedbackApi } from "$lib/feedback/client";
  import type { FeedbackAiMode, FeedbackReplyScope } from "@pt/shared";
  import { AI_MODE_OPTIONS } from "$lib/feedback/ai";

  /** Feedback email settings: undefined while loading, null if the API didn't answer. */
  let notif = $state<NotificationSettings | null | undefined>(undefined);
  let emailSaving = $state(false);
  let emailError = $state<string | null>(null);
  /** Which replies to turn back on when the admin re-ticks "Replies". */
  let replyScope = $state<Exclude<FeedbackReplyScope, "off">>("all");

  /** Admin: AI answers on feedback. undefined while loading (or not admin), null if the API didn't answer. */
  let aiMode = $state<FeedbackAiMode | null | undefined>(undefined);
  let aiSaving = $state(false);
  let aiError = $state<string | null>(null);

  /** Optimistic, like the email switches. */
  async function saveAiMode(mode: FeedbackAiMode) {
    const prev = aiMode;
    aiMode = mode;
    aiSaving = true;
    aiError = null;
    try {
      aiMode = await accountApi.setFeedbackAiMode(mode);
    } catch (err) {
      aiMode = prev;
      aiError = (err as Error).message || "Could not save";
    } finally {
      aiSaving = false;
    }
  }

  /** Optimistic: show the change now, keep the server's answer, revert on error. */
  async function saveEmail(patch: NotificationPatch) {
    if (!notif) return;
    const prev = $state.snapshot(notif);
    notif = { ...notif, ...patch, prefs: { ...notif.prefs, ...patch.prefs } };
    emailSaving = true;
    emailError = null;
    try {
      notif = await accountApi.setNotifications(patch);
    } catch (err) {
      notif = prev;
      emailError = (err as Error).message || "Could not save";
    } finally {
      emailSaving = false;
    }
  }

  function setReplies(on: boolean) {
    saveEmail({ prefs: { replies: on ? replyScope : "off" } });
  }

  function setReplyScope(scope: Exclude<FeedbackReplyScope, "off">) {
    replyScope = scope;
    saveEmail({ prefs: { replies: scope } });
  }

  async function unmute(itemId: string) {
    if (!notif) return;
    const prev = notif.muted;
    notif = { ...notif, muted: prev.filter((m) => m.itemId !== itemId) };
    emailError = null;
    try {
      await feedbackApi.setMuted(itemId, false);
    } catch (err) {
      if (notif) notif = { ...notif, muted: prev };
      emailError = (err as Error).message || "Could not unmute";
    }
  }

  onMount(() => {
    accountApi.notifications().then(
      (n) => {
        notif = n;
        if (n.prefs.replies !== "off") replyScope = n.prefs.replies;
        if (n.isAdmin) {
          accountApi.feedbackAiMode().then(
            (m) => (aiMode = m),
            () => (aiMode = null),
          );
        }
      },
      () => (notif = null),
    );
  });
</script>

<Panel title="Email">
  <div class="email">
    {#if notif === undefined}
      <Skeleton shape="line" w="min(260px, 100%)" h="12px" />
    {:else if notif === null}
      <p class="muted">Email settings aren't available right now.</p>
    {:else}
      <label class="switch">
        <input
          type="checkbox"
          role="switch"
          checked={notif.feedbackEmails}
          disabled={emailSaving}
          onchange={(e) => saveEmail({ feedbackEmails: e.currentTarget.checked })}
        />
        <span>
          <strong>Email me about feedback</strong>
          <span class="muted">
            {notif.feedbackEmails ? "Pick which below." : "Off — nothing is sent. Your picks below are kept for when you turn it back on."}
          </span>
        </span>
      </label>

      <fieldset class="prefs" disabled={!notif.feedbackEmails || emailSaving}>
        <legend class="sr-only">Which feedback emails</legend>
        {#if notif.isAdmin}
          <label class="check">
            <input
              type="checkbox"
              checked={notif.prefs.newTickets}
              onchange={(e) => saveEmail({ prefs: { newTickets: e.currentTarget.checked } })}
            />
            <span>New tickets from trainers</span>
          </label>
          <div class="group">
            <label class="check">
              <input
                type="checkbox"
                checked={notif.prefs.replies !== "off"}
                onchange={(e) => setReplies(e.currentTarget.checked)}
              />
              <span>Replies</span>
            </label>
            <div class="radios" role="radiogroup" aria-label="Which replies">
              {#each [["all", "On all tickets"], ["mine", "Only tickets I'm in"]] as const as [value, label] (value)}
                <label class="check">
                  <input
                    type="radio"
                    name="reply-scope"
                    {value}
                    checked={(notif.prefs.replies === "off" ? replyScope : notif.prefs.replies) === value}
                    disabled={notif.prefs.replies === "off"}
                    onchange={() => setReplyScope(value)}
                  />
                  <span>{label}</span>
                </label>
              {/each}
            </div>
          </div>
        {:else}
          <label class="check">
            <input
              type="checkbox"
              checked={notif.prefs.replies !== "off"}
              onchange={(e) => saveEmail({ prefs: { replies: e.currentTarget.checked ? "all" : "off" } })}
            />
            <span>Replies on my tickets</span>
          </label>
        {/if}
        <label class="check">
          <input
            type="checkbox"
            checked={notif.prefs.status}
            onchange={(e) => saveEmail({ prefs: { status: e.currentTarget.checked } })}
          />
          <span>Status changes on my tickets <span class="muted">(accepted, won't fix, shipped)</span></span>
        </label>
      </fieldset>

      {#if notif.muted.length}
        <div class="muted-list">
          <h3>Muted tickets</h3>
          <ul>
            {#each notif.muted as m (m.itemId)}
              <li>
                <a class="handle" href="/feedback#{m.handle}">{m.handle}</a>
                <span class="comment" title={m.comment}>{m.comment}</span>
                <Button small variant="ghost" onclick={() => unmute(m.itemId)}>Unmute</Button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if emailError}<p class="err" role="alert">{emailError}</p>{/if}

      {#if notif.isAdmin}
        <div class="ai-answers">
          <h3 id="ai-answers-title">AI answers to feedback</h3>
          <p class="muted">
            A scheduled agent reads new tickets against the code and replies. Every answer is badged as AI and comes with a
            private note for you.
          </p>
          {#if aiMode === undefined}
            <Skeleton shape="line" w="min(220px, 100%)" h="12px" />
          {:else if aiMode === null}
            <p class="muted">This setting isn't available right now.</p>
          {:else}
            <div class="radios ai-modes" role="radiogroup" aria-labelledby="ai-answers-title">
              {#each AI_MODE_OPTIONS as opt (opt.value)}
                <label class="check">
                  <input
                    type="radio"
                    name="feedback-ai-mode"
                    value={opt.value}
                    checked={aiMode === opt.value}
                    disabled={aiSaving}
                    onchange={() => saveAiMode(opt.value)}
                  />
                  <span>{opt.label} <span class="muted">— {opt.help}</span></span>
                </label>
              {/each}
            </div>
          {/if}
          {#if aiError}<p class="err" role="alert">{aiError}</p>{/if}
        </div>
      {/if}
    {/if}
  </div>
</Panel>

<style>
  .email { padding: 14px 16px; font-size: 13px; }
  .email .muted { color: var(--muted); margin: 0; }
  .switch { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .switch input { margin: 2px 0 0; width: 16px; height: 16px; accent-color: var(--blue); flex: none; }
  .switch > span { display: flex; flex-direction: column; gap: 2px; }
  .switch strong { font-weight: 600; color: var(--ink); }
  .prefs {
    margin: 12px 0 0 26px;
    padding: 0;
    border: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .prefs:disabled { opacity: 0.5; }
  .prefs:disabled .check { cursor: default; }
  .check { display: flex; align-items: center; gap: 8px; cursor: pointer; color: var(--ink); }
  .check input { margin: 0; width: 14px; height: 14px; accent-color: var(--blue); flex: none; }
  .check .muted { display: inline; }
  .group { display: flex; flex-direction: column; gap: 6px; }
  .radios { display: flex; flex-direction: column; gap: 6px; margin-left: 22px; }
  .radios input:disabled + span { color: var(--muted); }
  .muted-list { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
  .muted-list h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .muted-list ul { list-style: none; margin: 0; padding: 0; }
  .muted-list li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .muted-list .handle { font-family: var(--font-mono); font-size: 12px; color: var(--blue); flex: none; }
  .muted-list .comment { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }

  .ai-answers { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
  .ai-answers h3 { margin: 0 0 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .ai-answers > .muted { max-width: 64ch; line-height: 1.5; margin-bottom: 10px; }
  .ai-modes { margin-left: 0; }
  .ai-modes .check { align-items: flex-start; }
  .ai-modes .check input { margin-top: 2px; }

  .email .err { margin: 8px 0 0; color: var(--bad); font-size: 12px; }
</style>
