<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { apiMode } from "$lib/api";
  import { adminApi, type LlmDatasetStats, type TrainerAccount } from "$lib/api/admin";
  import LlmDatasetPanel from "$lib/components/LlmDatasetPanel.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Avatar from "$lib/ui/Avatar.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ACCESS = {
    active: { tone: "good", label: "Active" },
    invited: { tone: "neutral", label: "Invited" },
    disabled: { tone: "bad", label: "Disabled" },
  } as const;
  const RANK = { active: 0, invited: 1, disabled: 2 } as const;

  let trainers = $state<TrainerAccount[] | null>(null);
  let loadError = $state<string | null>(null);
  let llmStats = $state<LlmDatasetStats | null>(null);
  let llmStatsError = $state<string | null>(null);

  let name = $state("");
  let email = $state("");
  let adding = $state(false);
  let addError = $state<string | null>(null);
  let attempted = $state(false);
  /** The just-added row, to point at it. */
  let addedId = $state<string | null>(null);
  /** Per-row action in flight / its error. */
  let busy = $state<string | null>(null);
  let rowError = $state<{ id: string; text: string } | null>(null);
  let copied = $state(false);

  const missing = $derived(!name.trim() ? "a name" : !EMAIL.test(email.trim()) ? "a valid email" : null);
  const sorted = $derived(
    [...(trainers ?? [])].sort(
      (a, b) => Number(b.isAdmin) - Number(a.isAdmin) || RANK[a.access] - RANK[b.access] || a.name.localeCompare(b.name),
    ),
  );
  const summary = $derived.by(() => {
    if (!trainers) return "Who can sign in to Program Tracker";
    const n = (k: TrainerAccount["access"]) => trainers!.filter((t) => t.access === k).length;
    return [`${n("active")} active`, n("invited") && `${n("invited")} invited`, n("disabled") && `${n("disabled")} disabled`]
      .filter(Boolean)
      .join(" · ");
  });
  const loginUrl = $derived(`${page.url.origin}/login`);

  async function load() {
    loadError = null;
    try {
      trainers = await adminApi.trainers();
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (missing) {
      attempted = true;
      await tick();
      document.getElementById(!name.trim() ? "t-name" : "t-email")?.focus();
      return;
    }
    adding = true;
    addError = null;
    try {
      const created = await adminApi.addTrainer({ name: name.trim(), email: email.trim() });
      trainers = [...(trainers ?? []), created];
      addedId = created.id;
      setTimeout(() => {
        if (addedId === created.id) addedId = null;
      }, 2500);
      name = "";
      email = "";
      attempted = false;
      document.getElementById("t-name")?.focus();
    } catch (err) {
      addError = (err as Error).message;
    } finally {
      adding = false;
    }
  }

  async function run(t: TrainerAccount, action: () => Promise<TrainerAccount | null>) {
    busy = t.id;
    rowError = null;
    try {
      const next = await action();
      trainers = next ? trainers!.map((x) => (x.id === t.id ? next : x)) : trainers!.filter((x) => x.id !== t.id);
    } catch (err) {
      rowError = { id: t.id, text: (err as Error).message };
    } finally {
      busy = null;
    }
  }
  const setDisabled = (t: TrainerAccount, disabled: boolean) => run(t, () => adminApi.updateTrainer(t.id, { disabled }));
  const remove = (t: TrainerAccount) => run(t, async () => (await adminApi.removeTrainer(t.id), null));

  async function copyLink() {
    await navigator.clipboard.writeText(loginUrl);
    copied = true;
    setTimeout(() => (copied = false), 1600);
  }

  const fmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
  function lastSeen(t: TrainerAccount): string {
    if (!t.lastSignInAt) return t.access === "invited" ? `Added ${fmt.format(new Date(t.createdAt))}` : "No sign-in yet";
    const days = Math.floor((Date.now() - new Date(t.lastSignInAt).getTime()) / 86_400_000);
    return `Signed in ${days === 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : fmt.format(new Date(t.lastSignInAt))}`;
  }

  onMount(() => {
    if (apiMode === "live") {
      load();
      adminApi
        .llmStats()
        .then((s) => (llmStats = s))
        .catch((err) => (llmStatsError = (err as Error).message));
    }
  });
</script>

<svelte:head><title>Trainers · Program Tracker</title></svelte:head>

<PageHead title="Trainers" sub={summary} />

{#if apiMode !== "live"}
  <Note tone="warn">Trainer accounts live on the server — switch to the live API to manage them.</Note>
{:else if loadError}
  <Note tone="bad">
    Couldn't load trainer accounts — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else}
  <div class="cols">
    <Panel title="Add a trainer" class="addp">
      <form class="panel-body add" onsubmit={add} novalidate>
        <p class="lede">
          Adding someone lets them in. They sign in with Google using this email — no password, no invite email to
          send.
        </p>
        <div class="fields">
          <div>
            <label class="label" for="t-name">Name</label>
            <input class="input" id="t-name" bind:value={name} maxlength="120" autocomplete="off" placeholder="Full name" />
          </div>
          <div>
            <label class="label" for="t-email">Google email</label>
            <input
              class="input"
              id="t-email"
              type="email"
              bind:value={email}
              maxlength="254"
              autocomplete="off"
              placeholder="name@gmail.com"
            />
          </div>
        </div>
        <div class="foot">
          <Button variant="primary" type="submit" disabled={adding}>
            {#snippet icon()}<Icon name="plus" />{/snippet}
            {adding ? "Adding…" : "Add trainer"}
          </Button>
          <span class="subtle" role="status" aria-live="polite">
            {#if addError}<span class="err">{addError}</span>
            {:else if attempted && missing}<span class="err">Add {missing} to continue</span>{/if}
          </span>
        </div>
        <div class="share">
          <span class="subtle">Then send them</span>
          <code>{loginUrl}</code>
          <Button small variant="ghost" type="button" onclick={copyLink}>{copied ? "Copied" : "Copy link"}</Button>
        </div>
      </form>
    </Panel>

    {#if trainers === null}
      <SkeletonPanel height={60} />
    {:else}
      <Panel title="Accounts" count={trainers.length}>
        <ul class="accounts">
          {#each sorted as t (t.id)}
            <li class:dim={t.access === "disabled"} class:fresh={t.id === addedId}>
              <span class="face">
                {#if t.avatarUrl}
                  <img src={t.avatarUrl} alt="" referrerpolicy="no-referrer" />
                {:else}
                  <Avatar name={t.name} />
                {/if}
              </span>
              <div class="who">
                <div class="line">
                  <strong>{t.name}</strong>
                  <Pill tone={ACCESS[t.access].tone}>{ACCESS[t.access].label}</Pill>
                  {#if t.isAdmin}<Pill>Admin</Pill>{/if}
                </div>
                <div class="subtle">{t.email}</div>
                <div class="meta">
                  {lastSeen(t)} ·
                  {#if t.clientCount > 0}
                    <a href={`/admin/clients?trainer=${t.id}`}>{t.clientCount} {t.clientCount === 1 ? "client" : "clients"}</a>
                  {:else}0 clients{/if}
                </div>
                {#if rowError?.id === t.id}<p class="err" role="alert">{rowError.text}</p>{/if}
              </div>
              <div class="acts">
                {#if t.isAdmin}
                  <span class="subtle lockd" title="The admin can't be disabled">
                    <Icon name="lock" size={12} /> Always on
                  </span>
                {:else if t.access === "disabled"}
                  <Button small disabled={busy === t.id} onclick={() => setDisabled(t, false)}>Turn access on</Button>
                {:else}
                  <ConfirmButton
                    small
                    label="Disable"
                    confirmLabel="Sign out & block?"
                    disabled={busy === t.id}
                    onconfirm={() => setDisabled(t, true)}
                  />
                {/if}
                {#if t.access === "invited" && t.clientCount === 0 && !t.isAdmin}
                  <ConfirmButton
                    small
                    variant="ghost"
                    label="Remove"
                    confirmLabel="Remove invite?"
                    disabled={busy === t.id}
                    onconfirm={() => remove(t)}
                  />
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      </Panel>
    {/if}
  </div>

  <div class="dataset">
    {#if llmStatsError}
      <Note tone="bad">Couldn't load AI dataset counts — {llmStatsError}.</Note>
    {:else if llmStats}
      <LlmDatasetPanel stats={llmStats} />
    {:else}
      <SkeletonPanel height={60} />
    {/if}
  </div>
{/if}

<style>
  .dataset {
    margin-top: 18px;
    max-width: var(--measure-form);
  }
  .cols {
    display: grid;
    gap: 18px;
    max-width: var(--measure-form);
  }

  .add {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .lede {
    margin: 0;
    color: var(--muted);
    font-size: 14px;
    line-height: 1.5;
  }
  .fields {
    display: grid;
    grid-template-columns: 1fr 1.3fr;
    gap: 12px;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }
  .err {
    color: var(--bad);
    margin: 0;
    font-size: 13px;
  }
  .share {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding-top: 12px;
    border-top: 1px solid var(--line-soft);
    font-size: 13px;
  }
  .share code {
    font: 12px/1.4 var(--font-mono);
    background: var(--well);
    border: 1px solid var(--line-soft);
    border-radius: 4px;
    padding: 2px 6px;
  }

  .accounts {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .accounts li {
    display: grid;
    grid-template-columns: 32px 1fr auto;
    gap: 12px;
    align-items: start;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line-soft);
    transition: background-color 600ms ease-out;
  }
  .accounts li:last-child {
    border-bottom: none;
  }
  .accounts li.fresh {
    background: var(--good-bg);
  }
  .accounts li.dim .who {
    color: var(--muted);
  }
  .face img,
  .face :global(*) {
    width: 32px;
    height: 32px;
    border-radius: 99px;
  }
  .face img {
    display: block;
    object-fit: cover;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .meta {
    margin-top: 2px;
    font-size: 12px;
    color: var(--faint);
  }
  .acts {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .lockd {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }

  @media (max-width: 640px) {
    .fields {
      grid-template-columns: 1fr;
    }
    .accounts li {
      grid-template-columns: 32px 1fr;
    }
    .acts {
      grid-column: 2;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .accounts li {
      transition: none;
    }
  }
</style>
