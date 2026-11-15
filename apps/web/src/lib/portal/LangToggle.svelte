<script lang="ts">
  import { i18n, t } from "./i18n.svelte";
  import { LOCALES, type Locale } from "./messages";

  /** EN/TH switch for the portal header — each language names itself, so either reader finds theirs. */
  const NAMES: Record<Locale, { short: string; long: string }> = {
    th: { short: "ไทย", long: "ภาษาไทย" },
    en: { short: "EN", long: "English" },
  };

  function onkeydown(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = LOCALES[(LOCALES.indexOf(i18n.locale) + 1) % LOCALES.length];
    i18n.set(next);
    (e.currentTarget as HTMLElement).parentElement?.querySelector<HTMLButtonElement>(`[data-l="${next}"]`)?.focus();
  }
</script>

<div class="lang" role="radiogroup" aria-label={t("lang.label")}>
  {#each LOCALES as l (l)}
    <button
      type="button"
      role="radio"
      data-l={l}
      lang={l}
      aria-checked={i18n.locale === l}
      aria-label={NAMES[l].long}
      tabindex={i18n.locale === l ? 0 : -1}
      onclick={() => i18n.set(l)}
      {onkeydown}>{NAMES[l].short}</button
    >
  {/each}
</div>

<style>
  .lang {
    display: inline-flex;
    padding: 2px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--well);
  }
  button {
    min-width: 44px;
    min-height: 40px;
    padding: 0 12px;
    font: 600 13px/1 var(--font-ui);
    color: var(--muted);
    background: transparent;
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:hover { color: var(--ink); }
  button[aria-checked="true"] { color: var(--surface); background: var(--ink); }
  button:focus-visible { outline: 2px solid var(--focus, var(--tab-on)); outline-offset: 2px; }
</style>
