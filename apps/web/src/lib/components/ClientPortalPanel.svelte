<script lang="ts">
  import { api } from "$lib/api";
  import type { ClientDto, ClientPortalDto } from "$lib/api/types";
  import { fmtDate, fmtDateTime } from "$lib/format";
  import ProfileSection from "./ProfileSection.svelte";
  import CopyButton from "./CopyButton.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Note from "$lib/ui/Note.svelte";

  /**
   * The client portal for one client: off (one button) or on — their personal
   * link to copy into LINE, Google sign-in by their email, last seen, and
   * Reset / Turn off behind a confirm. Saves on its own, outside the profile form.
   */
  interface Props {
    client: ClientDto;
  }

  let { client }: Props = $props();

  let portal = $state<ClientPortalDto | null>(null);
  let busy = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    const id = client.id;
    portal = null;
    api.clientPortal(id).then(
      (p) => (portal = p),
      (e: Error) => (error = e.message || "Could not load"),
    );
  });

  async function run(call: () => Promise<ClientPortalDto>) {
    busy = true;
    error = null;
    try {
      portal = await call();
    } catch (e) {
      error = (e as Error).message || "Could not save";
    } finally {
      busy = false;
    }
  }

  const firstName = $derived(client.name.trim().split(/\s+/)[0] ?? client.name);
  /** The LINE-ready line: one paste, and the link works on their phone. */
  const message = $derived(portal?.link ? `Your program: ${portal.link}` : "");
  const email = $derived(portal?.email ?? client.email ?? null);
</script>

<ProfileSection title="Client portal" purpose="their own link to see this week and log sessions">
  {#if portal === null && !error}
    <p class="muted">Loading…</p>
  {:else if portal && !portal.enabled}
    <div class="row">
      <p class="lead">
        {firstName} can't see their program yet. Turn the portal on to get a personal link they open on their phone —
        their logs land here, marked <span class="pill neutral by">by client</span>.
      </p>
      <Button small variant="primary" type="button" disabled={busy} onclick={() => run(() => api.enableClientPortal(client.id))}>
        {busy ? "Turning on…" : "Turn on"}
      </Button>
    </div>
  {:else if portal}
    <div class="field">
      <span class="label">Access link</span>
      <div class="link-row">
        <code class="link">{portal.link}</code>
        <CopyButton text={portal.link ?? ""} label="Copy link" />
      </div>
    </div>
    <div class="field">
      <span class="label">For LINE</span>
      <div class="link-row">
        <span class="msg">{message}</span>
        <CopyButton text={message} label="Copy message" />
      </div>
    </div>
    <dl class="facts">
      <div>
        <dt>Google sign-in</dt>
        <dd>
          {#if portal.googleLinked}
            Linked{#if email} · {email}{/if}
          {:else if email}
            Uses {email}
          {:else}
            <span class="warn">No email on file — they can only use the link.</span>
          {/if}
        </dd>
      </div>
      <div>
        <dt>Last seen</dt>
        <dd>
          {#if portal.lastSeenAt}<time datetime={portal.lastSeenAt} title={fmtDateTime(portal.lastSeenAt)}>{fmtDate(portal.lastSeenAt)}</time>{:else}Not opened yet{/if}
        </dd>
      </div>
    </dl>
    <div class="acts">
      <ConfirmButton
        small
        variant="default"
        label="Reset link"
        confirmLabel="Reset — old link stops working"
        disabled={busy}
        onconfirm={() => run(() => api.resetClientPortal(client.id))}
      />
      <ConfirmButton
        small
        label="Turn off"
        confirmLabel="Turn off and sign them out"
        disabled={busy}
        onconfirm={() => run(() => api.disableClientPortal(client.id))}
      />
    </div>
  {/if}
  {#if error}<Note tone="bad" role="alert">{error}</Note>{/if}
</ProfileSection>

<style>
  .muted { margin: 0; font-size: 13px; color: var(--muted); }
  .row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .lead { margin: 0; font-size: 13px; line-height: 1.6; max-width: var(--measure-prose, 60ch); }
  .by { font-size: 11px; padding: 0 6px; }
  .field { display: grid; gap: 6px; }
  .field .label { margin: 0; }
  .link-row { display: flex; align-items: flex-start; gap: 8px; min-width: 0; }
  /* shown whole, wrapped, so the trainer can read the exact link before it goes out */
  .link, .msg {
    flex: 1;
    min-width: 0;
    padding: 6px 10px;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
    font-size: 13px;
    line-height: 1.5;
    user-select: all;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .link { font-family: var(--font-mono); }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin: 0; }
  .facts dt { font-size: 12px; font-weight: 600; color: var(--muted); }
  .facts dd { margin: 2px 0 0; font-size: 13px; }
  .warn { color: var(--warn); }
  .acts { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; }
  /* small buttons, but a 32px target: this panel is used on a phone at the gym too */
  .link-row :global(.btn), .acts :global(.btn) { min-height: 32px; }
</style>
