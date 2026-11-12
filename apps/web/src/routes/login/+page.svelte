<script lang="ts">
  import { page } from "$app/state";
  import { authApi, safeReturnTo } from "$lib/api/auth";
  import { loginErrorMessage } from "$lib/loginTheme";
  import LoginView from "$lib/components/login/LoginView.svelte";

  let { data } = $props();

  const error = $derived(loginErrorMessage(page.url.searchParams.get("error")));
  const href = $derived(authApi.signInHref(safeReturnTo(page.url.searchParams.get("returnTo"))));
</script>

<svelte:head><title>Sign in · Program Tracker</title></svelte:head>

<LoginView theme={data.theme} {href} {error} />
