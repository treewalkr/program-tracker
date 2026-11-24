<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import Button from "$lib/ui/Button.svelte";
  import { inLang, t } from "./i18n.svelte";
  import PortalBar from "./PortalBar.svelte";

  /**
   * The portal's own error page: the member's language, the portal frame, one way
   * back to their week. Never the trainer's error page or its links.
   */
  interface Props {
    /** `offline`: no connection and nothing on this phone to go on; `notFound`: a stale or cut link. */
    kind: "offline" | "notFound" | "generic";
    /** The member's week link; off while signed out (it would only bounce to sign-in). */
    toProgram?: boolean;
  }

  let { kind, toProgram = true }: Props = $props();
  let retrying = $state(false);

  const TEXT = {
    offline: ["error.offlineTitle", "error.offlineHint"],
    notFound: ["error.notFound", "error.notFoundHint"],
    generic: ["error.generic", "error.genericHint"],
  } as const;

  async function retry() {
    retrying = true;
    try {
      await invalidateAll();
    } finally {
      retrying = false;
    }
  }
</script>

<div class="narrow">
  <PortalBar settings={false} />
  <main class="perr">
    <h1>{t(TEXT[kind][0])}</h1>
    <p class="lede">{t(TEXT[kind][1])}</p>
    {#if kind !== "notFound"}
      <Button variant="primary" class="go" onclick={retry} disabled={retrying}>{t("week.retry")}</Button>
    {/if}
    {#if toProgram}
      <a class="btn go-link" class:primary={kind === "notFound"} href={inLang("/me")}>{t("link.toProgram")}</a>
    {/if}
  </main>
</div>

<style>
  .narrow { max-width: 400px; margin: 0 auto; }
  .perr {
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
  .go-link { justify-content: center; min-height: 48px; font-size: 16px; }
  .perr :global(.go) { min-height: 48px; margin-top: 12px; justify-content: center; font-size: 16px; }
</style>
