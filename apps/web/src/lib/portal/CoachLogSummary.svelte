<script lang="ts">
  import type { PortalLoggedSet, PortalSession } from "@pt/shared";
  import Pill from "$lib/ui/Pill.svelte";
  import { fmtShortDate, latinLang, t } from "./i18n.svelte";
  import { coachLogLines, type CoachLogLine } from "./coachLog";
  import { reviewDay } from "./progress";
  import { cardioActualParts, lastSetText, weightText } from "./rx";

  /**
   * A session the coach logged, read back to the member: what was done and the coach's
   * word on it. Read-only. The coach's log is theirs to change, so the only way on is
   * to tell them.
   */
  interface Props {
    session: PortalSession;
    /** The coach's name; null when the page doesn't know it (an offline copy). */
    coach: string | null;
  }

  let { session, coach }: Props = $props();
  const log = $derived(session.log);
  const entry = $derived(log?.entry ?? null);
  const skipped = $derived(!!log?.skipped);
  const cardio = $derived(session.kind === "cardio");
  const cardioLine = $derived(cardio && !skipped && entry?.cardio ? cardioActualParts(entry.cardio, t) : []);
  const lines = $derived(!cardio && entry ? coachLogLines(session, entry) : []);
  const feedback = $derived(entry?.trainerFeedback?.trim() || null);

  /** "6 kg × 12 · RPE 8", "BW × 12" on a bodyweight move, else "12 reps"; a timed set says its seconds ("40 s", "16 kg · 40 s"). */
  function setText(s: PortalLoggedSet, line: CoachLogLine): string {
    const loaded = s.weightKg != null && s.weightKg > 0;
    if (!line.timed && (loaded || line.bodyweight)) return lastSetText(s, t);
    const parts = [loaded ? weightText(s.weightKg!, t) : null, line.timed ? t("rx.seconds", { n: s.reps }) : t("rx.reps", { n: s.reps }), s.rpe != null ? t("rx.rpe", { n: s.rpe }) : null];
    return parts.filter(Boolean).join(" · ");
  }
</script>

{#if log}
  <section class="coach-log" aria-labelledby="coach-log-title">
    <h2 id="coach-log-title">{t("log.coachLoggedTitle")}</h2>
    <p class="when">{t("log.coachLogged", { date: fmtShortDate(log.date) })}</p>

    <!-- the coach's word first: on a long session the list would push it off the screen -->
    {#if feedback}
      <p class="feedback">
        <span class="fb-by">{t("session.feedback")}{#if entry?.reviewedAt}{" · "}{fmtShortDate(reviewDay(entry.reviewedAt))}{/if}</span>
        {feedback}
      </p>
    {/if}

    {#if skipped}
      <p class="figures"><Pill>{t("session.skipped")}</Pill></p>
    {:else if cardio}
      {#if cardioLine.length}<p class="figures tnum">{cardioLine.join(" · ")}</p>{/if}
    {:else if lines.length}
      <ol class="lines">
        {#each lines as line (line.key)}
          <li>
            <span class="name" lang={latinLang(line.name ?? "")}>{line.name ?? t("log.extraSets")}</span>
            {#if line.sets.length}
              <ol class="sets tnum">
                {#each line.sets as s, i (i)}
                  <li><span class="n">{t("log.set", { n: s.setNumber })}</span> {setText(s, line)}</li>
                {/each}
              </ol>
            {:else if line.skipped}
              <span class="skip"><Pill>{t("session.skipped")}{#if line.skipped.reason}{" · "}{t(`log.reason.${line.skipped.reason}`)}{/if}</Pill></span>
            {:else}
              <span class="none">{t("log.coachNothing")}</span>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}


    <!-- no message path in the portal yet: say who to tell, without a dead button -->
    <p class="tell">{coach ? t("log.coachTell", { coach }) : t("log.coachTellYours")}</p>
  </section>
{/if}

<style>
  .coach-log { display: grid; gap: 12px; }
  h2 { margin: 0; font: 600 17px/1.3 var(--font-ui); }
  .when { margin: -8px 0 0; font-size: 14px; color: var(--muted); }
  .figures { margin: 0; font: 500 15px/1.4 var(--font-mono); }
  .lines { display: grid; margin: 0; padding: 0; list-style: none; border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; }
  .lines > li { display: grid; gap: 4px; padding: 10px 12px; }
  .lines > li + li { border-top: 1px solid var(--line-soft); }
  .name { font: 600 15px/1.35 var(--font-ui); overflow-wrap: anywhere; }
  .sets { display: grid; gap: 2px; margin: 0; padding: 0; list-style: none; font: 500 15px/1.4 var(--font-ui); font-variant-numeric: tabular-nums; }
  .sets .n { display: inline-block; min-width: 4.5em; color: var(--muted); }
  .none { font-size: 14px; color: var(--muted); }
  .skip :global(.pill) { font-size: 13px; }
  .feedback { margin: 0; padding: 10px 12px; font-size: 15px; background: var(--good-bg); border-radius: var(--radius); text-wrap: pretty; }
  .fb-by { display: block; margin-bottom: 2px; font: 600 13px/1.3 var(--font-ui); color: var(--good); }
  .tell { margin: 0; font-size: 14px; color: var(--muted); text-wrap: pretty; }
</style>
