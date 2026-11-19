<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { apiMode } from "$lib/api";
  import { adminApi, type TrainerAccount } from "$lib/api/admin";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Avatar from "$lib/ui/Avatar.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import { viewAs } from "$lib/viewAs.svelte";

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ACCESS = {
    active: { tone: "good", label: "Active" },
    invited: { tone: "neutral", label: "Invited" },
    disabled: { tone: "bad", label: "Disabled" },
  } as const;
  const RANK = { active: 0, invited: 1, disabled: 2 } as const;

  let trainers = $state<TrainerAccount[] | null>(null);
  let loadError = $state<string | null>(null);

  let name = $state("");
  let email = $state("");
  let adding = $state(false);
  let addError = $state<string | null>(null);
  let attempted = $state(false);
  /** The just-added row, to point at it. */
  let addedId = $state<string | null>(null);
  /** Who was just added: the form gives way to the hand-over until "Add another". */
  let added = $state<{ name: string; email: string } | null>(null);
  /** Per-row action in flight / its error. */
  let busy = $state<string | null>(null);
  let rowError = $state<{ id: string; text: string } | null>(null);
  let copied = $state(false);
  let copyFailed = $state(false);

  const nameErr = $derived(!name.trim() ? "Add their name" : undefined);
  const emailErr = $derived(
    !email.trim() ? "Add the Google email they'll sign in with" : !EMAIL.test(email.trim()) ? "That isn't an email address" : undefined,
  );
  /** Polite announcement: the hand-over after an add, then the copy. */
  const announce = $derived(
    copyFailed ? "Couldn't copy the sign-in link" : copied ? "Sign-in link copied" : added ? `Added ${added.name}, ${added.email}` : "",
  );
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
  /** The view-as switch is on (Settings → Admin → Features). */
  const canViewAs = $derived(page.data.session?.kind === "signedIn" && page.data.session.flags?.impersonation === true);

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
    if (nameErr || emailErr) {
      attempted = true;
      await tick();
      document.getElementById(nameErr ? "t-name" : "t-email")?.focus();
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
      added = { name: created.name, email: created.email };
      name = "";
      email = "";
      attempted = false;
      copied = false;
      copyFailed = false;
      await tick();
      document.getElementById("t-copy")?.focus();
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
    try {
      await navigator.clipboard.writeText(loginUrl);
      copyFailed = false;
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      copyFailed = true;
    }
  }

  async function addAnother() {
    added = null;
    copied = false;
    copyFailed = false;
    await tick();
    document.getElementById("t-name")?.focus();
  }

  const fmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
  function lastSeen(t: TrainerAccount): string {
    if (!t.lastSignInAt) return t.access === "invited" ? `Added ${fmt.format(new Date(t.createdAt))}` : "No sign-in yet";
    const days = Math.floor((Date.now() - new Date(t.lastSignInAt).getTime()) / 86_400_000);
    return `Signed in ${days === 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : fmt.format(new Date(t.lastSignInAt))}`;
  }

  onMount(() => {
    if (apiMode === "live") load();
  });
</script>

<svelte:head><title>Trainers · Program Tracker</title></svelte:head>

