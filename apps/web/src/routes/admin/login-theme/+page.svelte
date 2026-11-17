<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  /** The login page editor moved to Settings › Appearance; forward the search
      from the client and land on its section. */
  onMount(() => {
    goto(`/settings${page.url.search}#login-page`, { replaceState: true });
  });
</script>
