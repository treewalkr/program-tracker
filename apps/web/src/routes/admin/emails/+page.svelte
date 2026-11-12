<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  /** Templates moved to Settings. A load redirect can't see the hash, and the
      hash picks the template, so forward it from the client. */
  onMount(() => {
    goto(`/settings/email-templates${page.url.search}${page.url.hash}`, { replaceState: true });
  });
</script>
