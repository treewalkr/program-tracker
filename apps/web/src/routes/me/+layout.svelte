<script lang="ts">
  import { afterNavigate, goto } from "$app/navigation";
  import { i18n, pickedLang } from "$lib/portal/i18n.svelte";
  import { keptLang } from "$lib/portal/lang";
  import { portalApi } from "$lib/api/portal";
  import PortalError from "$lib/portal/PortalError.svelte";
  import { applyUnits, PORTAL_UNITS_KEY, restoreUnits } from "$lib/units.svelte";

  let { children, data } = $props();

  // The member's own display units: this phone's copy first, then the saved choice.
  // Leaving the portal puts the trainer's back.
  const signedIn = $derived(data.portal.kind === "signedIn");
  $effect(() => {
    restoreUnits(PORTAL_UNITS_KEY);
    if (signedIn && !data.offline) portalApi.settings().then((s) => applyUnits(s.units, PORTAL_UNITS_KEY), () => {});
    return () => restoreUnits();
  });

  // Back onto a page from before a language switch: the language just picked, not the old URL's
  afterNavigate((nav) => {
    const to = keptLang(nav, pickedLang());
    if (to) void goto(to, { replaceState: true, noScroll: true, keepFocus: true });
  });

  // <html lang> follows the portal's language (Thai line-breaking, screen readers); the trainer app is English
  $effect(() => {
    document.documentElement.lang = i18n.locale;
    return () => {
      document.documentElement.lang = "en";
    };
  });
</script>

<main class="portal">
  {#if data.unreachable}
    <!-- no connection and never signed in on this phone: nothing to show but the way back -->
    <PortalError kind="offline" toProgram={false} />
  {:else}
    {@render children()}
  {/if}
</main>

<style>
  /* The client's surface: the same Primer world, one size up and one thing at a time. */
  .portal {
    min-height: 100dvh;
    width: min(600px, 100%);
    margin: 0 auto;
    padding: 12px 16px calc(32px + env(safe-area-inset-bottom));
    font-size: 16px;
    line-height: 1.5;
    color: var(--ink);
  }
  @media (min-width: 700px) {
    .portal { padding-top: 24px; }
  }
  /* A ring a client finds at arm's length: solid Link Blue, outside the control. The app-wide
     ring is 45% alpha and inset, too faint on white for this surface. Fields keep their halo. */
  .portal :global(:where(a, button, summary, [role="tab"], [role="radio"], [tabindex]):focus-visible) {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
</style>
