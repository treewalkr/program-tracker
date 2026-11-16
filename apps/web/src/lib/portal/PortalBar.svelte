<script lang="ts">
  import type { Snippet } from "svelte";
  import { coachLabel } from "./i18n.svelte";
  import LangToggle from "./LangToggle.svelte";

  /** The portal's top line: the PT mark (and the coach, once known) left, language right. */
  interface Props {
    /** The coach's name as the trainer set it; the label is added here, once. */
    coach?: string | null;
    actions?: Snippet;
  }

  let { coach = null, actions }: Props = $props();
</script>

<header class="bar">
  <span class="mark" aria-hidden="true">PT</span>
  {#if coach}<span class="coach">{coachLabel(coach)}</span>{/if}
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
  .coach {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 500 14px/1.3 var(--font-ui);
    color: var(--muted);
  }
  .spacer { flex: 1; }
</style>
