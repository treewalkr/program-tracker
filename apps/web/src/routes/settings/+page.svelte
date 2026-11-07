<script lang="ts">
  import { onMount } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import { api } from "$lib/api";
  import type { KineticChainDto } from "$lib/api/types";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Button from "$lib/ui/Button.svelte";
  import KineticChainEditor from "$lib/components/KineticChainEditor.svelte";
  import { accountApi } from "$lib/account";

  const webBuild = __APP_VERSION__;
  /** undefined while loading, null if the API didn't answer. */
  let apiBuild = $state<string | null | undefined>(undefined);

  let chains = $state<KineticChainDto[] | null>(null);
  let loadError = $state<string | null>(null);
  /** Chain ids with unsaved picks. */
  let dirty = $state<Set<string>>(new Set());

  async function load() {
    loadError = null;
    try {
      chains = await api.chains();
    } catch (err) {
      loadError = (err as Error).message || "the server didn't answer";
    }
  }

  async function handleSave(id: string, groups: string[]) {
    const updated = await api.updateChain(id, { muscleGroups: groups });
    if (chains) chains = chains.map((c) => (c.id === id ? updated : c));
  }

  function markDirty(id: string, isDirty: boolean) {
    if (dirty.has(id) === isDirty) return;
    const next = new Set(dirty);
    if (isDirty) next.add(id);
    else next.delete(id);
    dirty = next;
  }

  /** Feedback email switch: undefined while loading, null if the API didn't answer. */
  let feedbackEmails = $state<boolean | null | undefined>(undefined);
  let emailSaving = $state(false);
  let emailError = $state<string | null>(null);

  async function setFeedbackEmails(on: boolean) {
    const prev = feedbackEmails;
    feedbackEmails = on;
    emailSaving = true;
    emailError = null;
    try {
      feedbackEmails = (await accountApi.setNotifications({ feedbackEmails: on })).feedbackEmails;
    } catch (err) {
      feedbackEmails = prev;
      emailError = (err as Error).message || "Could not save";
    } finally {
      emailSaving = false;
    }
  }

  beforeNavigate((nav) => {
    if (dirty.size === 0) return;
    if (nav.type === "leave") nav.cancel();
    else if (!confirm(`Leave without saving ${dirty.size === 1 ? "a chain" : `${dirty.size} chains`}?`)) nav.cancel();
  });

  onMount(() => {
    load();
    accountApi.notifications().then(
      (n) => (feedbackEmails = n.feedbackEmails),
      () => (feedbackEmails = null),
    );
    api.apiBuild().then(
      (b) => (apiBuild = b),
      () => (apiBuild = null)
    );
  });
</script>

<svelte:head><title>Settings · Program Tracker</title></svelte:head>

<PageHead title="Settings" sub="Shared across every client" />

{#if loadError}
  <Note tone="bad">
    Couldn't load the kinetic chains — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else}
  <Panel title="Kinetic chains" count={chains ? (dirty.size ? `${dirty.size} unsaved` : `${chains.length} chains`) : undefined}>
    <p class="lede">
      Working sets on these muscle groups count toward the chain in each client's
      <em>Chains trained this week</em> panel. A group can belong to more than one chain.
    </p>
    {#if chains === null}
      <div class="pad"><Skeleton h="200px" /></div>
    {:else}
      {#each chains as chain (chain.id)}
        <KineticChainEditor
          {chain}
          onSave={(groups) => handleSave(chain.id, groups)}
          ondirty={(d) => markDirty(chain.id, d)}
        />
      {/each}
    {/if}
  </Panel>
{/if}

<div class="about-wrap">
  <Panel title="Email">
    <div class="email">
      {#if feedbackEmails === undefined}
        <Skeleton w="260px" h="18px" />
      {:else if feedbackEmails === null}
        <p class="muted">Email settings aren't available right now.</p>
      {:else}
        <label class="switch">
          <input
            type="checkbox"
            role="switch"
            checked={feedbackEmails}
            disabled={emailSaving}
            onchange={(e) => setFeedbackEmails(e.currentTarget.checked)}
          />
          <span>
            <strong>Email me about feedback</strong>
            <span class="muted">Replies and status changes on your feedback items — and, for the admin, new items.</span>
          </span>
        </label>
        {#if emailError}<p class="err" role="alert">{emailError}</p>{/if}
      {/if}
    </div>
  </Panel>
</div>

<div class="about-wrap">
  <Panel title="About">
    <dl class="about">
      <dt>App</dt>
      <dd>{webBuild}</dd>
      <dt>API</dt>
      <dd>
        {#if apiBuild === undefined}<Skeleton w="110px" h="14px" />{:else}{apiBuild ?? "not reachable"}{/if}
      </dd>
    </dl>
    {#if apiBuild && apiBuild !== webBuild}
      <div class="pad mismatch">
        <Note tone="warn">The app and the API are on different builds. A deploy may still be rolling out — reload in a few minutes.</Note>
      </div>
    {/if}
  </Panel>
</div>

<style>
  .lede {
    margin: 0;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line-soft);
    font-size: 12px;
    color: var(--muted);
    max-width: none;
  }
  .lede em { font-style: normal; color: var(--ink); }
  .pad { padding: 16px; }
  .pad.mismatch { padding-top: 0; }

  .about-wrap { margin-top: 16px; }

  .email { padding: 14px 16px; font-size: 13px; }
  .email .muted { color: var(--muted); margin: 0; }
  .switch { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
  .switch input { margin: 2px 0 0; width: 16px; height: 16px; accent-color: var(--blue); flex: none; }
  .switch > span { display: flex; flex-direction: column; gap: 2px; }
  .switch strong { font-weight: 600; color: var(--ink); }
  .email .err { margin: 8px 0 0; color: var(--bad); font-size: 12px; }

  .about {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: 6px 12px;
    margin: 0;
    padding: 14px 16px;
    font-size: 13px;
  }
  .about dt { color: var(--muted); }
  .about dd { margin: 0; font-family: var(--font-mono); color: var(--ink); overflow-wrap: anywhere; }
</style>
