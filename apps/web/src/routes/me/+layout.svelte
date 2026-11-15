<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";

  let { children } = $props();

  // <html lang> follows the portal's language (Thai line-breaking, screen readers); the trainer app is English
  $effect(() => {
    document.documentElement.lang = i18n.locale;
    return () => {
      document.documentElement.lang = "en";
    };
  });
</script>

<div class="portal">
  {@render children()}
</div>

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
</style>
