<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import { latest } from "$lib/whatsNew.svelte";
  import { page } from "$app/state";
  import { BANNER_TEXT, quietRoute } from "$lib/releaseNote";
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
  const visible = $derived(latest !== null && dismissed !== latest && !quietRoute(page.url.pathname));
  const text = $derived(BANNER_TEXT[i18n.locale]);

  /** Toast behaviour: it leaves on its own, but waits while the pointer or focus is on it. */
  const AUTO_DISMISS_MS = 12_000;
  let paused = $state(false);
  $effect(() => {
    if (!visible || paused) return;
    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  });

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
  <div
    class="toast"
    role="status"
    lang={i18n.locale}
    onmouseenter={() => (paused = true)}
    onmouseleave={() => (paused = false)}
    onfocusin={() => (paused = true)}
    onfocusout={() => (paused = false)}
  >
    <span class="msg"><strong>{text.title(latest)}</strong> <a href="/whats-new#v{latest}">{text.more} →</a></span>
    <LangToggle compact />
    <button type="button" class="close" aria-label={text.dismiss} onclick={dismiss}><Icon name="x" /></button>
  </div>
{/if}

<style>
  /* A toast: one row, bottom-centre, floats over the page and leaves by itself. */
  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    translate: -50% 0;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 10px;
    width: max-content;
    max-width: calc(100vw - 32px);
    padding: 8px 8px 8px 14px;
    background: var(--surface);
    border-radius: 10px;
    box-shadow: 0 0 0 1px var(--line), var(--shadow-overlay);
    animation: toast-in 320ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(12px); }
  }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  .msg { font: 400 13px/1.45 var(--font-ui); color: var(--muted); min-width: 0; }
  strong { font-weight: 600; color: var(--ink); margin-right: 6px; }
  a { font-weight: 600; color: var(--blue); text-decoration: none; white-space: nowrap; border-radius: 2px; }
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
  /* Phone: sit above the Feedback pill's row and let the message wrap. */
  @media (max-width: 640px) {
    .toast { bottom: 72px; width: calc(100vw - 32px); }
    .msg { flex: 1; }
  }
</style>
