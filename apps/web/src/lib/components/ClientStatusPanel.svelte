<script lang="ts">
  import { untrack } from "svelte";
  import type { ClientStatus } from "@pt/shared";
  import { api } from "$lib/api";
  import type { ClientDto } from "$lib/api/types";
  import ProfileSection from "./ProfileSection.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import SelectDescribed from "$lib/ui/SelectDescribed.svelte";
  import type { SelectOption } from "$lib/ui/select/options";

  /**
   * The member's status: Active, Paused or Archived. Active and Paused save as
   * soon as they're picked; Archived asks first, in the page, because it also
   * turns their portal off. Archiving is how a member is removed — there is no
   * hard delete. Saves on its own, outside the profile form.
   */
  interface Props {
    client: ClientDto;
    /** The server's updated client after a save. */
    onchange: (client: ClientDto) => void;
  }

  let { client, onchange }: Props = $props();

  const OPTIONS: SelectOption<ClientStatus>[] = [
    { value: "active", label: "Active", description: "Training now. Shown everywhere." },
    { value: "paused", label: "Paused", description: "Kept on your lists and marked paused." },
    { value: "archived", label: "Archived", description: "Hidden from Overview and the default Members list." },
  ];

  /** What the select shows; differs from the stored status only while the archive question is open. */
  let choice = $state<ClientStatus>(untrack(() => client.status));
  let confirming = $state(false);
  let busy = $state(false);
  let error = $state<string | null>(null);

  // Follow the stored status when it changes from outside this panel — only the status,
  // so saving the profile form below doesn't cancel an open archive question.
  const stored = $derived(client.status);
  $effect(() => {
    const status = stored;
    untrack(() => {
      choice = status;
      confirming = false;
    });
  });

  const firstName = $derived(client.name.trim().split(/\s+/)[0] ?? client.name);

  async function save(status: ClientStatus) {
    busy = true;
    error = null;
    try {
      onchange(await api.updateClient(client.id, { status }));
      confirming = false;
    } catch (e) {
      choice = client.status;
      confirming = false;
      error = (e as Error).message || "Could not save";
    } finally {
      busy = false;
    }
  }

  function pick(status: ClientStatus) {
    error = null;
    if (status === client.status) {
      confirming = false;
    } else if (status === "archived") {
      confirming = true;
    } else {
      save(status);
    }
  }

  function cancel() {
    choice = client.status;
    confirming = false;
  }
</script>

<ProfileSection title="Member status" purpose="who still shows up on your lists">
  <SelectDescribed label="Status" options={OPTIONS} bind:value={choice} onchange={pick} disabled={busy} />
  {#if confirming}
    <Note tone="warn" role="alert">
      <p class="ask">
        Archive {firstName}? This turns off their member portal: their link stops working and they're signed out.
        They disappear from Overview and the default Members list; their program and logs are kept.
        Set them back to Active any time — the portal stays off until you turn it on again.
      </p>
      <div class="acts">
        <Button small variant="ghost" type="button" disabled={busy} onclick={cancel}>Cancel</Button>
        <Button small variant="danger" type="button" disabled={busy} onclick={() => save("archived")}>
          {busy ? "Archiving…" : `Archive ${firstName}`}
        </Button>
      </div>
    </Note>
  {:else if client.status === "archived"}
    <p class="muted">{firstName} is archived: hidden from Overview and the default Members list, and their portal is off.</p>
  {/if}
  {#if error}<Note tone="bad" role="alert">{error}</Note>{/if}
</ProfileSection>

<style>
  .muted { margin: 0; font-size: 13px; color: var(--muted); }
  .ask { margin: 0 0 10px; font-size: 13px; line-height: 1.6; }
  .acts { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  .acts :global(.btn) { min-height: 32px; }
</style>
