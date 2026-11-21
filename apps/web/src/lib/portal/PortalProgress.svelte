<script lang="ts">
  import type { PortalProgressDto, Vo2Protocol } from "@pt/shared";
  import Icon from "$lib/ui/Icon.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import { fmtShortDate, latinLang, t } from "./i18n.svelte";
  import { cardioDistance, hoursMinutes, logLine, reviewDay, trendPath, vo2Delta } from "./progress";

  /**
   * The Progress tab: this week's cardio, the VO₂max trend, the coach's
   * latest word and the recent cardio — all read-only, all the member's own.
   */
  interface Props {
    progress: PortalProgressDto;
    /** Pick another field test's trend. */
    onprotocol?: (p: Vo2Protocol) => void;
  }

  let { progress, onprotocol }: Props = $props();

  const week = $derived(progress.week);
  const modalities = $derived(Object.entries(week.byModality).filter(([, m]) => m.sessions > 0));
  const vo2 = $derived(progress.vo2);
  const last = $derived(vo2.points.at(-1) ?? null);
  const delta = $derived(vo2Delta(vo2.points));
  const path = $derived(trendPath(vo2.points, 260, 44));
  const feedback = $derived(progress.recent.filter((l) => l.trainerFeedback));
  const latestWord = $derived(feedback[0] ?? null);
</script>

