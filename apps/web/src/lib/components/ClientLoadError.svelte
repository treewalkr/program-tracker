<script lang="ts">
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import Button from "$lib/ui/Button.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import { errorText } from "$lib/api/errors";

  /**
   * What a client page shows when its first load fails, instead of a skeleton
   * that never resolves. A 404 is a client that's gone or belongs to another
   * trainer (the API answers both the same way); anything else can be retried.
   */
  let { error }: { error: unknown } = $props();

  const missing = $derived((error as { status?: unknown } | null)?.status === 404);
</script>

<Crumbs items={[{ href: "/clients", label: "Members" }, { label: missing ? "Not found" : "Couldn't load" }]} />
<div class="panel" role="alert">
  <EmptyState>
    {#if missing}
      <strong>Member not found.</strong> It may have been deleted, or it belongs to another trainer.
    {:else}
      <strong>Couldn't load this member.</strong>
      {errorText(error)}
    {/if}
    {#snippet actions()}
      <Button href="/clients" variant={missing ? "primary" : "default"}>Back to Members</Button>
      {#if !missing}<Button variant="primary" onclick={() => location.reload()}>Try again</Button>{/if}
    {/snippet}
  </EmptyState>
</div>
