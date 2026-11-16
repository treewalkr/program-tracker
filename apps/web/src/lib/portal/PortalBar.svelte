<script lang="ts">
  import type { Snippet } from "svelte";
  import { coachParts } from "./i18n.svelte";
  import LangToggle from "./LangToggle.svelte";

  /** The portal's top line: the PT mark (and the coach, once known) left, language right. */
  interface Props {
    /** The coach's name as the trainer set it; the label is added here, once. */
    coach?: string | null;
    actions?: Snippet;
  }

  let { coach = null, actions }: Props = $props();
  const who = $derived(coach ? coachParts(coach) : null);
</script>

<header class="bar">
  <span class="mark" aria-hidden="true">PT</span>
  {#if who}
    <p class="coach">
      {#if who.by}<span class="by">{who.by}</span>{/if}
      <span class="name">{who.name}</span>
    </p>
  {/if}
  <span class="spacer"></span>
  {@render actions?.()}
  <LangToggle />
</header>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 10px;
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
</style>
