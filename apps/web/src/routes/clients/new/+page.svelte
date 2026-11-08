<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate, goto } from "$app/navigation";
  import { api, apiMode } from "$lib/api";
  import ClientProfileFields from "$lib/components/ClientProfileFields.svelte";
  import ClientIdentityFields from "$lib/components/ClientIdentityFields.svelte";
  import { emailError, emptyProfile, nameError, profilePayload } from "$lib/clientProfile";
  import { clearNewClientDraft, newClientDraftKey, readNewClientDraft, saveNewClientDraft } from "$lib/newClientDraft";
  import Button from "$lib/ui/Button.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";

  const session = page.data.session;
  const draftKey = newClientDraftKey(apiMode, session?.kind === "signedIn" ? session.trainer.id : null);

  let saving = $state(false);
  let name = $state("");
  let email = $state("");
  let profile = $state(emptyProfile());
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
    const draft = $state.snapshot({ name, email, profile });
    clearTimeout(saveTimer);
    // No teardown clear: a save still pending when the page closes must land.
    saveTimer = setTimeout(() => saveNewClientDraft(draftKey, draft), 300);
  });

  function reset() {
    name = "";
    email = "";
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
    saving = true;
    createError = null;
    try {
      const created = await api.createClient({ name: name.trim(), email: email.trim(), ...profilePayload(profile) });
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
    const draft = readNewClientDraft(draftKey);
    if (draft) {
      name = draft.name;
      email = draft.email;
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
  <Panel title="Client details">
    <form class="panel-body pf" onsubmit={submit} novalidate>
      <section class="pf-sec">
        <h3>Client</h3>
        <ClientIdentityFields bind:name bind:email idPrefix="f" showAll={attempted} />
      </section>

      <ClientProfileFields bind:form={profile} idPrefix="f" collapsible />

      <div class="pf-foot">
        <Button variant="primary" type="submit" disabled={saving}>{saving ? "Adding…" : "Add client"}</Button>
        <Button variant="ghost" type="button" onclick={cancel}>Cancel</Button>
        <span class="subtle" role="status" aria-live="polite">
          {#if createError}<span class="err">Couldn't add the client — {createError}. Your entries are kept; try again.</span>
          {:else if attempted && missing}<span class="err">Add {missing} to continue</span>
          {:else}Opens their page next — no program is created yet{/if}
        </span>
      </div>
    </form>
  </Panel>
</div>

<style>
  :global(.note.draft-note) { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
  /* On wide screens the form sections pair up (Client | Schedule, Cardio | For the AI). */
  @media (min-width: 1360px) {
    .newclient :global(.pf) { max-width: none; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 40px; align-items: start; }
    .newclient :global(.pf > .more), .newclient :global(.pf > .pf-foot) { grid-column: 1 / -1; justify-self: stretch; }
    .newclient :global(.pf > .more) { justify-self: start; }
  }
</style>
