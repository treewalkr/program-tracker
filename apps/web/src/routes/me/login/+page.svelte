<script lang="ts">
  import { page } from "$app/state";
  import { portalApi } from "$lib/api/portal";
  import { t } from "$lib/portal/i18n.svelte";
  import type { MessageKey } from "$lib/portal/messages";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import GoogleMark from "$lib/components/login/GoogleMark.svelte";
  import Note from "$lib/ui/Note.svelte";

  const ERRORS = ["unverified", "not_allowed", "cancelled", "expired", "google_failed", "not_configured", "disabled"] as const;

  const code = $derived(page.url.searchParams.get("error"));
  const error = $derived(
    code ? t((ERRORS as readonly string[]).includes(code) ? (`login.error.${code}` as MessageKey) : "login.error.google_failed") : null,
  );
</script>

<svelte:head><title>{t("app.title")} · Program Tracker</title></svelte:head>

<PortalBar />

<main class="signin">
  <h1>{t("login.title")}</h1>
  <p class="lede">{t("login.lead")}</p>

  {#if error}
    <Note tone="bad" role="alert" class="err">{error}</Note>
  {/if}

  <a class="google" href={portalApi.googleHref}>
    <GoogleMark />
    {t("login.google")}
  </a>

  <p class="alt">{t("login.noGoogle")}</p>
</main>

<style>
  .signin {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 400px;
    margin: 12vh auto 0;
  }
  h1 {
    margin: 0;
    font: 600 24px/1.25 var(--font-ui);
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .lede { margin: 0; color: var(--muted); text-wrap: pretty; }
  .signin :global(.err) { padding: 10px 12px; font-size: 14px; }
  .google {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    min-height: 48px;
    margin-top: 12px;
    padding: 0 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    box-shadow: var(--btn-lip);
    color: var(--ink);
    font: 500 16px/1.2 var(--font-ui);
    text-decoration: none;
    transition: background-color 120ms ease-out, border-color 120ms ease-out;
  }
  .google:hover { background: var(--well); border-color: var(--line-strong); text-decoration: none; }
  .google :global(svg) { width: 20px; height: 20px; flex: none; }
  .alt {
    margin: 8px 0 0;
    padding-top: 16px;
    border-top: 1px solid var(--line-soft);
    font-size: 14px;
    color: var(--muted);
    text-wrap: pretty;
  }
  @media (prefers-reduced-motion: reduce) {
    .google { transition: none; }
  }
</style>
