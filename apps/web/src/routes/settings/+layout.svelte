<script lang="ts">
  import { page } from "$app/state";
  import PageHead from "$lib/ui/PageHead.svelte";
  import SettingsRail from "$lib/components/SettingsRail.svelte";
  import { activeSection, settingsGroups } from "$lib/settingsNav";

  let { children } = $props();

  const groups = $derived(settingsGroups());
  const section = $derived(activeSection(groups, page.url.pathname));
</script>

<svelte:head><title>{section.label} · Settings · Program Tracker</title></svelte:head>

<PageHead title="Settings" sub={section.sub} />

<div class="settings">
  <div class="layout">
    <SettingsRail {groups} current={page.url.pathname} />
    <div class="body">
      {@render children()}
    </div>
  </div>
</div>

<style>
  /* The rail folds into a strip by the room settings has, not the viewport. */
  .settings { container: settings / inline-size; }
  .layout {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 32px;
    align-items: start;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  @container settings (max-width: 720px) {
    .layout { grid-template-columns: minmax(0, 1fr); gap: 16px; }
  }
</style>
