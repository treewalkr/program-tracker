<script lang="ts">
  import { goto } from "$app/navigation";
  import { apiMode } from "$lib/api";
  import { portalApi } from "$lib/api/portal";
  import type { PortalWeekDto } from "@pt/shared";
  import { localDateOf } from "@pt/shared";
  import { fmtShortDate, t, weekdayName } from "$lib/portal/i18n.svelte";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import PortalSessionCard from "$lib/portal/PortalSessionCard.svelte";
  import { dayGroups, doneCount, focusSessionId } from "$lib/portal/week";
  import Button from "$lib/ui/Button.svelte";
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
  const groups = $derived(shown ? dayGroups(shown, today) : []);
  const focus = $derived(current && shown === current ? focusSessionId(current, today) : null);

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

<PortalBar coach={me ? t("header.coach", { trainer: me.trainer.name }) : null} />

<header class="hello">
  <h1>{t("header.hi", { name: firstName })}</h1>
  {#if dto?.program && current}
    <p class="sub">
      <span>{dto.program.name}</span>
      <span aria-hidden="true">·</span>
      <span>{t("header.week", { n: current.week })}</span>
      <span class="tnum progress">{t("week.progress", { done: doneCount(current), total: current.sessions.length })}</span>
    </p>
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
    {#if groups.length === 0}
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
            <PortalSessionCard session={s} focus={s.id === focus} logHref={shown.loggable ? `/me/log/${s.id}` : null} />
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
    font-size: 15px;
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
  .wk button { min-height: 44px; font-size: 15px; }
  .range { margin-left: auto; font-size: 13px; color: var(--muted); white-space: nowrap; }

  .days { display: grid; gap: 24px; padding-top: 16px; }
  .preview { margin: 0; font-size: 14px; color: var(--muted); }
  .day { display: grid; gap: 10px; }
  h2 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    font: 600 15px/1.3 var(--font-ui);
  }
  .date { font-weight: 400; font-size: 14px; color: var(--muted); }
  .today h2 {
    margin: 0 -8px;
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
</style>
