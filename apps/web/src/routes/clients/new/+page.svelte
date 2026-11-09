<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate, goto } from "$app/navigation";
  import { api, apiMode } from "$lib/api";
  import type { ExerciseDto } from "$lib/api/types";
  import ClientProfileFields from "$lib/components/ClientProfileFields.svelte";
  import ClientIdentityFields from "$lib/components/ClientIdentityFields.svelte";
  import { basicsInvalid, emailError, emptyProfile, nameError, phonePayload, profilePayload } from "$lib/clientProfile";
  import { clearNewClientDraft, newClientDraftKey, readNewClientDraft, saveNewClientDraft } from "$lib/newClientDraft";
  import Button from "$lib/ui/Button.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import ProfileSection from "$lib/components/ProfileSection.svelte";

  const session = page.data.session;
  const draftKey = newClientDraftKey(apiMode, session?.kind === "signedIn" ? session.trainer.id : null);

  /** Which add button is running: "page" opens the client, "generate" goes on to draft their first program. */
  let saving = $state<"page" | "generate" | null>(null);
  let name = $state("");
  let email = $state("");
  let phone = $state("");
  let profile = $state(emptyProfile());
  /** Exercise catalog for the 1RM rows — they appear once it loads; the rest of the form works without it. */
  let catalog = $state<ExerciseDto[] | null>(null);
  let createError = $state<string | null>(null);
  /** Set by a submit attempt: shows every field error at once. */
  let attempted = $state(false);
  let restored = $state(false);
  /** Off until the stored draft has been read, and once the client is created. */
  let autosave = $state(false);
  /** True when the user arrived from another in-app page, so Back returns there. */
  let cameFromApp = false;
  const missing = $derived(nameError(name) ? "a name" : emailError(email) ? "a valid email" : null);

  afterNavigate(({ from, type }) => {
    cameFromApp = type !== "enter" && from != null;
  });

  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (!autosave) return;
    const draft = $state.snapshot({ name, email, phone, profile });
    clearTimeout(saveTimer);
    // No teardown clear: a save still pending when the page closes must land.
    saveTimer = setTimeout(() => saveNewClientDraft(draftKey, draft), 300);
  });

  function reset() {
    name = "";
    email = "";
    phone = "";
    profile = emptyProfile();
    createError = null;
    attempted = false;
  }

  function discard() {
    clearTimeout(saveTimer);
    clearNewClientDraft(draftKey);
    reset();
    restored = false;
    document.getElementById("f-name")?.focus();
  }

  /** Cancel throws the form away — no confirm — and returns where the user came from. */
  function cancel() {
    autosave = false;
    clearTimeout(saveTimer);
    clearNewClientDraft(draftKey);
    if (cameFromApp) history.back();
    else goto("/clients");
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    // Enter in a field submits via the first submit button: "Add client".
    const then = (e.submitter as HTMLButtonElement | null)?.value === "generate" ? "generate" : "page";
    if (missing) {
      attempted = true;
      await tick();
      document.getElementById(nameError(name) ? "f-name" : "f-email")?.focus();
      return;
    }
    if (basicsInvalid(profile)) {
      attempted = true;
      document.querySelector<HTMLElement>('.newclient [aria-invalid="true"]')?.focus();
      return;
    }
    saving = then;
    createError = null;
    try {
      const created = await api.createClient({ name: name.trim(), email: email.trim() || null, phone: phonePayload(phone), ...profilePayload(profile) });
      autosave = false;
      clearTimeout(saveTimer);
      clearNewClientDraft(draftKey);
      goto(then === "generate" ? `/clients/${created.id}/generate` : `/clients/${created.id}`);
    } catch (err) {
      createError = (err as Error).message;
    } finally {
      saving = null;
    }
  }

  onMount(() => {
    api.exercises().then(
      (list) => (catalog = list),
      () => {} // no catalog → no 1RM rows; they can be added later on the Profile tab
    );
    const draft = readNewClientDraft(draftKey);
    if (draft) {
      name = draft.name;
      email = draft.email;
      phone = draft.phone;
      profile = draft.profile;
      restored = true;
    }
    autosave = true;
    document.getElementById("f-name")?.focus();
  });
</script>

<svelte:head><title>New client · Program Tracker</title></svelte:head>

<Crumbs items={[{ href: "/clients", label: "Clients" }, { label: "New client" }]} />
<PageHead title="New client" />

{#if restored}
  <Note tone="ok" role="status" class="draft-note">
    Draft restored ·
    <Button small variant="ghost" onclick={discard}>Discard</Button>
  </Note>
{/if}

<div
  class="newclient"
  role="presentation"
  onkeydown={(e) => {
    if (e.key !== "Escape" || e.defaultPrevented) return;
    e.preventDefault();
    cancel();
  }}
>
  <form class="pf" onsubmit={submit} novalidate>
    <ProfileSection title="Contact" purpose="how you reach them">
      <ClientIdentityFields bind:name bind:email bind:phone idPrefix="f" showAll={attempted} />
    </ProfileSection>

    <ClientProfileFields bind:form={profile} idPrefix="f" compact1rm {catalog} />

    <div class="savebar addbar" role="region" aria-label="Add client">
      <span class="savemsg" role="status" aria-live="polite">
        {#if createError}<span class="err">Couldn't add the client — {createError}. Your entries are kept; try again.</span>
        {:else if attempted && missing}<span class="err">Add {missing} to continue</span>
        {:else if attempted && basicsInvalid(profile)}<span class="err">Fix the basics marked above to continue</span>
        {:else}<span class="addbar-hint">Add client opens their page · Add &amp; generate drafts their first program</span>{/if}
      </span>
      <span class="addbar-actions">
        <Button small variant="ghost" type="button" onclick={cancel}>Cancel</Button>
        <Button small type="submit" name="then" value="page" disabled={saving != null}>{saving === "page" ? "Adding…" : "Add client"}</Button>
        <Button small variant="primary" type="submit" name="then" value="generate" disabled={saving != null}>
          {saving === "generate" ? "Adding…" : "Add & generate program"}
        </Button>
      </span>
    </div>
  </form>
</div>

<style>
  .addbar { flex-wrap: wrap; row-gap: 8px; }
  .addbar-actions { display: flex; gap: 8px; margin-left: auto; }
  /* The column reaches the fixed Feedback launcher below ~1100px: sit above it. */
  @media (max-width: 1100px) { .addbar { bottom: 60px; } }
  @media (max-width: 700px) {
    /* Phones: the neutral hint gives way to the buttons; errors still show. */
    .addbar .savemsg { flex-basis: 100%; }
    .addbar .savemsg:has(.addbar-hint) { display: none; }
    .addbar-actions { flex: 1; flex-wrap: wrap; justify-content: flex-end; margin-left: 0; }
    .addbar-actions :global(.btn.primary) { order: -1; flex: 1 1 100%; justify-content: center; }
  }
  :global(.note.draft-note) { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
</style>
