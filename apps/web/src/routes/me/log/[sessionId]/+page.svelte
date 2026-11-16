<script lang="ts">
  import { page } from "$app/state";
  import { addDays, localDateOf, type PortalSession, type PortalWeek } from "@pt/shared";
  import { portalApi, PortalDuplicateError, type PortalSavedLog } from "$lib/api/portal";
  import { blocksOf, withExtraSet, withoutExtra, MAX_SETS } from "$lib/logSheet";
  import { EMPTY_READINESS, type ReadinessForm } from "$lib/logFlags";
  import LogStepper from "$lib/components/LogStepper.svelte";
  import ReadinessStrip, { type ReadinessText } from "$lib/components/log/ReadinessStrip.svelte";
  import CardioLogForm, { type CardioForm, type CardioFormText } from "$lib/components/log/CardioLogForm.svelte";
  import { fmtDay, fmtShortDate, i18n, t } from "$lib/portal/i18n.svelte";
  import { setParts } from "$lib/portal/rx";
  import {
    buildPortalLog,
    cardioFormOf,
    extraRow,
    parsePortalDraft,
    portalDraftJson,
    portalDraftKey,
    rowsOfSession,
    sameForm,
    touchedExercises,
    type PortalLogForm,
    type PortalRow,
  } from "$lib/portal/logForm";
  import PortalBar from "$lib/portal/PortalBar.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  let { data } = $props();
  const me = $derived(data.portal.kind === "signedIn" ? data.portal.me : null);

  const sessionId = $derived(page.params.sessionId ?? "");
  const today = localDateOf(Date.now());

  let week = $state<PortalWeek | null>(null);
  let session = $state<PortalSession | null>(null);
  let loadState = $state<"loading" | "ready" | "missing" | "failed">("loading");

  let rows = $state<PortalRow[]>([]);
  let cardio = $state<CardioForm>(cardioFormOf(null));
  let readiness = $state<ReadinessForm>({ ...EMPTY_READINESS });
  let notes = $state("");
  let date = $state(today);
  let current = $state(0);
  let restored = $state(false);
  /** RPE is optional: hidden until asked for, so kg and reps share one row on a phone. */
  let showRpe = $state(false);
  let feelOpen = $state(false);

  let saving = $state(false);
  let error = $state<string | null>(null);
  let saved = $state<{ log: PortalSavedLog; sets: number; replaced: boolean } | null>(null);
  let undoing = $state(false);
  let undone = $state(false);

  const cardioSession = $derived(session?.kind === "cardio");
  const byCoach = $derived(session?.log?.loggedBy === "trainer");
  const byYou = $derived(session?.log?.loggedBy === "client");
  const blocks = $derived(blocksOf(rows));
  const block = $derived(blocks[Math.min(current, blocks.length - 1)] ?? null);
  /** The form as the page opened it — nothing touched yet, so nothing worth a draft. */
  const freshForm = (s: PortalSession): PortalLogForm => ({ rows: rowsOfSession(s), cardio: cardioFormOf(s.cardio), readiness: { ...EMPTY_READINESS }, notes: "", date: today });
  const pristine = $derived(session ? rowsOfSession(session) : []);
  const touched = $derived(touchedExercises(pristine, rows));
  const exerciseOf = (peId: string) => session?.exercises.find((e) => e.id === peId) ?? null;
  // never before the week (the server refuses it), never in the future
  const minDate = $derived(week ? week.startDate : today);
  const maxDate = $derived(week && week.endDate < today ? week.endDate : today);

  function fresh(s: PortalSession) {
    rows = rowsOfSession(s);
    cardio = cardioFormOf(s.cardio);
    readiness = { ...EMPTY_READINESS };
    notes = "";
    date = today;
    current = 0;
  }

  async function load(id: string) {
    loadState = "loading";
    try {
      const dto = await portalApi.week();
      const w = dto.weeks.find((x) => x.loggable) ?? null;
      const s = w?.sessions.find((x) => x.id === id) ?? null;
      week = w;
      session = s;
      if (!s) {
        loadState = "missing";
        return;
      }
      fresh(s);
      const draft = parsePortalDraft(localStorage.getItem(portalDraftKey(id)), rows);
      if (draft && !sameForm(draft, freshForm(s))) {
        rows = draft.rows;
        cardio = draft.cardio;
        readiness = draft.readiness;
        notes = draft.notes;
        date = draft.date >= minDate && draft.date <= maxDate ? draft.date : today;
        restored = true;
      }
      loadState = "ready";
    } catch {
      loadState = "failed";
    }
  }

  $effect(() => {
    void load(sessionId);
  });

  // Autosave the half-filled form on this phone; a save or "start over" clears it.
  $effect(() => {
    if (loadState !== "ready" || !session || saved || byCoach) return;
    const form = { rows, cardio, readiness, notes, date };
    // untouched prefill is not a draft: write nothing until the first real edit
    const json = sameForm(form, freshForm(session)) ? null : portalDraftJson(form);
    const key = portalDraftKey(session.id);
    const timer = setTimeout(() => {
      try {
        if (json) localStorage.setItem(key, json);
        else localStorage.removeItem(key);
      } catch {
        // storage full or private mode: the form still works, it just won't survive a reload
      }
    }, 400);
    return () => clearTimeout(timer);
  });

  function startOver() {
    if (!session) return;
    localStorage.removeItem(portalDraftKey(session.id));
    fresh(session);
    restored = false;
  }

  function addSet(peId: string) {
    const last = [...rows].reverse().find((r) => r.programExerciseId === peId);
    if (!last) return;
    rows = withExtraSet(rows, peId, (n) => extraRow(last, n));
  }

  async function save() {
    if (!session || saving) return;
    error = null;
    const built = buildPortalLog(session, { rows, cardio, readiness, notes, date }, byYou);
    if ("error" in built) {
      if (built.error === "kg") {
        error = t("log.needKg", { n: built.sets });
        // page to the first lift still missing its kg
        const at = blocks.findIndex((b) => b.memberIds.includes(built.programExerciseId));
        if (at >= 0) current = at;
        return;
      }
      error = built.error === "nothing" ? t("log.nothing") : t("log.cardioNeedsActivity");
      return;
    }
    saving = true;
    try {
      const log = await portalApi.log(built.input);
      localStorage.removeItem(portalDraftKey(session.id));
      saved = { log, sets: built.sets, replaced: byYou };
      undone = false;
      window.scrollTo({ top: 0 });
    } catch (e) {
      if (e instanceof PortalDuplicateError) {
        // someone logged it meanwhile: show who, from fresh data
        error = e.existing.loggedBy === "trainer" ? t("log.byCoach") : t("log.byYou", { date: fmtShortDate(e.existing.date) });
        if (session) session = { ...session, log: { id: e.existing.id, loggedBy: e.existing.loggedBy, date: e.existing.date } };
      } else {
        const status = (e as { status?: unknown }).status;
        error = status === 422 ? t("log.notThisWeek") : t("log.error");
      }
    } finally {
      saving = false;
    }
  }

  async function undo() {
    if (!saved || undoing) return;
    undoing = true;
    try {
      await portalApi.deleteLog(saved.log.id);
      undone = true;
    } catch {
      error = t("log.error");
    } finally {
      undoing = false;
    }
  }

  const readinessText: ReadinessText = $derived({
    title: t("log.readiness"),
    optional: t("log.optional"),
    hint: t("log.readinessHint"),
    scale: {
      energy: { label: t("log.energy"), low: t("log.energyLow"), high: t("log.energyHigh") },
      sleep: { label: t("log.sleep"), low: t("log.sleepLow"), high: t("log.sleepHigh") },
      soreness: { label: t("log.soreness"), low: t("log.sorenessLow"), high: t("log.sorenessHigh") },
    },
    valueLabel: (label, v, max) => t("log.scaleValue", { label, v, max }),
  });
  const cardioText: CardioFormText = $derived({
    modality: t("cardio.activity"),
    modalityPlaceholder: t("cardio.activityPlaceholder"),
    minutes: t("cardio.minutes"),
    hrZone: t("cardio.zone"),
    intensity: t("cardio.intensity"),
    intensityPlaceholder: t("cardio.intensityPlaceholder"),
    km: t("cardio.km"),
    rpe: t("cardio.rpe"),
  });

  /** "Set 2 · 6–8 reps @ 100 kg" — the plan beside the cells. */
  function targetOf(r: PortalRow): string {
    const ex = exerciseOf(r.programExerciseId);
    const ps = ex?.prescribedSets.find((s) => s.setNumber === r.setNumber);
    if (!ps || r.extra) return "";
    const [first, ...rest] = setParts([ps], t);
    return [`${t("log.target")} ${first.replace(/^1 × /, "")}`, ...rest.filter((p) => !p.startsWith(t("rx.rest", { t: "" }).trim()))].join(" · ");
  }
  const feelSummary = $derived(
    (["energy", "sleep", "soreness"] as const)
      .filter((k) => readiness[k] != null)
      .map((k) => `${readinessText.scale[k].label} ${readiness[k]}`)
      .join(" · "),
  );
  const savedLine = $derived(
    !saved ? "" : cardioSession ? t("log.savedCardio") : saved.sets === 1 ? t("log.savedOneSet") : t("log.savedSets", { n: saved.sets }),
  );
