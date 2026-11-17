<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import { latest } from "$lib/whatsNew.svelte";
  import { BANNER_TEXT } from "$lib/releaseNote";
  import Icon from "$lib/ui/Icon.svelte";

  const DISMISSED_KEY = "pt:dismissed-release";

  function readDismissed(): string | null {
    try {
      return localStorage.getItem(DISMISSED_KEY);
    } catch {
      return null;
    }
  }

  let dismissed = $state(readDismissed());
  const visible = $derived(latest !== null && dismissed !== latest);
  const text = $derived(BANNER_TEXT[i18n.locale]);

  function dismiss() {
    if (!latest) return;
    dismissed = latest;
    try {
      localStorage.setItem(DISMISSED_KEY, latest);
    } catch {
      // private mode: it comes back next visit
    }
  }
</script>

{#if visible && latest}
  <aside class="release" lang={i18n.locale} aria-label={text.title(latest)}>
    <div class="body">
      <h2>{text.title(latest)}</h2>
      <p>{text.body} <a href="/whats-new#v{latest}">{text.more} →</a></p>
    </div>
    <div class="actions">
      <LangToggle />
      <button type="button" class="close" aria-label={text.dismiss} onclick={dismiss}><Icon name="x" /></button>
    </div>
  </aside>
{/if}

<style>
  .release {
    display: flex;
    gap: 16px;
    justify-content: space-between;
    align-items: flex-start;
    margin: 0 0 20px;
    padding: 16px 18px;
    background: var(--well);
    border: 1px solid var(--line);
    border-left: 3px solid var(--blue);
    border-radius: 8px;
  }
  h2 { margin: 0 0 2px; font: 600 16px/1.35 var(--font-ui); color: var(--ink); }
  p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.55; }
  a { font-size: 14px; font-weight: 600; color: var(--blue); }
  .actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .close {
    display: grid;
    place-items: center;
    min-width: 44px;
    min-height: 44px;
    color: var(--muted);
    background: transparent;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
  }
  .close:hover { color: var(--ink); background: var(--line); }
  .close:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  @media (max-width: 640px) {
    .release { flex-direction: column-reverse; }
    .actions { align-self: flex-end; }
  }
</style>
