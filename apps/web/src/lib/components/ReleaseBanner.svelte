<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";
  import { latest } from "$lib/whatsNew.svelte";
  import { page } from "$app/state";
  import { BANNER_TEXT, quietRoute } from "$lib/releaseNote";
  import { appPath } from "$lib/portal/lang";
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
  const visible = $derived(latest !== null && dismissed !== latest && !quietRoute(appPath(page.url)));
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
    <span class="msg"><strong>{text.title(latest)}</strong> <a href="/whats-new#v{latest}">{text.more}</a></span>
    <button type="button" class="close" aria-label={text.dismiss} onclick={dismiss}><Icon name="x" /></button>
  </div>
{/if}

<style>
  /* A toast: one row, bottom-centre (top on phones), floats over the page and leaves by itself. */
  .toast {
    position: fixed;
    bottom: calc(16px + env(safe-area-inset-bottom));
    left: 50%;
    translate: -50% 0;
    z-index: 60;
    display: flex;
    align-items: center;
    gap: 8px;
    width: max-content;
    max-width: calc(100vw - 32px);
    padding: 4px 4px 4px 12px;
    background: var(--surface);
    border-radius: 8px;
    box-shadow: 0 0 0 1px var(--line), var(--shadow-overlay);
    animation: toast-in 320ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes toast-in {
    from { opacity: 0; transform: translateY(12px); }
  }
  @media (prefers-reduced-motion: reduce) { .toast { animation: none; } }
  .msg { font: 400 12px/1.4 var(--font-ui); color: var(--muted); min-width: 0; }
  strong { font-weight: 600; color: var(--ink); margin-right: 6px; }
  a { font-weight: 600; color: var(--blue); text-decoration: none; white-space: nowrap; border-radius: 2px; }
  a:hover { text-decoration: underline; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .close {
    display: grid;
    place-items: center;
    flex-shrink: 0;
    width: 24px;
    height: 24px;
    color: var(--muted);
    background: transparent;
    border: 0;
    border-radius: 6px;
    cursor: pointer;
  }
  .close :global(svg) { width: 14px; height: 14px; }
  .close:hover { color: var(--ink); background: var(--line-soft); }
  .close:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  /* Phone and touch screens: drop in from the top. The bottom edge is where save bars and the
     Feedback pill live, and a toast there covered "Save profile". The message may wrap. */
  @media (max-width: 640px), (hover: none) and (pointer: coarse) {
    .toast { top: calc(env(safe-area-inset-top, 0px) + 8px); bottom: auto; animation-name: toast-down; }
    .msg { flex: 1; }
  }
  @keyframes toast-down {
    from { opacity: 0; transform: translateY(-12px); }
  }
</style>
