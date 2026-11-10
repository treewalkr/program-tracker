<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ClientLoadError from "./ClientLoadError.svelte";

  const { Story } = defineMeta({
    title: "Domain/ClientLoadError",
    component: ClientLoadError,
  });
</script>

<Story name="Not found" args={{ error: Object.assign(new Error("client not found"), { status: 404 }) }} />
<Story name="Other failure" args={{ error: Object.assign(new Error("request failed: 500"), { status: 500 }) }} />
