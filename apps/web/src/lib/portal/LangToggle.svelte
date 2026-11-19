<script lang="ts">
  import { i18n } from "./i18n.svelte";
  import { LOCALES, type Locale } from "./messages";

  /** EN/TH switch — each language names itself, so either reader finds theirs. One click anywhere flips it. */
  const NAMES: Record<Locale, { short: string; long: string }> = {
    th: { short: "ไทย", long: "ภาษาไทย" },
    en: { short: "EN", long: "English" },
  };

  /** Small switch for the trainer app's dense chrome; the portal keeps 44px touch targets. */
  let { compact = false }: { compact?: boolean } = $props();

  /** Where the thumb sits, and the language one click switches to. */
  const at = $derived(LOCALES.indexOf(i18n.locale));
  const other = $derived(LOCALES[(at + 1) % LOCALES.length]);
</script>

<button
  type="button"
  class={["lang", compact && "compact"]}
  style="--i: {at}"
  aria-label={NAMES[other].long}
  title={NAMES[other].long}
  onclick={() => i18n.set(other)}
>
  <span class="thumb" aria-hidden="true"></span>
  {#each LOCALES as l (l)}
    <span class="opt" class:on={i18n.locale === l} lang={l}>{NAMES[l].short}</span>
  {/each}
</button>

<style>
  .lang {
    position: relative;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    align-items: stretch;
    min-height: 44px;
    margin: 0;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--well);
    font: inherit;
    color: inherit;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
  }
  .lang:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
  .thumb {
    position: absolute;
    inset: 2px auto 2px 2px;
    width: calc(50% - 2px);
    border-radius: 999px;
    background: var(--ink);
    transform: translateX(calc(var(--i) * 100%));
    transition: transform 280ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  .opt {
    position: relative;
    display: grid;
    place-items: center;
    padding: 0 12px;
    font: 600 13px/1 var(--font-ui);
    color: var(--muted);
    transition: color 200ms;
  }
  .opt.on { color: var(--on-ink); }
  .lang:hover .opt:not(.on) { color: var(--ink); }
  .compact { min-height: 28px; padding: 1px; }
  .compact .thumb { inset: 1px auto 1px 1px; width: calc(50% - 1px); }
  .compact .opt { padding: 0 10px; font-size: 12px; }
  @media (prefers-reduced-motion: reduce) {
    .thumb, .opt { transition: none; }
  }
</style>