<div class="progress">
  <section class="card" aria-labelledby="pg-week">
    <h3 id="pg-week">{t("progress.week")}</h3>
    {#if progress.target}
      {@const c = progress.target}
      <p class="target">
        <strong class="tnum">{t(`week.cardio.${c.unit}`, { done: c.done, target: c.target })}</strong>
      </p>
      <div class="cbar" aria-hidden="true"><span style:width={`${Math.min(100, (c.done / Math.max(1, c.target)) * 100)}%`}></span></div>
    {/if}
    <dl class="rows">
      <div><dt>{t("progress.sessions")}</dt><dd class="tnum">{week.sessions}</dd></div>
      <div><dt>{t("progress.time")}</dt><dd class="tnum">{hoursMinutes(week.minutes, t)}</dd></div>
      <div><dt>{t("progress.load")}</dt><dd class="tnum">{Math.round(week.load)}</dd></div>
      {#each modalities as [name, m] (name)}
        <div>
          <dt lang={latinLang(name)}>{name}</dt>
          <dd class="tnum">{m.distanceKm > 0 ? cardioDistance(m.distanceKm, t) : hoursMinutes(m.minutes, t)}</dd>
        </div>
      {/each}
    </dl>
    {#if week.sessions === 0}<p class="quiet">{t("progress.weekEmpty")}</p>{/if}
  </section>

  {#if vo2.protocol && last}
    <section class="card" aria-labelledby="pg-vo2">
      <h3 id="pg-vo2">
        {t("progress.vo2")}
        {#if delta != null && delta !== 0}
          <span class={["pill", delta > 0 ? "good" : "neutral"]}>{delta > 0 ? "+" : "−"}{Math.abs(delta)}</span>
        {/if}
      </h3>
      <p class="vo2"><span class="big tnum">{last.value}</span> <span class="unit">ml/kg/min · {t(`vo2.${vo2.protocol}`)} · {fmtShortDate(last.testedOn)}</span></p>
      {#if vo2.points.length > 1}
        <svg class="trend" viewBox="0 0 260 44" preserveAspectRatio="none" role="img" aria-label={t("progress.vo2Trend", { n: vo2.points.length })}>
          <polyline points={path.line} />
          {#each path.dots as d, i (i)}<circle cx={d.x} cy={d.y} r="3" />{/each}
        </svg>
      {/if}
      {#if vo2.protocols.length > 1 && onprotocol}
        <Segmented
          label={t("progress.vo2Test")}
          items={vo2.protocols.map((p) => ({ value: p, label: t(`vo2.${p}`) }))}
          value={vo2.protocol}
          onchange={(p) => onprotocol(p)}
        />
      {/if}
      <p class="quiet">{t("progress.vo2Note")}</p>
    </section>
  {/if}

  {#if latestWord}
    <section class="card word" aria-labelledby="pg-word">
      <h3 id="pg-word">
        {t("progress.fromCoach", { date: fmtShortDate(latestWord.reviewedAt ? reviewDay(latestWord.reviewedAt) : latestWord.date) })}
        <span class="pill good"><Icon name="check" />{t("progress.reviewed")}</span>
      </h3>
      <p class="said">{latestWord.trainerFeedback}</p>
      <p class="quiet">{fmtShortDate(latestWord.date)} · <span lang={latinLang(latestWord.modality)}>{latestWord.modality}</span></p>
    </section>
  {/if}

  <section aria-labelledby="pg-recent">
    <h3 id="pg-recent" class="sub-h">{t("progress.recent")}</h3>
    {#if progress.recent.length === 0}
      <p class="quiet">{t("progress.recentEmpty")}</p>
    {:else}
      <ol class="recent">
        {#each progress.recent as l (l.id)}
          {@const line = logLine(l, t)}
          <li class="card">
            <div class="r1">
              <span>{fmtShortDate(l.date)} · <span lang={latinLang(l.modality)}>{l.modality}</span></span>
              <span class="tnum mono">{line.time}</span>
            </div>
            <div class="r2">
              <span>{line.detail}</span>
              {#if l.load != null}<span class="tnum">{t("progress.loadN", { n: l.load })}</span>{/if}
            </div>
            {#if l.loggedBy === "trainer"}<p class="by">{t("progress.byCoach")}</p>{/if}
            {#if l.trainerFeedback && l !== latestWord}
              <p class="fb"><span>{t("session.coachSays")}</span> {l.trainerFeedback}</p>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}
  </section>
</div>

<style>
  .progress { display: grid; gap: 12px; }
  .card {
    display: grid;
    gap: 8px;
    padding: 14px 16px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
  }
  h3 { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0; font: 600 14px/1.3 var(--font-ui); color: var(--muted); }
  .sub-h { margin: 8px 0 8px; }
  .pill { display: inline-flex; align-items: center; gap: 4px; }
  .pill :global(svg) { width: 12px; height: 12px; }
  .target { margin: 0; font-size: 16px; }
  .cbar { height: 6px; border-radius: 99px; background: var(--well-2); overflow: hidden; }
  .cbar span { display: block; height: 100%; border-radius: 99px; background: var(--good); }
  .rows { display: grid; gap: 0; margin: 0; }
  .rows div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 0; border-top: 1px solid var(--line-soft); font-size: 15px; }
  .rows div:first-child { border-top: 0; }
  .rows dt { color: var(--ink); }
  .rows dd { margin: 0; font-family: var(--font-mono); font-size: 14px; }
  .vo2 { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
  .big { font: 600 32px/1.1 var(--font-ui); letter-spacing: -0.02em; }
  .unit { font-size: 13px; color: var(--muted); }
  .trend { width: 100%; height: 44px; overflow: visible; }
  .trend polyline { fill: none; stroke: var(--good); stroke-width: 2; vector-effect: non-scaling-stroke; }
  .trend circle { fill: var(--good); }
  .quiet { margin: 0; font-size: 13px; color: var(--muted); text-wrap: pretty; }
  .word { border-color: var(--good-line); }
  .said { margin: 0; font-size: 16px; text-wrap: pretty; }
  .recent { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
  .recent .card { gap: 2px; padding: 10px 14px; }
  .r1, .r2 { display: flex; justify-content: space-between; gap: 12px; }
  .r1 { font: 500 15px/1.35 var(--font-ui); }
  .r2 { font-size: 13px; color: var(--muted); }
  .mono { font-family: var(--font-mono); font-size: 14px; }
  .by { margin: 2px 0 0; font-size: 13px; color: var(--muted); }
  .fb { margin: 6px 0 0; padding: 8px 10px; font-size: 14px; background: var(--good-bg); border-radius: var(--radius); text-wrap: pretty; }
  .fb span { font-weight: 600; color: var(--good); margin-right: 2px; }
</style>
