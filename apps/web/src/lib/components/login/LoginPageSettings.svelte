<script lang="ts">
  import { onMount } from "svelte";
  import { DEFAULT_LOGIN_THEME, type LoginTheme } from "@pt/shared";
  import { apiMode } from "$lib/api";
  import { loginThemeApi } from "$lib/api/loginTheme";
  import LoginThemeEditor from "$lib/components/login/LoginThemeEditor.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Button from "$lib/ui/Button.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const live = apiMode === "live";

  let saved = $state<LoginTheme | null>(live ? null : DEFAULT_LOGIN_THEME);
  let loadError = $state<string | null>(null);

  async function load() {
    loadError = null;
    try {
      saved = await loginThemeApi.load();
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  onMount(() => {
    if (live) load();
  });
</script>

{#if !live}
  <Note tone="warn">Demo mode: try the layouts here; saving needs the live API.</Note>
{/if}

{#if loadError}
  <Note tone="bad">
    Couldn't load the login page settings — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else if saved}
  <LoginThemeEditor {saved} canSave={live} onsave={loginThemeApi.save} />
{:else}
  <SkeletonPanel title="Layout" rows={4} label="Loading the login page settings…" />
{/if}
