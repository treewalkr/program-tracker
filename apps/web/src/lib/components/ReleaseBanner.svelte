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
      <p><span class="sentence">{text.body}</span> <a href="/whats-new#v{latest}">{text.more} →</a></p>
    </div>
    <div class="actions">
      <LangToggle compact />
      <button type="button" class="close" aria-label={text.dismiss} onclick={dismiss}><Icon name="x" /></button>
    </div>
  </aside>
{/if}

<style>
  /* One quiet row: what happened, where to read it, and two small controls. */
  .release {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 16px;
    margin: 0 0 20px;
    padding: 10px 10px 10px 14px;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .body { flex: 1 1 320px; min-width: 0; }
  h2 { margin: 0; font: 600 14px/1.4 var(--font-ui); color: var(--ink); text-wrap: balance; }
  p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
  a { font-weight: 600; color: var(--blue); text-decoration: none; white-space: nowrap; }
  a:hover { text-decoration: underline; text-underline-offset: 3px; }
  a:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: 2px; }
  /* Phone: the link says enough; the sentence is what makes the card tall. */
  @media (max-width: 640px) { .sentence { display: none; } }
  .actions { display: flex; align-items: center; gap: 4px; margin-left: auto; }
  .close {
    display: grid;
    place-items: center;
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
