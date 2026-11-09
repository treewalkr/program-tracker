<script lang="ts">
  import { deloadRulesText, type DeloadSettings } from "@pt/shared";
  import { api } from "$lib/api";
  import type { ClientDto } from "$lib/api/types";
  import { clientDeload } from "$lib/draftReview";
  import ProfileSection from "./ProfileSection.svelte";
  import DeloadRuleFields from "./DeloadRuleFields.svelte";
  import Button from "$lib/ui/Button.svelte";

  /**
   * The client's deload rule: their own override, or the trainer's default.
   * Edit opens the same five knobs as Settings; "Use my default" drops the override.
   */
  interface Props {
    client: ClientDto;
    /** The server's updated client after a save or reset. */
    onchange: (client: ClientDto) => void;
  }

  let { client, onchange }: Props = $props();

  const own = $derived(client.deloadSettings ?? null);
  const rule = $derived(clientDeload(client));

  let editing = $state(false);
  let draft = $state<DeloadSettings>({ ...clientDeload(null) });
  let busy = $state(false);
  let error = $state<string | null>(null);

  function edit() {
    draft = { ...$state.snapshot(rule) };
    error = null;
    editing = true;
  }

  async function run(call: () => Promise<ClientDto>) {
    busy = true;
    error = null;
    try {
      onchange(await call());
      editing = false;
    } catch (err) {
      error = (err as Error).message || "Could not save";
    } finally {
      busy = false;
    }
  }
</script>

<ProfileSection title="Deload rule" purpose="what their deload weeks do">
  {#if editing}
    <DeloadRuleFields bind:value={draft} idPrefix="client-deload" disabled={busy} />
    <div class="acts">
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      {#if own}
        <Button small variant="ghost" type="button" disabled={busy} onclick={() => run(() => api.resetClientDeload(client.id))}>Use my default</Button>
      {/if}
      <Button small variant="ghost" type="button" disabled={busy} onclick={() => (editing = false)}>Cancel</Button>
      <Button small type="button" disabled={busy} onclick={() => run(() => api.setClientDeload(client.id, $state.snapshot(draft)))}>
        {busy ? "Saving…" : "Save rule"}
      </Button>
    </div>
  {:else}
    <div class="row">
      <p class="now">
        <span class="who" class:own>{own ? "Own rule" : "Uses your default"}</span>
        <span class="text">{deloadRulesText(rule)}</span>
      </p>
      <Button small type="button" onclick={edit}>Edit</Button>
    </div>
  {/if}
</ProfileSection>

<style>
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .now { margin: 0; display: flex; flex-direction: column; gap: 2px; font-size: 13px; line-height: 1.5; }
  .who { font-size: 12px; font-weight: 600; color: var(--muted); }
  .who.own { color: var(--blue); }
  .text { color: var(--ink); }
  .acts { display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  .acts .err { margin-right: auto; color: var(--bad); font-size: 12px; }
</style>