<PageHead title="Trainers" sub={summary} />
{#if viewAs.error && !viewAs.view}
  <Note tone="bad" role="alert">Couldn't view as that trainer: {viewAs.error}</Note>
{/if}

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
      <p class="sr-only" role="status" aria-live="polite">{announce}</p>
      {#if added}
        <div class="panel-body add done">
          <p class="added"><strong>Added {added.name}</strong> — <span class="addr">{added.email}</span></p>
          <p class="lede">
            We don't email them. Send them the sign-in link — they'll show as Invited until they first sign in with
            this Google account.
          </p>
          <div class="foot">
            <Button id="t-copy" variant="primary" onclick={copyLink}>
              {#snippet icon()}<Icon name={copied ? "check" : "link"} />{/snippet}
              {copied ? "Copied" : "Copy sign-in link"}
            </Button>
            <Button onclick={addAnother}>
              {#snippet icon()}<Icon name="plus" />{/snippet}
              Add another
            </Button>
          </div>
          {#if copyFailed}<p class="subtle">Couldn't copy — the link is <code>{loginUrl}</code></p>{/if}
          <div class="share">
            <a href="/settings#login-page">Restyle the sign-in page</a>
          </div>
        </div>
      {:else}
        <form class="panel-body add" onsubmit={add} novalidate>
          <p class="lede">
            Adding someone lets them in with Google, using this email — no password. They show as Invited until their
            first sign-in.
          </p>
          <div class="fields">
            <Field label="Name" htmlFor="t-name" error={attempted ? nameErr : undefined}>
              <input
                class="input"
                id="t-name"
                bind:value={name}
                maxlength="120"
                autocomplete="off"
                placeholder="Full name"
                aria-invalid={attempted && nameErr ? "true" : undefined}
                aria-describedby={attempted && nameErr ? "t-name-err" : undefined}
              />
            </Field>
            <Field label="Google email" htmlFor="t-email" error={attempted ? emailErr : undefined}>
              <input
                class="input"
                id="t-email"
                type="email"
                bind:value={email}
                maxlength="254"
                autocomplete="off"
                placeholder="name@gmail.com"
                aria-invalid={attempted && emailErr ? "true" : undefined}
                aria-describedby={attempted && emailErr ? "t-email-err" : undefined}
              />
            </Field>
          </div>
          <div class="foot">
            <Button variant="primary" type="submit" disabled={adding}>
              {#snippet icon()}<Icon name="plus" />{/snippet}
              {adding ? "Adding…" : "Add trainer"}
            </Button>
          </div>
          {#if addError}<p class="err" role="alert">Couldn't add them — {addError}</p>{/if}
          <div class="share">
            <Button small variant="ghost" type="button" onclick={copyLink}>
              {#snippet icon()}<Icon name={copied ? "check" : "link"} />{/snippet}
              {copied ? "Copied" : "Copy sign-in link"}
            </Button>
            <a href="/settings#login-page">Restyle the sign-in page</a>
          </div>
          {#if copyFailed}<p class="subtle">Couldn't copy — the link is <code>{loginUrl}</code></p>{/if}
        </form>
      {/if}
    </Panel>

    {#if trainers === null}
      <SkeletonPanel title="Accounts" count rows={4} avatar={32} label="Loading trainers…" />
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
                  <strong><a class="name-link" href="/admin/trainers/{t.id}">{t.name}</a></strong>
                  <Pill tone={ACCESS[t.access].tone}>{ACCESS[t.access].label}</Pill>
                  {#if t.isAdmin}<Pill>Admin</Pill>{/if}
                </div>
                <div class="subtle">{t.email}</div>
                <div class="meta">
                  {lastSeen(t)} ·
                  {#if t.clientCount > 0}
                    <a href={`/admin/clients?trainer=${t.id}`}>{t.clientCount} {t.clientCount === 1 ? "client" : "clients"}</a>
                  {:else}0 clients{/if}
                  · <a class="log" href="/admin/trainers/{t.id}" aria-label="Access log for {t.name}">Access log</a>
                </div>
                {#if rowError?.id === t.id}<p class="err" role="alert">{rowError.text}</p>{/if}
              </div>
              <div class="acts">
                {#if canViewAs && !t.isAdmin && t.access !== "disabled"}
                  <Button
                    small
                    variant="ghost"
                    title="Open the app as {t.name}, read-only, for 30 minutes"
                    aria-label="View as {t.name}"
                    disabled={viewAs.busy}
                    onclick={() => viewAs.start(t.id)}
                  >
                    {#snippet icon()}<Icon name="eye" />{/snippet}
                    View as
                  </Button>
                {/if}
                {#if t.isAdmin}
                  <span class="subtle lockd" title="The admin's access can't be turned off">
                    <Icon name="lock" size={12} /> Always on
                  </span>
                {:else if t.access === "disabled"}
                  <Button
                    small
                    disabled={busy === t.id}
                    aria-label="Turn access on for {t.name}"
                    onclick={() => setDisabled(t, false)}>Turn access on</Button
                  >
                {:else}
                  <ConfirmButton
                    small
                    variant="default"
                    armedVariant="danger"
                    label="Turn access off"
                    confirmLabel={t.access === "invited" ? "Block sign-in?" : "Sign out & block?"}
                    subject={t.name}
                    disabled={busy === t.id}
                    onconfirm={() => setDisabled(t, true)}
                  />
                {/if}
                {#if t.access === "invited" && t.clientCount === 0 && !t.isAdmin}
                  <ConfirmButton
                    small
                    label="Remove"
                    confirmLabel="Remove invite?"
                    subject={t.name}
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
{/if}

<style>
  .name-link {
    color: inherit;
    text-underline-offset: 3px;
  }
  .name-link:hover,
  .name-link:focus-visible {
    color: var(--blue);
    text-decoration: underline;
  }
  .meta .log {
    color: var(--muted);
  }
  .meta .log:hover,
  .meta .log:focus-visible {
    color: var(--blue);
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
  .added {
    margin: 0;
    font-size: 15px;
    line-height: 1.4;
  }
  .added .addr {
    color: var(--muted);
  }
  .share {
    justify-content: space-between;
  }
  .add code {
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
    grid-template-columns: 32px minmax(0, 1fr) auto;
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
  .who {
    min-width: 0;
    overflow-wrap: anywhere;
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

  /* Wide enough for both: the add form leads on the left, accounts take the room beside it.
     Same order as the DOM and the stacked layout, so tab order follows the eye. */
  @container main (min-width: 880px) {
    .cols {
      max-width: 1120px;
      grid-template-columns: 320px minmax(0, 1fr);
      align-items: start;
    }
    .cols > :global(.addp) {
      position: sticky;
      top: 16px;
    }
    .fields {
      grid-template-columns: 1fr;
    }
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
