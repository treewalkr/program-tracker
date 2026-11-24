<script lang="ts">
  import { page } from "$app/state";

  let { children } = $props();
  // The pages under here load in onMount and hold per-record state (drafts,
  // dialogs, leave guards). SvelteKit reuses the component when only the id
  // changes (the log recap's "Next: <member>"), so remount on a new id.
</script>

{#key page.params.id}
  {@render children()}
{/key}
