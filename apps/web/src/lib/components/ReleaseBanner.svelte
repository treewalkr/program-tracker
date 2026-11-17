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
  <div class="toast" role="status" lang={i18n.locale}>
    <div class="top">
      <h2>{text.title(latest)}</h2>
      <LangToggle compact />
      <button type="button" class="close" aria-label={text.dismiss} onclick={dismiss}><Icon name="x" /></button>
    </div>
    <a href="/whats-new#v{latest}">{text.more} →</a>
  </div>
{/if}

<style>
  /* A small overlay, not page content: it floats top-right and never pushes the page down. */
  .toast {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 60;
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: min(380px, calc(100vw - 32px));
    padding: 10px 10px 10px 14px;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: 0 0 0 1px var(--line), var(--shadow-overlay);
    animation: toast-in 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(-8px); }
  }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  .top { display: flex; align-items: center; gap: 6px; }
  h2 { flex: 1; min-width: 0; margin: 0; font: 600 14px/1.4 var(--font-ui); color: var(--ink); text-wrap: balance; }
  a { align-self: flex-start; font: 600 13px/1.5 var(--font-ui); color: var(--blue); text-decoration: none; border-radius: 2px; }
  a:hover { text-decoration: underline; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .close {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 28px;
    height: 28px;
    color: var(--muted);
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }
  .close :global(svg) { width: 16px; height: 16px; }
  .close:hover { color: var(--ink); background: var(--line-soft); }
  .close:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
</style>
