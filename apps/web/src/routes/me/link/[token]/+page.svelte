<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { portalApi, type PortalLinkInfo } from "$lib/api/portal";
  import { t } from "$lib/portal/i18n.svelte";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  /** GET only checks the link (scanners prefetch links); the button's POST signs in. */
  let info = $state<PortalLinkInfo | null | undefined>(undefined);
  let failed = $state(false);
  let opening = $state(false);
  let openError = $state(false);

  const token = $derived(page.params.token ?? "");

  $effect(() => {
    const tk = token;
    info = undefined;
    failed = false;
    portalApi.linkInfo(tk).then(
      (r) => (info = r),
      () => (failed = true),
    );
  });

  async function open() {
    opening = true;
    openError = false;
    try {
      await portalApi.openLink(token);
      await goto("/me", { invalidateAll: true, replaceState: true });
    } catch {
      openError = true;
      opening = false;
    }
  }
</script>

<svelte:head><title>{t("app.title")} · Program Tracker</title></svelte:head>

<PortalBar coach={info?.trainerName ?? null} />

<main class="link">
  {#if info === undefined && !failed}
    <p class="sr-only" role="status">{t("link.checking")}</p>
    <div aria-hidden="true" class="sk">
      <Skeleton h="30px" w="80%" />
      <Skeleton h="18px" w="60%" shape="line" />
      <Skeleton h="48px" />
    </div>
  {:else if info}
    <h1>{t("link.title", { trainer: info.trainerName, name: info.clientFirstName })}</h1>
    <p class="lede">{t("link.lead")}</p>
    {#if openError}<Note tone="bad" role="alert" class="err">{t("link.failed")}</Note>{/if}
    <Button variant="primary" class="go" onclick={open} disabled={opening}>
      {opening ? t("link.opening") : t("link.open")}
    </Button>
  {:else}
    <h1>{t("link.invalid")}</h1>
    <p class="lede">{failed ? t("link.failed") : t("link.invalidHint")}</p>
  {/if}
</main>

<style>
  .link {
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
  .link :global(.err) { padding: 10px 12px; font-size: 14px; }
  .link :global(.go) { min-height: 48px; margin-top: 12px; justify-content: center; font-size: 16px; }
  .sk { display: grid; gap: 12px; }
  .sk :global(.skeleton) { display: block; }
</style>
