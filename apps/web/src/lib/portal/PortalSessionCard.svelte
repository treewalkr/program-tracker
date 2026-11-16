<script lang="ts">
  import type { PortalSession } from "@pt/shared";
  import Icon from "$lib/ui/Icon.svelte";
  import { fmtShortDate, t } from "./i18n.svelte";
  import { cardioParts, setParts } from "./rx";

  /**
   * One session as the client sees it. The session in focus leads: larger
   * name, exercises open, the page's one green action. Others stay folded.
   */
  interface Props {
    session: PortalSession;
    /** Where "Log it" goes; null = view only (next week). */
    logHref: string | null;
    focus?: boolean;
    /** Its day has passed and it's still open: tagged plainly, never as a failure. */
    notLogged?: boolean;
  }

  let { session, logHref, focus = false, notLogged = false }: Props = $props();

  /** The focus card shows its first few exercises; the rest wait behind "Show all". */
  const PREVIEW = 3;
  let showAll = $state(false);
  const folded = $derived(focus && !showAll && session.exercises.length > PREVIEW + 1);
  const listed = $derived(folded ? session.exercises.slice(0, PREVIEW) : session.exercises);

  const cardio = $derived(session.kind === "cardio");
  const count = $derived(session.exercises.length === 1 ? t("session.oneExercise") : t("session.exercises", { n: session.exercises.length }));
  const byCoach = $derived(session.log?.loggedBy === "trainer");
  /** The page's one green action: the session in focus, not yet logged. */
  const lead = $derived(!!logHref && focus && !session.log);
</script>

<article class="card" class:focus class:done={!!session.log} aria-labelledby={`s-${session.id}`}>
  <div class="head">
    <div class="title">
      <h3 id={`s-${session.id}`}>{session.name}</h3>
      {#if cardio}
        <p class="meta"><Icon name="pulse" />{t("session.cardio")}{#if session.cardio && session.cardio.modality !== session.name} · {session.cardio.modality}{/if}</p>
      {:else if session.typeName}
        <p class="meta">{session.typeName}</p>
      {/if}
    </div>
    {#if logHref && !lead && (!session.log || !byCoach)}
      <a class="btn side" href={logHref}>{session.log ? t("session.edit") : t("session.log")}</a>
    {/if}
  </div>
  {#if notLogged && !session.log}
    <div class="status"><span class="pill warn state">{t("session.notLogged")}</span></div>
  {/if}
  {#if session.log}
    <div class="status">
      <span class={["pill", byCoach ? "neutral" : "good", "state"]}>
        <Icon name="check" />{byCoach ? t("session.loggedByCoach") : t("session.loggedByYou")}
        <span class="when">· {fmtShortDate(session.log.date)}</span>
      </span>
    </div>
  {/if}

  {#if lead}
    <a class="btn primary act" href={logHref}>{t("session.log")}</a>
  {/if}

  {#if session.notes}
    <p class="note"><span class="note-by">{t("session.coachNote")}</span> {session.notes}</p>
  {/if}

  {#if cardio && session.cardio}
    {@const parts = cardioParts({ ...session.cardio, intensity: undefined }, t)}
    {#if parts.length}
      <ul class="chips" aria-label={session.cardio.modality}>
        {#each parts as p}<li class="chip">{p}</li>{/each}
      </ul>
    {/if}
    {#if session.cardio.intensity}<p class="intensity">{session.cardio.intensity}</p>{/if}
  {:else if session.exercises.length && focus}
    <ol id={`ex-${session.id}`}>
      {#each listed as e (e.id)}{@render exercise(e)}{/each}
    </ol>
    {#if session.exercises.length > PREVIEW + 1}
      <button type="button" class="more" aria-expanded={showAll} aria-controls={`ex-${session.id}`} onclick={() => (showAll = !showAll)}>
        <span>{showAll ? t("session.showFewer") : t("session.showAll", { n: session.exercises.length })}</span><Icon name="chevron" />
      </button>
    {/if}
  {:else if session.exercises.length}
    <details class="list">
      <summary><span>{count}</span><Icon name="chevron" /></summary>
      <ol>
        {#each session.exercises as e (e.id)}{@render exercise(e)}{/each}
      </ol>
    </details>
  {/if}

</article>

{#snippet exercise(e: PortalSession["exercises"][number])}
  <li>
    <span class="ex">{#if e.group}<span class="grp">{e.group}</span>{/if}{e.exerciseName}</span>
    <span class="chips">{#each setParts(e.prescribedSets, t) as p}<span class="chip">{p}</span>{/each}</span>
    {#if e.notes}<span class="ex-note">{e.notes}</span>{/if}
  </li>
{/snippet}

<style>
  .card {
    display: grid;
    gap: 12px;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  .card.focus:not(.done) { border-color: var(--line-strong); }
  .head { display: flex; align-items: flex-start; gap: 12px; }
  .title { flex: 1; min-width: 0; }
  h3 {
    margin: 0;
    font: 600 17px/1.3 var(--font-ui);
    text-wrap: balance;
  }
  .focus:not(.done) h3 { font-size: 20px; letter-spacing: -0.01em; }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 2px 0 0;
    font-size: 14px;
    color: var(--muted);
  }
  .meta :global(svg) { width: 14px; height: 14px; }
  .state { display: inline-flex; align-items: center; gap: 4px; }
  .state :global(svg) { width: 12px; height: 12px; }
  .done h3 { color: var(--muted); }

  .note { margin: 0; font-size: 14px; color: var(--ink); text-wrap: pretty; }
  .note-by { font-weight: 600; color: var(--muted); margin-right: 2px; }

  .list summary, .more {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 44px;
    margin: -8px 0 -4px;
    font: 500 14px/1.3 var(--font-ui);
    color: var(--blue);
    cursor: pointer;
    list-style: none;
  }
  .more {
    width: 100%;
    margin: -8px 0 -4px;
    padding: 0;
    background: none;
    border: 0;
    border-top: 1px solid var(--line-soft);
  }
  .more[aria-expanded="true"] :global(svg) { transform: rotate(180deg); }
  .more :global(svg) { width: 16px; height: 16px; transition: transform 150ms ease-out; }
  .list summary::-webkit-details-marker { display: none; }
  .list summary :global(svg) { width: 16px; height: 16px; transition: transform 150ms ease-out; }
  .list[open] summary :global(svg) { transform: rotate(180deg); }
  ol { display: grid; margin: 4px 0 0; padding: 0; list-style: none; }
  ol li {
    display: grid;
    gap: 6px;
    padding: 10px 0;
    border-top: 1px solid var(--line-soft);
  }
  .ex { font: 500 15px/1.35 var(--font-ui); }
  .grp {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    margin-right: 8px;
    border: 1px solid var(--line);
    border-radius: 99px;
    font: 600 11px/1 var(--font-mono);
    color: var(--muted);
    vertical-align: 1px;
  }
  .ex-note { font-size: 13px; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 0; list-style: none; }
  .chip {
    padding: 2px 6px;
    border-radius: var(--radius);
    background: var(--chip-bg);
    font: 500 13px/1.4 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .act { justify-content: center; min-height: 48px; font-size: 16px; }
  .side { flex: none; min-height: 40px; padding: 0 14px; font-size: 14px; }
  .status { margin-top: -4px; }
  .when { font-weight: 400; }
  .intensity { margin: 0; font-size: 15px; text-wrap: pretty; }
  @media (prefers-reduced-motion: reduce) {
    .list summary :global(svg), .more :global(svg) { transition: none; }
  }
</style>
