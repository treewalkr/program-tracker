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
  import Counter from "$lib/ui/Counter.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Avatar from "$lib/ui/Avatar.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import ListToolbar from "$lib/ui/ListToolbar.svelte";
  import SelectPrefixed from "$lib/ui/SelectPrefixed.svelte";
  import { viewAs } from "$lib/viewAs.svelte";

  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ACCESS = {
    active: { tone: "good", label: "Active" },
    invited: { tone: "neutral", label: "Invited" },
    disabled: { tone: "bad", label: "Disabled" },
  } as const;
  const RANK = { active: 0, invited: 1, disabled: 2 } as const;
  type Show = "all" | TrainerAccount["access"];
  const SHOW: { value: Show; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "invited", label: "Invited" },
    { value: "disabled", label: "Disabled" },
  ];
  type Act = "off" | "on" | "remove";
  const WORKING: Record<Act, string> = { off: "Turning off…", on: "Turning on…", remove: "Removing…" };
  /** The server's error, said for a trainer: what happened and what to do next. */
  function plain(act: Act, detail: string): string {
    if (/not found/i.test(detail)) return "This account is gone — reload the page to see the latest list.";
    if (/signed in/i.test(detail)) return "They've signed in since this list loaded — turn their access off instead.";
    if (/has clients/i.test(detail)) return "They have clients now — turn their access off instead.";
    if (/can't be disabled/i.test(detail)) return "The admin's access always stays on.";
    const what = act === "remove" ? "remove the invite" : `turn access ${act}`;
    return `Couldn't ${what} — check your connection and try again.`;
  }
  type Sort = "access" | "name" | "signin";
  const SORTS: { value: Sort; label: string }[] = [
    { value: "access", label: "Access" },
    { value: "name", label: "Name" },
    { value: "signin", label: "Last sign-in" },
  ];
  /** No sign-in for this long marks an active trainer Inactive. */
  const INACTIVE_DAYS = 30;
  /** Past this many, disabled accounts fold away under "Show N disabled" in the All view. */
  const FOLD_DISABLED = 3;

  let trainers = $state<TrainerAccount[] | null>(null);
  let loadError = $state<string | null>(null);

  let name = $state("");
  let email = $state("");
  let adding = $state(false);
  let addError = $state<string | null>(null);
  /**
   * Errors as shown: set on submit and on blur, so the alert isn't re-read on
   * every keystroke. Typing only clears one once the field is valid.
   */
  let errs = $state<{ name?: string; email?: string }>({});
  /** A submit failed: from then on, blur re-checks a field. */
  let attempted = $state(false);
  /** The just-added row, to point at it. */
  let addedId = $state<string | null>(null);
  /** Who was just added: the form gives way to the hand-over until "Add another". */
  let added = $state<{ name: string; email: string } | null>(null);
  /** Per-row action in flight / its error. */
  let busy = $state<{ id: string; act: Act } | null>(null);
  /** `detail` is the server's own words, kept for the tooltip and console. */
  let rowError = $state<{ id: string; text: string; detail: string } | null>(null);
  let copied = $state(false);
  let show = $state<Show>("all");
  let showDisabled = $state(false);
  let search = $state("");
  let sort = $state<Sort>("access");
  let copyFailed = $state(false);

  const nameErr = $derived(!name.trim() ? "Add their name" : undefined);
  const emailErr = $derived(
    !email.trim() ? "Add the Google email they'll sign in with" : !EMAIL.test(email.trim()) ? "That isn't an email address" : undefined,
  );
  /** The snapshot, dropped (silently) as soon as the field is valid. */
  const shownErr = $derived({ name: nameErr && errs.name, email: emailErr && errs.email });

  /** Polite announcement: the hand-over after an add, then the copy. */
  const announce = $derived(
    copyFailed ? "Couldn't copy the sign-in link" : copied ? "Sign-in link copied" : added ? `Added ${added.name}, ${added.email}` : "",
  );
  const byAccess = (a: TrainerAccount, b: TrainerAccount) =>
    Number(b.isAdmin) - Number(a.isAdmin) || RANK[a.access] - RANK[b.access] || a.name.localeCompare(b.name);
  /** Most recent first; never signed in goes last. */
  const bySignIn = (a: TrainerAccount, b: TrainerAccount) =>
    (b.lastSignInAt ?? "").localeCompare(a.lastSignInAt ?? "") || a.name.localeCompare(b.name);
  const sorted = $derived(
    [...(trainers ?? [])].sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name) : sort === "signin" ? bySignIn : byAccess),
  );
  const needle = $derived(search.trim().toLowerCase());
  const counts = $derived.by(() => {
    const c = { all: 0, active: 0, invited: 0, disabled: 0 };
    for (const t of trainers ?? []) {
      c.all++;
      c[t.access]++;
    }
    return c;
  });
  /** The All view folds disabled accounts away once there are more than a few. */
  const folded = $derived(show === "all" && !needle && counts.disabled > FOLD_DISABLED && !showDisabled);
  const shown = $derived(
    sorted.filter(
      (t) =>
        (show === "all" ? !(folded && t.access === "disabled") : t.access === show) &&
        (!needle || t.name.toLowerCase().includes(needle) || t.email.toLowerCase().includes(needle)),
    ),
  );
  const summary = $derived.by(() => {
    if (!trainers) return "Who can sign in to Program Tracker";
    return [
      `${counts.active} active`,
      counts.invited && `${counts.invited} invited`,
      counts.disabled && `${counts.disabled} disabled`,
    ]
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
      errs = { name: nameErr, email: emailErr };
      await tick();
      document.getElementById(nameErr ? "t-name" : "t-email")?.focus();
      return;
    }
    adding = true;
    addError = null;
    try {
      const created = await adminApi.addTrainer({ name: name.trim(), email: email.trim() });
      trainers = [...(trainers ?? []), created];
      if (show !== "all" && show !== created.access) show = "all";
      addedId = created.id;
      setTimeout(() => {
        if (addedId === created.id) addedId = null;
      }, 2500);
      added = { name: created.name, email: created.email };
      name = "";
      email = "";
      errs = {};
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

  /** Polite announcement for row changes; set to "" first so a repeat is read again. */
  let rowSaid = $state("");
  async function say(text: string) {
    rowSaid = "";
    await tick();
    rowSaid = text;
  }

  /**
   * A row action can replace its button or take the row out of the filtered
   * list; either way focus would fall to <body>. Land it on the row's access
   * button if the row is still shown, else on the next row's (the previous
   * one at the end), else on the list itself.
   */
  async function refocus(id: string, before: string[], from: Element | null) {
    await tick();
    if (from instanceof HTMLElement && from.isConnected && from !== document.body) return from.focus();
    const list = document.getElementById("t-list");
    const row = (rid: string) => list?.querySelector<HTMLElement>(`li[data-id="${rid}"]`);
    const target = (li: HTMLElement | null | undefined) =>
      li?.querySelector<HTMLElement>(".access button, .acts button") ?? li?.querySelector<HTMLElement>("a");
    const still = row(id);
    if (still) return target(still)?.focus();
    const at = before.indexOf(id);
    const after = shown.map((x) => x.id);
    const next = before.slice(at + 1).find((x) => after.includes(x)) ?? before.slice(0, at).reverse().find((x) => after.includes(x));
    const el = next ? target(row(next)) : null;
    (el ?? list)?.focus();
  }

  async function run(t: TrainerAccount, act: Act, action: () => Promise<TrainerAccount | null>, done: string) {
    busy = { id: t.id, act };
    rowError = null;
    const before = shown.map((x) => x.id);
    const from = document.activeElement;
    try {
      const next = await action();
      trainers = next ? trainers!.map((x) => (x.id === t.id ? next : x)) : trainers!.filter((x) => x.id !== t.id);
      const gone = !shown.some((x) => x.id === t.id);
      const where = show === "all" ? "folded away with the disabled accounts" : `no longer shown under ${SHOW.find((f) => f.value === show)?.label}`;
      say(gone && next ? `${done}, ${where}` : done);
      busy = null;
      await refocus(t.id, before, from);
    } catch (err) {
      const detail = (err as Error).message;
      console.warn(`Trainer ${act} failed for ${t.id}:`, detail);
      rowError = { id: t.id, text: plain(act, detail), detail };
      busy = null;
      await refocus(t.id, before, from);
    } finally {
      busy = null;
    }
  }
  const setDisabled = (t: TrainerAccount, disabled: boolean) =>
    run(t, disabled ? "off" : "on", () => adminApi.updateTrainer(t.id, { disabled }), `Turned access ${disabled ? "off" : "on"} for ${t.name}`);
  const remove = (t: TrainerAccount) =>
    run(t, "remove", async () => (await adminApi.removeTrainer(t.id), null), `Removed ${t.name}'s invite`);

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
  /** "today" · "yesterday" · "7 days ago" · "Nov 9, 2026" past a month — the same scale for every row. */
  function ago(iso: string): string {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
    return days <= 0 ? "today" : days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : fmt.format(new Date(iso));
  }
  /** Invites nobody has used and nothing hangs off: safe to remove in one go. */
  const unused = $derived((trainers ?? []).filter((t) => t.access === "invited" && t.clientCount === 0 && !t.isAdmin));
  /** Bulk removal in flight: how far along. */
  let sweeping = $state<{ done: number; of: number } | null>(null);
  let sweepError = $state<{ text: string; detail: string } | null>(null);

  /** One DELETE per invite — the server re-checks each (never signed in, no clients, not the admin). */
  async function removeUnused() {
    const batch = [...unused];
    sweeping = { done: 0, of: batch.length };
    sweepError = null;
    const failed: { t: TrainerAccount; detail: string }[] = [];
    for (const t of batch) {
      try {
        await adminApi.removeTrainer(t.id);
        trainers = trainers!.filter((x) => x.id !== t.id);
      } catch (err) {
        failed.push({ t, detail: (err as Error).message });
      }
      sweeping = { done: sweeping.done + 1, of: batch.length };
    }
    sweeping = null;
    const removed = batch.length - failed.length;
    if (failed.length) {
      const detail = failed.map((f) => `${f.t.name}: ${f.detail}`).join("; ");
      console.warn("Removing unused invites:", detail);
      sweepError = {
        text: `Removed ${removed} of ${batch.length}. ${failed.map((f) => f.t.name).join(", ")} couldn't be removed — they may have signed in or gained clients since. Reload to see the latest.`,
        detail,
      };
    }
    say(`Removed ${removed} unused ${removed === 1 ? "invite" : "invites"}${failed.length ? `, ${failed.length} failed` : ""}`);
    await tick();
    (document.querySelector<HTMLElement>("#t-sweep button") ?? document.getElementById("t-list"))?.focus();
  }

  /** Active, but no sign-in for over a month. */
  const inactive = (t: TrainerAccount) =>
    t.access === "active" && !!t.lastSignInAt && Date.now() - new Date(t.lastSignInAt).getTime() > INACTIVE_DAYS * 86_400_000;
  /** The row's last-seen line and its full date for the tooltip. */
  function lastSeen(t: TrainerAccount): { text: string; title: string } {
    if (t.lastSignInAt) return { text: `Signed in ${ago(t.lastSignInAt)}`, title: fmt.format(new Date(t.lastSignInAt)) };
    return { text: `Added ${ago(t.createdAt)}, no sign-in yet`, title: fmt.format(new Date(t.createdAt)) };
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
    <p class="sr-only" role="status" aria-live="polite">{announce}</p>
    <p class="sr-only" role="status" aria-live="polite">{rowSaid}</p>
    <Panel title="Add a trainer" class="addp">
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
            first sign-in. <a class="how" href="/guide/trainer-access">How trainer access works</a>
          </p>
          <div class="fields">
            <Field label="Name" htmlFor="t-name" error={shownErr.name}>
              <input
                class="input"
                id="t-name"
                bind:value={name}
                maxlength="120"
                autocomplete="off"
                placeholder="Full name"
                onblur={() => attempted && (errs.name = nameErr)}
                aria-invalid={shownErr.name ? "true" : undefined}
                aria-describedby={shownErr.name ? "t-name-err" : undefined}
              />
            </Field>
            <Field label="Google email" htmlFor="t-email" error={shownErr.email}>
              <input
                class="input"
                id="t-email"
                type="email"
                bind:value={email}
                maxlength="254"
                autocomplete="off"
                placeholder="name@gmail.com"
                onblur={() => attempted && (errs.email = emailErr)}
                aria-invalid={shownErr.email ? "true" : undefined}
                aria-describedby={shownErr.email ? "t-email-err" : undefined}
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
      <div class="acc">
      <ListToolbar
        bind:value={search}
        label="Search trainers"
        placeholder="Search by name or email"
        count={needle ? `${shown.length} of ${show === "all" ? counts.all : counts[show]}` : undefined}
      >
        {#snippet filters()}
          <div class="sort"><SelectPrefixed prefix="Sort" options={SORTS} bind:value={sort} /></div>
        {/snippet}
      </ListToolbar>
      <Panel aria-label="Accounts" act={filters}>
        {#if shown.length === 0}
          <p class="panel-body subtle none">
            {needle ? `No ${show === "all" ? "" : `${show} `}trainers match “${search.trim()}”.` : `No ${show} trainers.`}
          </p>
        {/if}
        <ul class="accounts" id="t-list" tabindex="-1" aria-label="Trainer accounts">
          {#each shown as t (t.id)}
            {@const seen = lastSeen(t)}
            <li data-id={t.id} class:dim={t.access === "disabled"} class:fresh={t.id === addedId}>
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
                  {#if t.isAdmin}<span class="roletag" title="Platform admin: manages trainer accounts"
                      ><Icon name="gear" size={12} />Admin</span
                    >{/if}
                </div>
                <div class="subtle">{t.email}</div>
                <div class="meta">
                  {#if t.access === "disabled" && t.disabledAt}
                    <span class="offat" title="Access turned off {fmt.format(new Date(t.disabledAt))}"
                      >Access off {ago(t.disabledAt)}</span
                    > ·
                  {/if}
                  <span title={seen.title}>{seen.text}</span>
                  {#if inactive(t)}<span class="idle" title="No sign-in for over {INACTIVE_DAYS} days">Inactive</span>{/if} ·
                  {#if t.clientCount > 0}
                    <a href={`/admin/clients?trainer=${t.id}`}
                      ><span class="mono">{t.clientCount}</span> {t.clientCount === 1 ? "client" : "clients"}</a
                    >
                  {:else}<span><span class="mono">0</span> clients</span>{/if}
                  · <a class="log" href="/admin/trainers/{t.id}" aria-label="Access log for {t.name}">Access log</a>
                </div>
                {#if rowError?.id === t.id}<p class="err" role="alert" title={rowError.detail}>{rowError.text}</p>{/if}
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
                  <span class="access">
                    <Button
                      small
                      disabled={busy?.id === t.id}
                      aria-busy={busy?.id === t.id && busy.act === "on" ? "true" : undefined}
                      aria-label="{busy?.id === t.id && busy.act === 'on' ? WORKING.on : 'Turn access on'} for {t.name}"
                      onclick={() => setDisabled(t, false)}
                      >{busy?.id === t.id && busy.act === "on" ? WORKING.on : "Turn access on"}</Button
                    >
                  </span>
                {:else}
                  <span class="access">
                    <ConfirmButton
                      small
                      variant="default"
                      armedVariant="danger"
                      label={busy?.id === t.id && busy.act === "off" ? WORKING.off : "Turn access off"}
                      confirmLabel={t.access === "invited" ? "Block sign-in?" : "Sign out & block?"}
                      subject={t.name}
                      disabled={busy?.id === t.id}
                      onconfirm={() => setDisabled(t, true)}
                    />
                  </span>
                {/if}
                {#if t.access === "invited" && t.clientCount === 0 && !t.isAdmin}
                  <ConfirmButton
                    small
                    label={busy?.id === t.id && busy.act === "remove" ? WORKING.remove : "Remove"}
                    confirmLabel="Remove invite?"
                    subject={t.name}
                    disabled={busy?.id === t.id || !!sweeping}
                    onconfirm={() => remove(t)}
                  />
                {/if}
              </div>
            </li>
          {/each}
        </ul>
        {#if (unused.length > 1 || sweeping || sweepError) && !needle && (show === "all" || show === "invited")}
          <div class="sweep" id="t-sweep">
            {#if unused.length > 1 || sweeping}
              <ConfirmButton
                small
                variant="default"
                armedVariant="danger"
                label={sweeping ? `Removing ${sweeping.done + 1} of ${sweeping.of}…` : `Remove ${unused.length} unused invites`}
                confirmLabel="Remove all {unused.length}?"
                disabled={!!sweeping}
                onconfirm={removeUnused}
              />
              <span class="subtle">
                Never signed in, no clients: {unused.map((t) => t.name).join(", ")}
              </span>
            {/if}
            {#if sweepError}<p class="err" role="alert" title={sweepError.detail}>{sweepError.text}</p>{/if}
          </div>
        {/if}
        {#if show === "all" && !needle && counts.disabled > FOLD_DISABLED}
          <div class="fold" class:open={!folded}>
            <Button small variant="ghost" aria-expanded={!folded} onclick={() => (showDisabled = !showDisabled)}>
              {#snippet icon()}<Icon name="chevron" />{/snippet}
              {folded ? `Show ${counts.disabled} disabled` : "Hide disabled"}
            </Button>
          </div>
        {/if}
      </Panel>
      </div>
      {#snippet filters()}
        <div class="states" role="group" aria-label="Show trainers">
          {#each SHOW as f (f.value)}
            <button type="button" class="state" class:on={show === f.value} aria-pressed={show === f.value} onclick={() => (show = f.value)}>
              {f.label}<Counter value={counts[f.value]} />
            </button>
          {/each}
        </div>
      {/snippet}
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
  .lede .how {
    color: var(--muted);
    text-decoration: underline;
    text-decoration-color: var(--line);
    text-underline-offset: 3px;
  }
  .lede .how:hover,
  .lede .how:focus-visible {
    color: var(--blue);
    text-decoration-color: currentColor;
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
    font-size: 14px;
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

  .states {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    margin: -4px -8px;
  }
  .state {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    border: 0;
    border-radius: 6px;
    background: none;
    font: 400 14px var(--font-ui);
    color: var(--muted);
    cursor: pointer;
  }
  .state:hover {
    color: var(--ink);
    background: var(--well-2);
  }
  .state.on {
    color: var(--ink);
    font-weight: 600;
  }
  .none {
    margin: 0;
  }
  /* Ghost buttons start flush with the text column above them */
  .share > :global(.btn.ghost),
  .fold > :global(.btn.ghost) {
    margin-left: -13px;
  }
  .sweep {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 12px;
    padding: 10px 16px;
    border-top: 1px solid var(--line-soft);
    font-size: 13px;
  }
  .sweep .err {
    flex-basis: 100%;
  }
  .fold {
    padding: 8px 16px;
    border-top: 1px solid var(--line-soft);
  }
  .fold.open :global(svg) {
    transform: rotate(180deg);
  }
  .accounts:focus {
    outline: none;
  }
  .accounts:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: -2px;
  }
  .access {
    display: contents;
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
  /* A role, not an access state: no pill, just a quiet icon and word */
  .roletag {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font: 500 12px/1.2 var(--font-ui);
    color: var(--muted);
  }
  .meta .offat {
    color: var(--muted);
  }
  /* Activity, not access: a small amber Label beside the sign-in date */
  .meta .idle {
    display: inline-block;
    margin-left: 4px;
    font: 500 11px/1.2 var(--font-ui);
    padding: 1px 6px;
    border-radius: 99px;
    border: 1px solid var(--warn-line);
    background: var(--warn-bg);
    color: var(--warn);
  }
  .acc {
    min-width: 0;
  }
  .sort {
    flex: 0 1 200px;
  }
  .meta > :global(*) {
    white-space: nowrap;
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
    .state {
      padding-inline: 6px;
    }
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
