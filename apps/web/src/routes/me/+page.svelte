<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiMode } from "$lib/api";
  import { portalApi } from "$lib/api/portal";
  import type { PortalProgressDto, PortalWeekDto, Vo2Protocol } from "@pt/shared";
  import { localDateOf } from "@pt/shared";
  import { fmtDay, fmtShortDate, latinLang, t, weekdayName } from "$lib/portal/i18n.svelte";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import PortalSessionCard from "$lib/portal/PortalSessionCard.svelte";
  import PortalProgress from "$lib/portal/PortalProgress.svelte";
  import { calendarDays, dayGroups, doneCount, earlierOpen, focusSession, skippedCount } from "$lib/portal/week";
  import { cardioSummary } from "$lib/portal/progress";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import { cachedWeekDto, portalDraftKey, PORTAL_WEEK_CACHE_KEY, PORTAL_WEEK_DTO_CACHE_KEY, portalWeekCacheJson } from "$lib/portal/logForm";
  import { clearPortalCopies } from "$lib/portal/offline";

  let { data } = $props();

  const me = $derived(data.portal.kind === "signedIn" ? data.portal.me : null);
  const firstName = $derived(me?.client.name.trim().split(/\s+/)[0] ?? "");

  let dto = $state<PortalWeekDto | null>(null);
  let failed = $state(false);
  /** Showing this phone's copy of the week: the connection dropped. */
  let offline = $state(false);
  /** Render cold starts take 30–50 s: after a few seconds say so, instead of looking broken. */
  let slow = $state(false);
  let tab = $state<"this" | "next" | "progress">("this");
  let progress = $state<PortalProgressDto | null>(null);
  let progressFailed = $state(false);

  /** The Progress tab loads when first opened, and again for another field test. */
  async function loadProgress(protocol?: Vo2Protocol) {
    progressFailed = false;
    try {
      progress = await portalApi.progress(protocol ?? progress?.vo2.protocol ?? null);
    } catch {
      progressFailed = true;
    }
  }
  $effect(() => {
    if (tab === "progress" && !progress) void loadProgress();
  });
  const today = localDateOf(Date.now());

  async function load() {
    failed = false;
    slow = false;
    const timer = setTimeout(() => (slow = true), 4000);
    try {
      dto = await portalApi.week();
      offline = false;
      keepCopy(dto);
    } catch {
      // no signal: the week as last loaded here, so the member can still open today's session
      const copy = cachedWeekDto(readStored(PORTAL_WEEK_DTO_CACHE_KEY), today);
      if (copy) {
        dto = copy;
        offline = true;
      } else failed = true;
    } finally {
      clearTimeout(timer);
      slow = false;
    }
  }

  $effect(() => {
    void load();
  });

  function readStored(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  /** Sessions with a half-logged draft on this phone: their card says "Continue". */
  const drafts = $derived.by(() => {
    const ids = new Set<string>();
    for (const w of dto?.weeks ?? []) for (const x of w.sessions) if (!x.log && readStored(portalDraftKey(x.id))) ids.add(x.id);
    return ids;
  });

  /** Keep the week on this phone: the home page and every session in it open offline. */
  function keepCopy(d: PortalWeekDto) {
    try {
      localStorage.setItem(PORTAL_WEEK_DTO_CACHE_KEY, JSON.stringify(d));
      const on = d.weeks.find((w) => w.loggable);
      if (on) localStorage.setItem(PORTAL_WEEK_CACHE_KEY, portalWeekCacheJson(on));
    } catch {
      // storage full or private mode: no offline copy, nothing else changes
    }
  }

  /** Week 1's start date while it is still ahead: the page previews Week 1 under a banner. */
  const startsOn = $derived(dto?.program?.startsOn && today < dto.program.startsOn ? dto.program.startsOn : null);
  const current = $derived(dto?.weeks.find((w) => w.loggable) ?? (startsOn ? (dto?.weeks[0] ?? null) : null));
  const next = $derived(dto?.weeks.find((w) => !w.loggable && w !== current) ?? null);
  const shown = $derived(tab === "next" && next ? next : current);
  const tabs = $derived<("this" | "next" | "progress")[]>(next ? ["this", "next", "progress"] : ["this", "progress"]);
  /** "Next up" leads the page: today's first open session, else the next one. */
  const nextUp = $derived(current?.loggable ? focusSession(current, today) : null);
  const nextUpDay = $derived(current && nextUp ? (dayGroups(current, today).find((g) => g.sessions.some((s) => s.id === nextUp.id)) ?? null) : null);
  const earlier = $derived(current?.loggable ? earlierOpen(current, today, nextUp?.id ?? null) : []);
  const earlierN = $derived(earlier.reduce((n, g) => n + g.sessions.length, 0));
  /** This week's calendar leaves out what "Next up" and "Earlier this week" already show. */
  const groups = $derived(
    !shown
      ? []
      : shown === current
        ? calendarDays(shown, today, [...(nextUp ? [nextUp.id] : []), ...earlier.flatMap((g) => g.sessions.map((s) => s.id))])
        : calendarDays(shown, today, []),
  );
  /** A past day of this week whose session is still open. */
  const pastOpen = (date: string | null, loggable = true) => loggable && !!date && date < today;

  /** Remove one of your own logs from this week, then show the week as it now stands. */
  async function removeLog(id: string) {
    await portalApi.deleteLog(id);
    dto = await portalApi.week();
  }

  let signOutFailed = $state(false);
  async function signOut() {
    signOutFailed = false;
    try {
      await portalApi.signOut();
    } catch {
      // still signed in on the server: say so, and keep the member here
      signOutFailed = true;
      return;
    }
    // a shared phone: the next person shouldn't see this member's week
    clearPortalCopies();
    await goto("/me/login", { invalidateAll: true });
  }

  function onTabKey(e: KeyboardEvent) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = tabs.indexOf(tab);
    tab = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
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
    {#if dto.cardio}
      {@const c = dto.cardio}
      {@const sum = cardioSummary(c, t)}
      <div class="cardio">
        <p><span>{t("week.cardio")}</span> <strong class="tnum">{sum.lead}</strong></p>
        <div class="cbar" aria-hidden="true"><span style:width={`${Math.min(100, (c.done / Math.max(1, c.target)) * 100)}%`}></span></div>
        {#if sum.second}<p class="second tnum">{sum.second}</p>{/if}
      </div>
    {/if}
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
  {#if offline}
    <div class="offline"><Note tone="warn" role="status">{t("week.offline")}</Note></div>
  {/if}
  {#if startsOn}
    <section class="starts" role="status">
      <p class="starts-title">{t("week.startsOn", { date: fmtDay(startsOn) })}</p>
      <p class="starts-hint">{t("week.startsOnHint")}</p>
    </section>
  {/if}
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
      <PortalSessionCard session={nextUp} draft={drafts.has(nextUp.id)} focus logHref={`/me/log/${nextUp.id}`} notLogged={pastOpen(nextUpDay?.date ?? null)} onremove={removeLog} />
    </section>
  {:else if current?.loggable && current.sessions.length > 0}
    {@const skippedN = skippedCount(current)}
    <p class="all-done"><Icon name="check" />{skippedN ? t("week.allResolved", { done: doneCount(current), skipped: skippedN }) : t("week.allDone", { total: current.sessions.length })}</p>
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
                <PortalSessionCard session={s} draft={drafts.has(s.id)} notLogged logHref={`/me/log/${s.id}`} />
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
    <button type="button" role="tab" id="wk-progress" aria-selected={tab === "progress"} aria-controls="wk-panel" tabindex={tab === "progress" ? 0 : -1} class:on={tab === "progress"} onclick={() => (tab = "progress")} onkeydown={onTabKey}>
      {t("week.progressTab")}
    </button>
    {#if tab !== "progress"}
      <span class="range tnum">{t("week.range", { from: fmtShortDate(shown.startDate), to: fmtShortDate(shown.endDate) })}</span>
    {/if}
  </div>

  {#if tab === "progress"}
    <div id="wk-panel" role="tabpanel" tabindex="-1" aria-labelledby="wk-progress" class="days">
      {#if progress}
        <PortalProgress {progress} onprotocol={(p) => loadProgress(p)} />
      {:else if progressFailed}
        <div class="empty" role="alert">
          <p class="empty-title">{t("progress.error")}</p>
          <Button onclick={() => loadProgress()}>{t("week.retry")}</Button>
        </div>
      {:else}
        <div class="sk" role="status" aria-live="polite">
          <span class="sr-only">{t("progress.loading")}</span>
          <Skeleton h="140px" />
          <Skeleton h="120px" />
        </div>
      {/if}
    </div>
  {:else}
  <div id="wk-panel" role="tabpanel" tabindex="-1" aria-labelledby={`wk-${tab}`} class="days">
    {#if !shown.loggable && !(startsOn && shown === current)}<p class="preview">{t("week.nextPreview")}</p>{/if}
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
            <PortalSessionCard session={s} draft={drafts.has(s.id)} notLogged={pastOpen(g.date, shown.loggable)} logHref={shown.loggable ? `/me/log/${s.id}` : null} onremove={shown.loggable ? removeLog : undefined} />
          {/each}
        </div>
      </section>
    {/each}
  </div>
  {/if}
{/if}

{#if apiMode === "live"}
  <footer class="foot">
    {#if signOutFailed}<p class="out-err" role="alert">{t("header.signOutFailed")}</p>{/if}
    <button type="button" class="link-out" onclick={signOut}>{t("header.signOut")}</button>
  </footer>
{/if}

<style>
  .offline { margin-bottom: 16px; }
  .out-err { margin: 0 0 8px; font-size: 14px; color: var(--bad); }
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
  /* a zoomed-in phone: every tab in sight (wrapped) rather than one cut off with no scrollbar or fade */
  @media (max-width: 359px) {
    .wk { flex-wrap: wrap; }
  }

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
  .starts {
    margin: 0 0 20px;
    padding: 14px 16px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--pulse-now-bg);
  }
  .starts-title { margin: 0; font: 600 17px/1.3 var(--font-ui); text-wrap: balance; }
  .starts-hint { margin: 4px 0 0; font-size: 14px; color: var(--muted); text-wrap: pretty; }

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
  .cardio { display: grid; gap: 6px; margin-top: 12px; }
  .cardio p { margin: 0; font-size: 14px; color: var(--muted); }
  .cardio strong { margin-left: 4px; font-weight: 600; color: var(--ink); }
  .cardio .second { font-size: 13px; }
  .cbar { height: 6px; border-radius: 99px; background: var(--well-2); overflow: hidden; }
  .cbar span { display: block; height: 100%; border-radius: 99px; background: var(--good); }
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
