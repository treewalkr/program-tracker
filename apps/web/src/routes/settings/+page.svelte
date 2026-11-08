<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon, { type IconName } from "$lib/ui/Icon.svelte";
  import { theme, type ThemePref } from "$lib/theme.svelte";
  import { accountApi, type NotificationPatch, type NotificationSettings } from "$lib/account";
  import { feedbackApi } from "$lib/feedback/client";
  import type { FeedbackReplyScope } from "@pt/shared";

  const THEMES: { value: ThemePref; label: string; icon: IconName }[] = [
    { value: "system", label: "System", icon: "monitor" },
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
  ];

  const webBuild = __APP_VERSION__;
  /** undefined while loading, null if the API didn't answer. */
  let apiBuild = $state<string | null | undefined>(undefined);

  /** Feedback email settings: undefined while loading, null if the API didn't answer. */
  let notif = $state<NotificationSettings | null | undefined>(undefined);
  let emailSaving = $state(false);
  let emailError = $state<string | null>(null);
  /** Which replies to turn back on when the admin re-ticks "Replies". */
  let replyScope = $state<Exclude<FeedbackReplyScope, "off">>("all");

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
      },
      () => (notif = null),
    );
    api.apiBuild().then(
      (b) => (apiBuild = b),
      () => (apiBuild = null)
    );
  });
</script>

<svelte:head><title>Settings · Program Tracker</title></svelte:head>

<PageHead title="Settings" sub="Appearance, your email and this app's version" />

<Panel title="Appearance">
  <div class="appearance">
    <div class="theme-pick" role="radiogroup" aria-label="Theme">
      {#each THEMES as t (t.value)}
        <label class="theme-opt" class:on={theme.pref === t.value}>
          <input
            type="radio"
            name="theme"
            value={t.value}
            checked={theme.pref === t.value}
            onchange={() => theme.set(t.value)}
          />
          <Icon name={t.icon} />
          <span>{t.label}</span>
        </label>
      {/each}
    </div>
    <p class="muted">
      {theme.pref === "system" ? "Matches your device setting." : "Saved for this browser."}
    </p>
  </div>
</Panel>

<div class="section">
  <Panel title="Email">
    <div class="email">
      {#if notif === undefined}
        <Skeleton w="260px" h="18px" />
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
      {/if}
    </div>
  </Panel>
</div>

<div class="about-wrap">
  <Panel title="About">
    <div class="about">
      <span class="label">Version</span>
      <span class="ver">{webBuild}</span>
      <span class="api" aria-live="polite">
        {#if apiBuild === undefined}
          <Skeleton w="90px" h="12px" />
        {:else if apiBuild === null}
          <span class="dot bad" aria-hidden="true"></span>API not reachable
        {:else if apiBuild !== webBuild}
          <span class="dot warn" aria-hidden="true"></span>API on <span class="mono">{apiBuild}</span>
        {:else}
          <span class="dot good" aria-hidden="true"></span>API connected
        {/if}
      </span>
    </div>
    {#if apiBuild && apiBuild !== webBuild}
      <div class="pad mismatch">
        <Note tone="warn">The app and the API are on different builds. A deploy may still be rolling out — reload in a few minutes.</Note>
      </div>
    {/if}
  </Panel>
</div>

<style>
  .pad { padding: 16px; }
  .pad.mismatch { padding-top: 0; }

  .about-wrap,
  .section { margin-top: 16px; }

  .appearance { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding: 14px 16px; font-size: 13px; }
  .appearance .muted { color: var(--muted); margin: 0; }
  .theme-pick {
    display: inline-flex;
    padding: 2px;
    gap: 2px;
    background: var(--well-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .theme-opt {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border-radius: calc(var(--radius) - 2px);
    color: var(--muted);
    cursor: pointer;
    transition: background-color 120ms ease-out, color 120ms ease-out;
  }
  .theme-opt input { position: absolute; opacity: 0; pointer-events: none; }
  .theme-opt :global(svg) { width: 14px; height: 14px; stroke-width: 1.6; }
  .theme-opt:hover { color: var(--ink); }
  .theme-opt.on { background: var(--well); color: var(--ink); font-weight: 600; box-shadow: 0 0 0 1px var(--line); }
  .theme-opt:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: 1px; }
  @media (prefers-reduced-motion: reduce) { .theme-opt { transition: none; } }

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
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  .muted-list { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--line-soft); }
  .muted-list h3 { margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .muted-list ul { list-style: none; margin: 0; padding: 0; }
  .muted-list li { display: flex; align-items: center; gap: 8px; padding: 4px 0; }
  .muted-list .handle { font-family: var(--font-mono); font-size: 12px; color: var(--blue); flex: none; }
  .muted-list .comment { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }

  .email .err { margin: 8px 0 0; color: var(--bad); font-size: 12px; }

  .about {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 6px 12px;
    padding: 14px 16px;
    font-size: 13px;
  }
  .about .label { color: var(--muted); }
  .about .ver { font-family: var(--font-mono); font-weight: 600; color: var(--ink); }
  .about .api {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
  }
  .about .mono { font-family: var(--font-mono); color: var(--warn-ink); }
  .dot { width: 6px; height: 6px; border-radius: 50%; flex: none; }
  .dot.good { background: var(--good); }
  .dot.warn { background: var(--warn); }
  .dot.bad { background: var(--bad); }
</style>
