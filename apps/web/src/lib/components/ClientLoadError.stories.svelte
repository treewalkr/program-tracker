<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import ClientLoadError from "./ClientLoadError.svelte";

  const { Story } = defineMeta({
    title: "Domain/ClientLoadError",
    component: ClientLoadError,
  });
</script>

<Story name="Not found" args={{ error: Object.assign(new Error("Member not found."), { status: 404 }) }} />
<!-- a 5xx never shows its body: this one reads "Something went wrong on our side. Try again." -->
<Story name="Other failure" args={{ error: Object.assign(new Error('Failed query: select "id" from "clients"'), { status: 500 }) }} />
<Story name="No connection" args={{ error: Object.assign(new Error("Load failed"), { status: 503, network: true }) }} />
