<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiMode } from "$lib/api";
  import { portalApi } from "$lib/api/portal";
  import type { PortalWeekDto } from "@pt/shared";
  import { localDateOf } from "@pt/shared";
  import { fmtShortDate, latinLang, t, weekdayName } from "$lib/portal/i18n.svelte";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import PortalSessionCard from "$lib/portal/PortalSessionCard.svelte";
  import { dayGroups, doneCount, earlierOpen, focusSession } from "$lib/portal/week";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  let { data } = $props();

  const me = $derived(data.portal.kind === "signedIn" ? data.portal.me : null);
  const firstName = $derived(me?.client.name.trim().split(/\s+/)[0] ?? "");

  let dto = $state<PortalWeekDto | null>(null);
  let failed = $state(false);
  /** Render cold starts take 30–50 s: after a few seconds say so, instead of looking broken. */
  let slow = $state(false);
  let tab = $state<"this" | "next">("this");
  const today = localDateOf(Date.now());

  async function load() {
    failed = false;
    slow = false;
    const timer = setTimeout(() => (slow = true), 4000);
    try {
      dto = await portalApi.week();
    } catch {
      failed = true;
    } finally {
      clearTimeout(timer);
      slow = false;
    }
  }

  $effect(() => {
    void load();
  });

  const current = $derived(dto?.weeks.find((w) => w.loggable) ?? null);
  const next = $derived(dto?.weeks.find((w) => !w.loggable) ?? null);
  const shown = $derived(tab === "next" && next ? next : current);
  /** The calendar leaves out the session "Next up" already shows, and any day that leaves empty. */
  const groups = $derived(
    shown
      ? dayGroups(shown, today)
          .map((g) => (shown === current && nextUp ? { ...g, sessions: g.sessions.filter((s) => s.id !== nextUp.id) } : g))
          .filter((g) => g.sessions.length > 0)
      : [],
  );
  /** "Next up" leads the page: today's first open session, else the next one. */
  const nextUp = $derived(current ? focusSession(current, today) : null);
  const nextUpDay = $derived(current && nextUp ? (dayGroups(current, today).find((g) => g.sessions.some((s) => s.id === nextUp.id)) ?? null) : null);
  const earlier = $derived(current ? earlierOpen(current, today, nextUp?.id ?? null) : []);
  const earlierN = $derived(earlier.reduce((n, g) => n + g.sessions.length, 0));
  /** A past day of this week whose session is still open. */
  const pastOpen = (date: string | null, loggable = true) => loggable && !!date && date < today;

  async function signOut() {
    await portalApi.signOut();
    await goto("/me/login", { invalidateAll: true });
  }

  function onTabKey(e: KeyboardEvent) {
    if (!next || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    tab = tab === "this" ? "next" : "this";
    document.getElementById(`wk-${tab}`)?.focus();
  }
</script>

<svelte:head><title>{t("app.title")} · Program Tracker</title></svelte:head>

<PortalBar coach={me?.trainer.name ?? null} />

<header class="hello">
  <h1>{t("header.hi", { name: firstName })}</h1>
  {#if dto?.program && current}
    <p class="sub">
      <span lang={latinLang(dto.program.name)}>{dto.program.name}</span>
      <span aria-hidden="true">·</span>
      <span>{t("header.week", { n: current.week })}</span>
      <span class="tnum progress">{t("week.progress", { done: doneCount(current), total: current.sessions.length })}</span>
    </p>
    {#if current.weekLabel}<p class="week-label">{t(`week.label.${current.weekLabel}`)}</p>{/if}
  {/if}
</header>

{#if dto === null && !failed}
  <div class="loading" role="status" aria-live="polite">
    <span class="sr-only">{t("week.loading")}</span>
    {#if slow}<p class="slow">{t("week.slow")}</p>{/if}
    <div aria-hidden="true" class="sk">
      <Skeleton h="44px" />
      {#each [0, 1, 2] as i (i)}
        <div class="sk-card">
          <Skeleton shape="line" w="35%" h="12px" />
          <Skeleton shape="line" w="70%" h="18px" />
          <Skeleton shape="line" w="45%" h="12px" />
        </div>
      {/each}
    </div>
  </div>
{:else if failed}
  <div class="empty" role="alert">
    <p class="empty-title">{t("week.error")}</p>
    <Button onclick={load}>{t("week.retry")}</Button>
  </div>
{:else if dto && !dto.program}
  <div class="empty">
    <p class="empty-title">{t("week.emptyProgram")}</p>
    <p class="empty-hint">{t("week.emptyProgramHint")}</p>
  </div>
{:else if shown}
  {#if current && nextUp}
    <section class="next-up" aria-labelledby="next-up-h">
      <h2 id="next-up-h">
        {t("week.nextUp")}
        {#if nextUpDay}
          <span class="date">
            {#if nextUpDay.weekday === 0}{t("week.anyDay")}{:else if nextUpDay.isToday}{t("week.today")}{:else}{weekdayName(nextUpDay.weekday)}{/if}{#if nextUpDay.date}{" · "}<span class="tnum">{fmtShortDate(nextUpDay.date)}</span>{/if}
          </span>
        {/if}
      </h2>
      <PortalSessionCard session={nextUp} focus logHref={`/me/log/${nextUp.id}`} notLogged={pastOpen(nextUpDay?.date ?? null)} />
    </section>
  {:else if current && current.sessions.length > 0}
    <p class="all-done"><Icon name="check" />{t("week.allDone", { total: current.sessions.length })}</p>
  {/if}

  {#if earlier.length > 0}
    <details class="earlier">
      <summary>
        <span>{t("week.earlier")}</span>
        <span class="pill warn">{t("week.earlierCount", { n: earlierN })}</span>
        <Icon name="chevron" />
      </summary>
      <div class="earlier-days">
        {#each earlier as g (g.weekday)}
          <section class="day" aria-labelledby={`e-${g.weekday}`}>
            <h3 id={`e-${g.weekday}`}>
              <span>{weekdayName(g.weekday)}</span>
              {#if g.date}<span class="date tnum">{fmtShortDate(g.date)}</span>{/if}
            </h3>
            <div class="cards">
              {#each g.sessions as s (s.id)}
                <PortalSessionCard session={s} notLogged logHref={`/me/log/${s.id}`} />
              {/each}
            </div>
          </section>
        {/each}
      </div>
    </details>
  {/if}

  <div class="tabs wk" role="tablist" aria-label={t("app.title")}>
    <button type="button" role="tab" id="wk-this" aria-selected={tab === "this"} aria-controls="wk-panel" tabindex={tab === "this" ? 0 : -1} class:on={tab === "this"} onclick={() => (tab = "this")} onkeydown={onTabKey}>
      {t("week.this")}
    </button>
    {#if next}
      <button type="button" role="tab" id="wk-next" aria-selected={tab === "next"} aria-controls="wk-panel" tabindex={tab === "next" ? 0 : -1} class:on={tab === "next"} onclick={() => (tab = "next")} onkeydown={onTabKey}>
        {t("week.next")}
      </button>
    {/if}
    <span class="range tnum">{t("week.range", { from: fmtShortDate(shown.startDate), to: fmtShortDate(shown.endDate) })}</span>
  </div>

  <div id="wk-panel" role="tabpanel" tabindex="-1" aria-labelledby={`wk-${tab}`} class="days">
    {#if !shown.loggable}<p class="preview">{t("week.nextPreview")}</p>{/if}
    {#if !shown.loggable && shown.weekLabel}<p class="week-label">{t(`week.label.${shown.weekLabel}`)}</p>{/if}
    {#if groups.length === 0 && shown.sessions.length === 0}
      <div class="empty"><p class="empty-title">{t("week.emptyWeek")}</p></div>
    {/if}
    {#each groups as g (g.weekday)}
      <section class="day" class:today={g.isToday && shown.loggable} aria-labelledby={`d-${g.weekday}`}>
        <h2 id={`d-${g.weekday}`}>
          {#if g.weekday === 0}
            {t("week.anyDay")}
          {:else}
            <span>{weekdayName(g.weekday)}</span>
            {#if g.date}<span class="date tnum">{fmtShortDate(g.date)}</span>{/if}
            {#if g.isToday && shown.loggable}<span class="pill today-pill">{t("week.today")}</span>{/if}
          {/if}
        </h2>
        <div class="cards">
          {#each g.sessions as s (s.id)}
            <PortalSessionCard session={s} notLogged={pastOpen(g.date, shown.loggable)} logHref={shown.loggable ? `/me/log/${s.id}` : null} />
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}

{#if apiMode === "live"}
  <footer class="foot">
    <button type="button" class="link-out" onclick={signOut}>{t("header.signOut")}</button>
  </footer>
{/if}

<style>
  .hello { margin: 20px 0 16px; }
  h1 {
    margin: 0;
    font: 600 26px/1.2 var(--font-ui);
    letter-spacing: -0.015em;
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 8px;
    margin: 6px 0 0;
    font-size: 14px;
    color: var(--muted);
  }
  .progress {
    margin-left: auto;
    padding: 1px 10px;
    border: 1px solid var(--line);
    border-radius: 99px;
    font-size: 13px;
    color: var(--muted);
    background: var(--surface);
  }

  .wk { position: sticky; top: 0; z-index: 2; background: var(--bg); align-items: center; }
  .wk button { min-height: 44px; font-size: 16px; }
  .range { margin-left: auto; font-size: 13px; color: var(--muted); white-space: nowrap; }

  .next-up { display: grid; gap: 10px; margin-bottom: 20px; }
  .next-up h2 { padding: 0; }
  .all-done {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 20px;
    padding: 12px 16px;
    border: 1px solid var(--good-line);
    border-radius: var(--radius);
    background: var(--good-bg);
    font-weight: 500;
  }
  .all-done :global(svg) { flex: none; width: 16px; height: 16px; color: var(--good); }

  .earlier { margin-bottom: 20px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .earlier summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 16px;
    font: 600 16px/1.3 var(--font-ui);
    cursor: pointer;
    list-style: none;
  }
  .earlier summary::-webkit-details-marker { display: none; }
  .earlier summary :global(svg) { width: 16px; height: 16px; margin-left: auto; color: var(--muted); transition: transform 150ms ease-out; }
  .earlier[open] summary :global(svg) { transform: rotate(180deg); }
  .earlier-days { display: grid; gap: 16px; padding: 4px 16px 16px; border-top: 1px solid var(--line-soft); }
  .earlier-days .day { padding-top: 12px; }
  h3 { display: flex; align-items: center; gap: 8px; margin: 0; font: 600 14px/1.3 var(--font-ui); }

  .days { display: grid; gap: 24px; padding-top: 16px; }
  .preview { margin: 0; font-size: 14px; color: var(--muted); }
  .week-label { margin: 10px 0 0; padding: 10px 12px; font-size: 14px; color: var(--ink); background: var(--well); border-radius: var(--radius); text-wrap: pretty; }
  .days > .week-label { margin: 0; }
  .day { display: grid; gap: 10px; }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 6px 0;
    font: 600 14px/1.3 var(--font-ui);
  }
  .date { font-weight: 400; font-size: 14px; color: var(--muted); }
  .today h2 {
    padding: 6px 8px;
    border-radius: var(--radius);
    background: var(--pulse-now-bg);
    color: var(--ink);
  }
  .today-pill { margin-left: auto; color: var(--blue); border-color: var(--blue-line); background: var(--surface); }
  .cards { display: grid; gap: 10px; }

  .loading { display: grid; gap: 16px; }
  .slow { margin: 0; font-size: 14px; color: var(--muted); }
  .sk { display: grid; gap: 12px; }
  .sk :global(.skeleton) { display: block; }
  .sk-card { display: grid; gap: 8px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); }

  .empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 40px 16px;
    text-align: center;
    border: 1px dashed var(--line);
    border-radius: var(--radius);
  }
  .empty-title { margin: 0; font-weight: 600; text-wrap: balance; }
  .empty-hint { margin: 0; font-size: 14px; color: var(--muted); text-wrap: pretty; }

  .foot { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--line-soft); text-align: center; }
  .link-out {
    min-height: 44px;
    padding: 0 12px;
    font: 500 14px/1 var(--font-ui);
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .link-out:hover { color: var(--ink); }
  @media (prefers-reduced-motion: reduce) {
    .earlier summary :global(svg) { transition: none; }
  }
</style>
