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

  let saving = $state(false);
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
    saving = true;
    createError = null;
    try {
      const created = await api.createClient({ name: name.trim(), email: email.trim() || null, phone: phonePayload(phone), ...profilePayload(profile) });
      autosave = false;
      clearTimeout(saveTimer);
      clearNewClientDraft(draftKey);
      goto(`/clients/${created.id}`);
    } catch (err) {
      createError = (err as Error).message;
    } finally {
      saving = false;
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

    <ClientProfileFields bind:form={profile} idPrefix="f" collapsible {catalog} />

    <div class="pf-foot">
      <Button variant="primary" type="submit" disabled={saving}>{saving ? "Adding…" : "Add client"}</Button>
      <Button variant="ghost" type="button" onclick={cancel}>Cancel</Button>
      <span class="subtle" role="status" aria-live="polite">
        {#if createError}<span class="err">Couldn't add the client — {createError}. Your entries are kept; try again.</span>
        {:else if attempted && missing}<span class="err">Add {missing} to continue</span>
        {:else if attempted && basicsInvalid(profile)}<span class="err">Fix the basics marked above to continue</span>
        {:else}Opens their page next — no program is created yet{/if}
      </span>
    </div>
  </form>
</div>

<style>
  :global(.note.draft-note) { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
</style>
