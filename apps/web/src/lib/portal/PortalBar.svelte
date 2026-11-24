<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import Icon from "$lib/ui/Icon.svelte";
  import { coachParts, latinLang, t } from "./i18n.svelte";
  import { splitLang } from "./lang";
  import LangToggle from "./LangToggle.svelte";

  /** The portal's top line: the PT mark (and the coach, once known) left, language right. */
  interface Props {
    /** The coach's name as the trainer set it; the label is added here, once. */
    coach?: string | null;
    actions?: Snippet;
    /** The settings link; off on pages a signed-out client sees. */
    settings?: boolean;
  }

  let { coach = null, actions, settings = true }: Props = $props();
  const who = $derived(coach ? coachParts(coach) : null);
  /** Settings is a signed-in page: the link shows once the coach is known. */
  const onSettings = $derived(splitLang(page.url.pathname).path === "/me/settings");
</script>

<header class="bar">
  <span class="mark" aria-hidden="true">PT</span>
  {#if who}
    <p class="coach">
      {#if who.by}<span class="by">{who.by}</span>{/if}
      <span class="name" lang={latinLang(who.name)}>{who.name}</span>
    </p>
  {/if}
  <span class="spacer"></span>
  {@render actions?.()}
  <LangToggle />
  {#if who && settings}
    <a class="gear" href="/me/settings" aria-label={t("settings.title")} title={t("settings.title")} aria-current={onSettings ? "page" : undefined}><Icon name="gear" /></a>
  {/if}
</header>

<style>
  /* wraps rather than side-scrolls at 200 % zoom: the coach keeps the first line, language and settings drop under it */
  .bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
    min-height: 48px;
  }
  .mark {
    display: inline-grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--hover-ink);
    color: var(--on-ink);
    font: 700 12px/1 var(--font-ui);
    letter-spacing: 0.02em;
  }
  /* who this program is from: the coach's name is the clearest thing on the bar */
  .coach {
    flex: 1 1 6em;
    display: flex;
    align-items: baseline;
    gap: 6px;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    white-space: nowrap;
  }
  .by { flex: none; font: 400 14px/1.3 var(--font-ui); color: var(--muted); }
  .name { min-width: 0; overflow: hidden; text-overflow: ellipsis; font: 600 16px/1.3 var(--font-ui); color: var(--ink); }
  .spacer { flex: 1; }
  .gear {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 44px;
    height: 44px;
    margin-right: -8px;
    border-radius: 99px;
    color: var(--muted);
  }
  .gear:hover, .gear[aria-current="page"] { color: var(--ink); background: var(--well); }
  .gear :global(svg) { width: 20px; height: 20px; }
</style>