</script>

<svelte:head><title>{session?.name ?? t("app.title")} · Program Tracker</title></svelte:head>

<PortalBar coach={me ? t("header.coach", { trainer: me.trainer.name }) : null} />

<a class="back" href="/me"><Icon name="chevron" />{t("log.back")}</a>

{#if loadState === "loading"}
  <div class="sk" aria-hidden="true">
    <Skeleton shape="line" w="60%" h="26px" />
    <Skeleton h="120px" />
    <Skeleton h="220px" />
  </div>
  <p class="sr-only" role="status">{t("week.loading")}</p>
{:else if loadState === "failed"}
  <div class="empty" role="alert">
    <p class="empty-title">{t("week.error")}</p>
    <Button onclick={() => load(sessionId)}>{t("week.retry")}</Button>
  </div>
{:else if loadState === "missing" || !session}
  <div class="empty"><p class="empty-title">{t("log.notFound")}</p></div>
{:else if saved}
  <!-- After save: one calm confirmation, Undo beside it, then back to the week. -->
  <section class="recap" aria-live="polite">
    {#if undone}
      <h1>{t("log.undone")}</h1>
      <a class="btn primary done-btn" href="/me">{t("log.done")}</a>
    {:else}
      <span class="tick" aria-hidden="true"><Icon name="check" /></span>
      <h1>{t("log.saved")}</h1>
      <p class="recap-line">{session.name} · {savedLine} · {fmtDay(saved.log.date)}</p>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <div class="recap-actions">
        <a class="btn primary done-btn" href="/me">{t("log.done")}</a>
        {#if !saved.replaced}
          <Button onclick={undo} disabled={undoing}><Icon name="undo" />{undoing ? t("log.undoing") : t("log.undo")}</Button>
        {/if}
      </div>
    {/if}
  </section>
{:else}
  <form class="log" onsubmit={(e) => { e.preventDefault(); void save(); }}>
    <header class="head">
      <h1>{session.name}</h1>
      <label class="date">
        <span>{t("log.date")}</span>
        <input class="input tnum" type="date" bind:value={date} min={minDate} max={maxDate} lang={i18n.locale} disabled={byCoach} />
      </label>
    </header>

    {#if byCoach}
      <Note tone="warn" role="note">{t("log.byCoach")}</Note>
    {:else if byYou && session.log}
      <Note tone="warn" role="note">{t("log.byYou", { date: fmtShortDate(session.log.date) })}</Note>
    {/if}
    {#if restored}
      <Note tone="ok" role="note" class="draft">
        <span>{t("log.draftRestored")}</span>
        <button type="button" class="link-btn" onclick={startOver}>{t("log.discard")}</button>
      </Note>
    {/if}

    {#if !byCoach}
      <!-- How they felt going in: optional, folded, first — before the work, as it happened. -->
      <details class="feel" bind:open={feelOpen}>
        <summary>
          <span class="sub-h">{t("log.readiness")}</span>
          <span class="opt">{feelSummary || t("log.optional")}</span>
          <Icon name="chevron" />
        </summary>
        <ReadinessStrip bind:value={readiness} variant="touch" text={readinessText} />
      </details>

      {#if cardioSession}
        <CardioLogForm bind:value={cardio} text={cardioText} variant="touch" />
      {:else if block}
        <section class="ex" aria-labelledby="ex-title">
          <div class="pager">
            <button type="button" class="pg" aria-label={t("log.prev")} disabled={current === 0} onclick={() => (current -= 1)}>
              <Icon name="chevron" />
            </button>
            <p class="pg-pos tnum">{t("log.exercise", { n: current + 1, total: blocks.length })}</p>
            <button type="button" class="pg next" aria-label={t("log.next")} disabled={current >= blocks.length - 1} onclick={() => (current += 1)}>
              <Icon name="chevron" />
            </button>
          </div>
          <div class="steps" aria-hidden="true">
            {#each blocks as b, i (b.key)}
              {@const done = b.memberIds.some((id) => touched.has(id))}
              <span class:on={i === current} class:past={i < current} class:done>{#if done}<Icon name="check" />{/if}</span>
            {/each}
          </div>

          <h2 id="ex-title">
            {#each block.memberIds as peId, i (peId)}
              {#if i > 0}<span class="plus"> + </span>{/if}{exerciseOf(peId)?.exerciseName ?? ""}
            {/each}
          </h2>
          {#each block.memberIds as peId (peId)}
            {@const ex = exerciseOf(peId)}
            {#if ex?.notes}<p class="cue"><span>{t("session.coachNote")}</span> {ex.notes}</p>{/if}
          {/each}

          <button type="button" class="rpe-toggle" aria-expanded={showRpe} onclick={() => (showRpe = !showRpe)}>
            {showRpe ? t("log.rpeHide") : t("log.rpeShow")}
          </button>

          <ol class="sets">
            {#each block.rows as r (r.key)}
              {@const i = rows.findIndex((x) => x.key === r.key)}
              {@const target = targetOf(r)}
              <li class="set">
                <div class="set-head">
                  <span class="set-n">{t("log.set", { n: r.setNumber })}{#if block.memberIds.length > 1}<span class="set-ex"> · {r.name}</span>{/if}</span>
                  {#if target}<span class="set-rx tnum">{target}</span>{/if}
                  {#if r.extra}
                    <button type="button" class="rm" aria-label={t("log.removeSet", { n: r.setNumber })} onclick={() => (rows = withoutExtra(rows, r.key))}><Icon name="x" /></button>
                  {/if}
                </div>
                <div class="cells">
                  {#if !r.timed}
                    <LogStepper bind:value={rows[i].weight} label={`${r.name} ${t("log.set", { n: r.setNumber })}, ${t("log.kg")}`} unit={t("log.kg")} step={2.5} min={0} max={600} from={r.rx?.targetWeightKg ?? null} />
                  {/if}
                  <LogStepper
                    bind:value={rows[i].reps}
                    label={`${r.name} ${t("log.set", { n: r.setNumber })}, ${r.timed ? t("log.seconds") : t("log.reps")}`}
                    unit={r.timed ? t("log.seconds") : t("log.reps")}
                    step={r.timed ? 5 : 1}
                    min={0}
                    max={r.timed ? 3600 : 200}
                    inputmode="numeric"
                  />
                  {#if showRpe}
                    <LogStepper bind:value={rows[i].rpe} label={`${r.name} ${t("log.set", { n: r.setNumber })}, RPE`} unit={`${t("log.rpe")} · ${t("log.optional")}`} step={0.5} min={1} max={10} from={r.rx?.targetRpe ?? 7} />
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
          {#each block.memberIds as peId (peId)}
            {#if rows.filter((r) => r.programExerciseId === peId).length < MAX_SETS}
              <button type="button" class="add" onclick={() => addSet(peId)}><Icon name="plus" />{t("log.addSet")}{#if block.memberIds.length > 1} · {exerciseOf(peId)?.exerciseName}{/if}</button>
            {/if}
          {/each}

          {#if current < blocks.length - 1}
            <button type="button" class="btn next-ex" onclick={() => { current += 1; document.getElementById("ex-title")?.scrollIntoView({ block: "start" }); }}>
              {t("log.next")} · {exerciseOf(blocks[current + 1].programExerciseId)?.exerciseName}
              <Icon name="chevron" />
            </button>
          {/if}
        </section>
      {/if}

      <label class="notes">
        <span class="sub-h">{t("log.notes")}</span>
        <textarea class="input" rows="3" maxlength="2000" placeholder={t("log.notesPlaceholder")} bind:value={notes}></textarea>
      </label>

      <div class="savebar">
        {#if error}<p class="err" role="alert">{error}</p>{/if}
        <button type="submit" class="btn primary save" disabled={saving}>{saving ? t("log.saving") : t("log.save")}</button>
      </div>
    {/if}
  </form>
{/if}

<style>
  .back {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 44px;
    margin: 4px 0 0 -6px;
    padding: 0 6px;
    font: 500 15px/1 var(--font-ui);
    color: var(--blue);
  }
  .back :global(svg) { width: 16px; height: 16px; transform: rotate(90deg); }

  .sk { display: grid; gap: 14px; margin-top: 12px; }
  .sk :global(.skeleton) { display: block; }

  /* the narrow log sheet: LogStepper's 44px steppers key off this container */
  .log { container: logform / inline-size; display: grid; gap: 18px; margin-top: 8px; padding-bottom: 96px; }
  .head { display: grid; gap: 12px; }
  h1 { margin: 0; font: 600 24px/1.25 var(--font-ui); letter-spacing: -0.01em; text-wrap: balance; }
  .date { display: flex; align-items: center; gap: 12px; font-size: 15px; color: var(--muted); }
  .date .input { flex: 1; max-width: 220px; min-height: 44px; font-size: 16px; }
  .log :global(.draft) { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .link-btn {
    min-height: 44px;
    padding: 0 4px;
    font: 500 14px/1 var(--font-ui);
    color: inherit;
    background: none;
    border: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    cursor: pointer;
  }

  .ex { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .pager { display: flex; align-items: center; gap: 8px; }
  .pg {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    color: var(--ink);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
  }
  .pg :global(svg) { width: 18px; height: 18px; transform: rotate(90deg); }
  .pg.next :global(svg) { transform: rotate(-90deg); }
  .pg:disabled { color: var(--faint); cursor: default; opacity: 0.6; }
  .pg-pos { flex: 1; margin: 0; text-align: center; font-size: 14px; color: var(--muted); }
  /* where you are, and a tick on every exercise you've changed */
  .steps { display: flex; gap: 4px; }
  .steps span {
    flex: 1;
    display: grid;
    place-items: center;
    height: 16px;
    border-radius: 4px;
    background: var(--well-2);
  }
  .steps span.past { background: var(--line-strong); }
  .steps span.done { color: var(--good); background: var(--good-bg); box-shadow: inset 0 0 0 1px var(--good-line); }
  .steps span.on { box-shadow: inset 0 0 0 2px var(--ink); }
  .steps span.on:not(.done) { background: var(--surface); }
  .steps span :global(svg) { width: 12px; height: 12px; }
  .rpe-toggle {
    justify-self: end;
    min-height: 44px;
    margin: -8px 0 -12px;
    padding: 0 4px;
    font: 500 14px/1 var(--font-ui);
    color: var(--blue);
    background: none;
    border: 0;
    cursor: pointer;
  }
  h2 { margin: 4px 0 0; font: 600 20px/1.3 var(--font-ui); text-wrap: balance; }
  .plus { color: var(--muted); font-weight: 400; }
  .cue { margin: 0; font-size: 14px; }
  .cue span { font-weight: 600; color: var(--muted); }

  .sets { display: grid; margin: 0; padding: 0; list-style: none; }
  .set { display: grid; gap: 8px; padding: 12px 0; border-top: 1px solid var(--line-soft); }
  .set-head { display: flex; align-items: baseline; gap: 8px; min-height: 24px; }
  .set-n { font: 600 15px/1.3 var(--font-ui); }
  .set-ex { font-weight: 400; color: var(--muted); }
  .set-rx { margin-left: auto; font: 500 13px/1.3 var(--font-mono); color: var(--muted); text-align: right; }
  .rm {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    margin: -6px -6px -6px 0;
    color: var(--muted);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .rm :global(svg) { width: 16px; height: 16px; }
  .cells { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px 12px; }
  @container logform (min-width: 520px) {
    .cells { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
  .add {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    justify-self: start;
    min-height: 44px;
    padding: 0 4px;
    font: 500 15px/1 var(--font-ui);
    color: var(--blue);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .add :global(svg) { width: 16px; height: 16px; }
  .next-ex { justify-content: space-between; min-height: 48px; font-size: 15px; }
  .next-ex :global(svg) { width: 16px; height: 16px; transform: rotate(-90deg); }

  .feel { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .feel summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 0 16px;
    cursor: pointer;
    list-style: none;
  }
  .feel summary::-webkit-details-marker { display: none; }
  .feel summary .opt { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; }
  .feel summary :global(svg) { flex: none; width: 16px; height: 16px; color: var(--muted); transition: transform 150ms ease-out; }
  .feel[open] summary :global(svg) { transform: rotate(180deg); }
  .feel :global(.readiness) { padding: 4px 16px 16px; }
  .sub-h { margin: 0; font: 600 15px/1.3 var(--font-ui); }
  .opt { font-weight: 400; color: var(--muted); }
  .notes { display: grid; gap: 8px; }
  .notes textarea { min-height: 88px; font-size: 16px; resize: vertical; }

  /* one green action, always in reach: sticky over the safe area */
  .savebar {
    position: sticky;
    bottom: 0;
    display: grid;
    gap: 8px;
    margin: 0 -16px;
    padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
    background: var(--bg);
    border-top: 1px solid var(--line);
  }
  .save { justify-content: center; width: 100%; min-height: 52px; font-size: 17px; font-weight: 600; }
  .err { margin: 0; font-size: 14px; font-weight: 500; color: var(--bad); }

  .recap { display: grid; justify-items: start; gap: 12px; margin-top: 10vh; }
  .tick {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 99px;
    color: var(--good);
    background: var(--good-bg);
    border: 1px solid var(--good-line);
  }
  .tick :global(svg) { width: 24px; height: 24px; }
  .recap-line { margin: 0; color: var(--muted); }
  .recap-actions { display: grid; gap: 10px; width: 100%; margin-top: 12px; }
  .recap-actions :global(.btn) { justify-content: center; min-height: 48px; font-size: 16px; }
  .done-btn { justify-content: center; min-height: 48px; font-size: 16px; width: 100%; }

  .empty { display: grid; justify-items: center; gap: 8px; margin-top: 16px; padding: 40px 16px; text-align: center; border: 1px dashed var(--line); border-radius: var(--radius); }
  .empty-title { margin: 0; font-weight: 600; }

  @media (prefers-reduced-motion: reduce) {
    .feel summary :global(svg) { transition: none; }
  }
  @media (min-width: 700px) {
    .savebar { margin: 0; border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow-overlay-up); bottom: 12px; }
  }
</style>
