<script lang="ts">
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import { portalApi } from "$lib/api/portal";
  import { inLang, t } from "$lib/portal/i18n.svelte";
  import { portalReturnTo } from "$lib/portal/gate";
  import { inAppHint, withExternalBrowser, withoutExternalBrowser } from "$lib/portal/inAppBrowser";
  import type { MessageKey } from "$lib/portal/messages";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import GoogleMark from "$lib/components/login/GoogleMark.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";

  let showLinkHelp = $state(false);

  // Google refuses sign-in inside LINE / Messenger / Instagram (403 disallowed_useragent):
  // there, lead with getting to the phone's browser and leave the Google button out
  const hint = inAppHint(browser ? navigator.userAgent : "");
  const inApp = hint?.app ?? null;
  const vars: Record<string, string> | undefined = $derived(hint ? { app: hint.name ?? t("inApp.thisApp"), browser: hint.browser, menu: hint.menu } : undefined);
  // LINE opens a link carrying openExternalBrowser=1 in Safari/Chrome; the other apps need their own menu
  const externalHref = $derived(withExternalBrowser(page.url.href));

  // the flag has done its job once the page is open; keep it out of the address bar
  onMount(() => {
    const clean = withoutExternalBrowser(page.url);
    if (clean) replaceState(clean, page.state);
  });

  const ERRORS = ["unverified", "not_allowed", "cancelled", "expired", "google_failed", "not_configured", "disabled"] as const;

  // Google brings the client back to the page they asked for, in this language
  const googleHref = $derived(portalApi.googleHref(inLang(portalReturnTo(page.url.searchParams.get("returnTo")))));
  const code = $derived(page.url.searchParams.get("error"));
  const error = $derived(
    code ? t((ERRORS as readonly string[]).includes(code) ? (`login.error.${code}` as MessageKey) : "login.error.google_failed") : null,
  );
</script>

<svelte:head><title>{t("app.title")} · Program Tracker</title></svelte:head>

<!-- bar and content share one 400px column, so their edges line up on a wide screen -->
<div class="narrow">
<PortalBar />

<main class="signin">
  <h1>{t("login.title")}</h1>
  {#if inApp}
    <Note tone="warn" role="note" class="err">{t("inApp.lead", vars)}</Note>
  {:else}
    <p class="lede">{t("login.lead")}</p>
  {/if}

  {#if error}
    <Note tone="bad" role="alert" class="err">{error}</Note>
  {/if}

  {#if inApp === "line"}
    <a class="btn primary external" href={externalHref}>{t("inApp.open", vars)}</a>
  {:else if inApp}
    <p class="menu-hint">{t("inApp.menu", vars)}</p>
  {:else}
    <a class="google" href={googleHref}>
      <GoogleMark />
      {t("login.google")}
    </a>
  {/if}

  {#if inApp}<p class="link-line">{t("login.googleLater", vars)}</p>{/if}
  <p class="link-line">{t("login.linkLine")}</p>

  <div class="alt">
    <button type="button" class="btn alt-btn" aria-expanded={showLinkHelp} aria-controls="link-help" onclick={() => (showLinkHelp = !showLinkHelp)}>
      {t("login.noGoogle")}<Icon name="chevron" />
    </button>
    {#if showLinkHelp}<p id="link-help" class="alt-help">{t("login.noGoogleHelp")}</p>{/if}
  </div>
</main>
</div>

<style>
  .narrow { max-width: 400px; margin: 0 auto; }
  .signin {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12vh;
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
  .external { justify-content: center; min-height: 48px; margin-top: 12px; font-size: 16px; }
  .menu-hint { margin: 12px 0 0; font: 500 16px/1.4 var(--font-ui); color: var(--ink); text-wrap: pretty; }
  .google:hover { background: var(--well); border-color: var(--line-strong); text-decoration: none; }
  .google :global(svg) { width: 20px; height: 20px; flex: none; }
  .link-line { margin: 0; font-size: 14px; color: var(--muted); text-wrap: pretty; }
  .alt {
    display: grid;
    gap: 10px;
    margin: 8px 0 0;
    padding-top: 16px;
    border-top: 1px solid var(--line-soft);
  }
  .alt-btn { justify-content: center; min-height: 44px; font-size: 14px; }
  .alt-btn :global(svg) { width: 14px; height: 14px; transition: transform 150ms ease-out; }
  .alt-btn[aria-expanded="true"] :global(svg) { transform: rotate(180deg); }
  .alt-help { margin: 0; font-size: 14px; color: var(--muted); text-wrap: pretty; }
  @media (prefers-reduced-motion: reduce) {
    .google, .alt-btn :global(svg) { transition: none; }
  }
</style>
