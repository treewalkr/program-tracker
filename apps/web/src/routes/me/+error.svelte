<script lang="ts">
  import { page } from "$app/state";
  import PortalError from "$lib/portal/PortalError.svelte";

  // Errors under /me stay in the portal: the member's language and frame, never the trainer's page.
  const kind = $derived(page.status === 404 ? "notFound" : "generic");
  const signedIn = $derived(page.data.portal?.kind === "signedIn");
</script>

<svelte:head><title>Program Tracker</title></svelte:head>

<PortalError {kind} toProgram={signedIn} />
