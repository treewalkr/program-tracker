<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  /** The login page editor moved to Settings. A load redirect can't see the
      hash, so forward the search and hash from the client. */
  onMount(() => {
    goto(`/settings/login-page${page.url.search}${page.url.hash}`, { replaceState: true });
  });
</script>
