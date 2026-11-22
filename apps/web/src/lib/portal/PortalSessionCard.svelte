<script lang="ts">
  import type { PortalSession } from "@pt/shared";
  import Icon from "$lib/ui/Icon.svelte";
  import { fmtShortDate, i18n, latinLang, t } from "./i18n.svelte";
  import { modalityName } from "./modality";
  import { cardioParts, intervalLines, setParts } from "./rx";
  import { reviewDay } from "./progress";

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
    /** Remove the client's own log (this week only); absent = not removable here. */
    onremove?: (logId: string) => Promise<void>;
  }

  let { session, logHref, focus = false, notLogged = false, onremove }: Props = $props();

  /** Two taps to remove: the first arms it for a few seconds. */
  let armed = $state(false);
  let removing = $state(false);
  let removeFailed = $state(false);
  let disarm: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(disarm));
  const removable = $derived(!!onremove && session.log?.loggedBy === "client");

  async function remove() {
    if (!session.log || !onremove || removing) return;
    if (!armed) {
      armed = true;
      removeFailed = false;
      disarm = setTimeout(() => (armed = false), 4000);
      return;
    }
    clearTimeout(disarm);
    armed = false;
    removing = true;
    try {
      await onremove(session.log.id);
    } catch {
      removeFailed = true;
    } finally {
      removing = false;
    }
  }

  /** The focus card shows its first few exercises; the rest wait behind "Show all". */
  const PREVIEW = 3;
  let showAll = $state(false);
  const folded = $derived(focus && !showAll && session.exercises.length > PREVIEW + 1);
  const listed = $derived(folded ? session.exercises.slice(0, PREVIEW) : session.exercises);

  const cardio = $derived(session.kind === "cardio");
  const count = $derived(session.exercises.length === 1 ? t("session.oneExercise") : t("session.exercises", { n: session.exercises.length }));
  const byCoach = $derived(session.log?.loggedBy === "trainer");
  /** "Didn't do it": resolved, but neither done nor missed. */
  const skipped = $derived(!!session.log?.skipped);
  const feedback = $derived(session.log?.entry?.trainerFeedback?.trim() || null);
  /** The page's one green action: the session in focus, not yet logged. */
  const lead = $derived(!!logHref && focus && !session.log);
</script>

<article class="card" class:focus class:done={!!session.log && !skipped} aria-labelledby={`s-${session.id}`}>
  <div class="head">
    <div class="title">
      <h3 id={`s-${session.id}`} lang={latinLang(session.name)}>{session.name}</h3>
      {#if cardio}
        <p class="meta"><Icon name="pulse" />{t("session.cardio")}{#if session.cardio && session.cardio.modality !== session.name}{" · "}{modalityName(session.cardio.modality, i18n.locale)}{/if}</p>
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
      {#if skipped}
        <span class="pill neutral state">{t("session.skipped")}<span class="when">· {fmtShortDate(session.log.date)}</span></span>
      {:else}
        <span class={["pill", byCoach ? "neutral" : "good", "state"]}>
          <Icon name="check" />{byCoach ? t("session.loggedByCoach") : t("session.loggedByYou")}
          <span class="when">· {fmtShortDate(session.log.date)}</span>
        </span>
      {/if}
      {#if removable}
        <button type="button" class="remove" class:armed disabled={removing} onclick={remove}>
          {removing ? t("session.removing") : armed ? t("session.removeConfirm") : t("session.remove")}
        </button>
      {/if}
    </div>
    {#if removeFailed}<p class="remove-err" role="alert">{t("session.removeFailed")}</p>{/if}
    {#if feedback}
      <!-- the coach's word on this log, once they've reviewed it -->
      <p class="feedback"><span class="fb-by">{t("session.feedback")}{#if session.log.entry?.reviewedAt}{" · "}{fmtShortDate(reviewDay(session.log.entry.reviewedAt))}{/if}</span> {feedback}</p>
    {/if}
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
      <ul class="chips" aria-label={modalityName(session.cardio.modality, i18n.locale)}>
        {#each parts as p}<li class="chip">{p}</li>{/each}
      </ul>
    {/if}
    {#if session.cardio.intensity}<p class="intensity">{session.cardio.intensity}</p>{/if}
    {#if session.cardio.intervals?.length}
      <ol class="iv" aria-label={t("session.intervals")}>
        {#each intervalLines(session.cardio.intervals, t) as l (l.key)}
          <li class="iv-{l.kind}">
            <span class="iv-name">{l.name}</span>
            <span class="iv-amt tnum">{l.amount}</span>
            {#if l.zone || l.bpm || l.extra}
              <span class="iv-target">
                {#if l.zone}<span class="zone">{l.zone}</span>{/if}
                {#if l.bpm}<span class="tnum">{l.bpm}</span>{/if}
                {#if l.extra}<span>{l.extra}</span>{/if}
              </span>
            {/if}
            {#if l.notes}<span class="iv-note">{l.notes}</span>{/if}
          </li>
        {/each}
      </ol>
    {/if}
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
    <span class="ex">{#if e.group}<span class="grp">{e.group}</span>{/if}<span lang={latinLang(e.exerciseName)}>{e.exerciseName}</span></span>
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
    font: 600 16px/1.3 var(--font-ui);
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
  .ex { font: 500 14px/1.35 var(--font-ui); }
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
  .side { flex: none; justify-content: center; min-width: 64px; min-height: 44px; padding: 0 14px; font-size: 14px; }
  .status { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; margin-top: -4px; }
  .remove {
    min-height: 44px;
    margin: -10px -4px -10px 0;
    padding: 0 4px;
    font: 500 14px/1 var(--font-ui);
    color: var(--muted);
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }
  .remove.armed { color: var(--bad); font-weight: 600; }
  .remove:disabled { cursor: default; opacity: 0.7; }
  .remove-err { margin: -4px 0 0; font-size: 14px; color: var(--bad); }
  .when { font-weight: 400; }
  .feedback { margin: 0; padding: 10px 12px; font-size: 15px; background: var(--good-bg); border-radius: var(--radius); text-wrap: pretty; }
  .fb-by { display: block; margin-bottom: 2px; font: 600 13px/1.3 var(--font-ui); color: var(--good); }
  .intensity { margin: 0; font-size: 16px; text-wrap: pretty; }
  /* the session's intervals: one row each, the hard reps on a flat tint */
  .iv { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; }
  .iv li {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 12px;
    padding: 8px 12px;
    border-top: 1px solid var(--line-soft);
  }
  .iv li:first-child { border-top: 0; }
  .iv-name { font: 500 15px/1.35 var(--font-ui); }
  .iv-amt { font: 500 14px/1.35 var(--font-mono); text-align: right; white-space: nowrap; }
  .iv-target, .iv-note { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; font-size: 13px; color: var(--muted); }
  .iv-target .tnum { font-family: var(--font-mono); font-size: 13px; }
  .zone { padding: 0 6px; border-radius: 4px; background: var(--chip-bg); color: var(--ink); font: 600 12px/1.6 var(--font-ui); }
  .iv-work { background: var(--pulse-now-bg); }
  .iv-work .iv-name { font-weight: 600; }
  .iv-work .zone { background: var(--surface); }
  .iv-recovery .iv-name { color: var(--muted); }
  @media (prefers-reduced-motion: reduce) {
    .list summary :global(svg), .more :global(svg) { transition: none; }
  }
</style>
