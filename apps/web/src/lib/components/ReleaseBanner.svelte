<script lang="ts">
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import { latest } from "$lib/whatsNew.svelte";
  import { BANNER_TEXT, noteFor } from "$lib/releaseNote";
  import Icon from "$lib/ui/Icon.svelte";

  const DISMISSED_KEY = "pt:dismissed-release";

  function readDismissed(): string | null {
    try {
      return localStorage.getItem(DISMISSED_KEY);
    } catch {
      return null;
    }
  }

  const note = noteFor(latest);
  let dismissed = $state(readDismissed());
  const visible = $derived(note !== null && dismissed !== note.version);
  const copy = $derived(note?.copy[i18n.locale]);
  const text = $derived(BANNER_TEXT[i18n.locale]);

  function dismiss() {
    if (!note) return;
    dismissed = note.version;
    try {
      localStorage.setItem(DISMISSED_KEY, note.version);
    } catch {
      // private mode: it comes back next visit
    }
  }
</script>

{#if visible && note && copy}
  <aside class="release" lang={i18n.locale} aria-label={text.badge(note.version)}>
    <div class="body">
      <p class="badge">{text.badge(note.version)}</p>
      <h2>{copy.title}</h2>
      <ul>
        {#each copy.points as point (point)}<li>{point}</li>{/each}
      </ul>
      <a href="/whats-new#v{note.version}">{text.more} →</a>
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
  .badge {
    margin: 0 0 4px;
    font: 600 12px/1.2 var(--font-ui);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--blue);
  }
  h2 { margin: 0 0 6px; font: 600 16px/1.35 var(--font-ui); color: var(--ink); }
  ul { margin: 0 0 8px; padding-left: 18px; color: var(--muted); font-size: 14px; line-height: 1.55; }
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
