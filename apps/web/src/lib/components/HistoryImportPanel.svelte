<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import type { ExerciseDto, ExerciseInput, ImportHistorySavedDto } from "$lib/api/types";
  import {
    buildHistory,
    defaultWeekStarts,
    historySummary,
    localDateOf,
    type HistoryPlan,
    type ImportResult,
  } from "@pt/shared";
  import {
    historyAliasesToSave,
    historyExerciseIds,
    historyExerciseMap,
    historyNewExerciseNames,
    historyWeeks,
    type ChoiceState,
  } from "$lib/pasteImport";
  import Button from "$lib/ui/Button.svelte";
  import Counter from "$lib/ui/Counter.svelte";

  /**
   * "Save history" in a Paste notes review (docs/history-import-plan.md §4):
   * the logged numbers become archived programs plus real logs, dated from
   * "When did the latest week start?". Independent of "Use this". The API
   * rebuilds the plan from the stored import; the preview here is the same
   * pure build. Mount once per import (key it on the import id).
   */
  let {
    importId,
    savedIds,
    result,
    choices,
    trainingDays,
    catalog,
    oncreate,
    onchange,
  }: {
    importId: string;
    /** ai_imports.history_program_ids — set once saved. */
    savedIds: string[] | null;
    result: ImportResult;
    /** The review's exercise picks — the same name in older weeks follows them. */
    choices: Record<string, ChoiceState>;
    trainingDays: number[] | null | undefined;
    catalog: ExerciseDto[];
    oncreate: (input: ExerciseInput) => Promise<ExerciseDto>;
    /** The saved program ids (null after undo), so a reopened import shows the right state. */
    onchange: (ids: string[] | null) => void;
  } = $props();

  const today = localDateOf(Date.now());
  const weeks = $derived(historyWeeks(result));
  const lastWeek = $derived(result.weeks.length - 1);

  let latest = $state("");
  /** Per-week start dates the trainer changed (week index → date); the rest follow `latest`. */
  let overrides = $state<Record<number, string>>({});
  let saving = $state(false);
  let undoing = $state(false);
  let error = $state<string | null>(null);
  // seeded once per import; the component is keyed on the import id
  // svelte-ignore state_referenced_locally
  let ids = $state<string[] | null>(savedIds);
  let saved = $state<ImportHistorySavedDto | null>(null);
  /** Names of the saved programs — from the save, or fetched when reopened. */
  let names = $state<Record<string, string>>({});

  const defaults = $derived(latest ? defaultWeekStarts(result.weeks.length, latest) : []);
  const weekStarts = $derived(result.weeks.map((_, i) => (i === lastWeek ? latest : (overrides[i] ?? defaults[i] ?? ""))));
  const datesOk = $derived(weekStarts.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today));

  // plain data for the pure build (it structuredClones, which proxies refuse)
  const plain = $derived($state.snapshot(result) as ImportResult);
  const picks = $derived(historyExerciseMap(plain, $state.snapshot(choices) as Record<string, ChoiceState>));
  /** New customs don't exist yet: stand-in ids so the preview counts them. */
  const previewIds = $derived.by(() => {
    const out: Record<string, string> = {};
    for (const [name, p] of picks) out[name] = p.choice.kind === "catalog" ? p.choice.exerciseId : `new:${p.choice.exerciseName}`;
    return out;
  });
  /** Before a date is picked, counts come from a stand-in far in the past. */
  const plan = $derived<HistoryPlan>(
    buildHistory(plain, {
      weekStarts: datesOk ? weekStarts : defaultWeekStarts(result.weeks.length, "2000-01-03"),
      trainingDays: trainingDays ?? null,
      exerciseIds: previewIds,
      exerciseNames: Object.fromEntries([...picks].map(([name, p]) => [previewIds[name], p.choice.exerciseName])),
      today,
    }),
  );
  const totals = $derived(historySummary(plan));
  const span = $derived.by(() => {
    const labels = weeks.map((w) => result.weeks[w]?.label).filter((l): l is string => !!l);
    return labels.length === 0 ? "" : labels.length === 1 ? labels[0] : `${labels[0]} – ${labels.at(-1)}`;
  });
  const canSave = $derived(!!latest && datesOk && plan.programs.length > 0 && !saving);

  const day = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  async function save() {
    if (!canSave) return;
    saving = true;
    error = null;
    try {
      // custom exercises first, so every log points at a real catalog entry
      const created = new Map<string, string>();
      for (const name of historyNewExerciseNames(picks)) {
        const existing = catalog.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
        const ex = existing ?? (await oncreate({ name, primaryMuscleGroup: "full_body", equipment: "other" }));
        created.set(name.toLowerCase(), ex.id);
      }
      const aliases = historyAliasesToSave(picks, created);
      // aliases only help the next import — never block the save on them
      if (aliases.length) await api.saveAliases(aliases).catch(() => {});
      const out = await api.saveImportHistory(importId, { weekStarts, exercises: historyExerciseIds(picks, created) });
      saved = out;
      ids = out.programs.map((p) => p.id);
      names = Object.fromEntries(out.programs.map((p) => [p.id, p.name]));
      onchange(ids);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      saving = false;
    }
  }

  async function undo() {
    undoing = true;
    error = null;
    try {
      await api.undoImportHistory(importId);
      ids = null;
      saved = null;
      onchange(null);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      undoing = false;
    }
  }

  onMount(async () => {
    if (!ids?.length) return;
    const found = await Promise.all(ids.map((id) => api.program(id).catch(() => null)));
    names = Object.fromEntries(found.flatMap((p) => (p ? [[p.id, p.name]] : [])));
  });
</script>

<section class="panel history" aria-labelledby="hi-title">
  <div class="panel-head">
    <h2 class="panel-title" id="hi-title">Save history</h2>
    {#if ids}
      <Counter value="saved" />
    {:else}
      <span class="subtle fine head-note">Past weeks become archived programs with real logs — progress and the AI start from them.</span>
    {/if}
  </div>

  {#if ids}
    <div class="panel-body done-body" role="status">
      <p class="done-line">
        <span class="lamp green" aria-hidden="true"></span>
        {#if saved}
          Saved <b class="num">{plural(saved.programs.length, "archived program")}</b> ·
          <b class="num">{plural(saved.sessions, "session")}</b> ·
          <b class="num">{plural(saved.sets, "set")}</b>
        {:else}
          Saved <b class="num">{plural(ids.length, "archived program")}</b> from these notes
        {/if}
      </p>
      <ul class="links">
        {#each ids as id, i (id)}
          <li><a href="/programs/{id}">{names[id] ?? `Program ${i + 1}`}</a></li>
        {/each}
      </ul>
      {#if saved?.skipped.length}
        {@render skippedList(saved.skipped)}
      {/if}
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <div class="row-end">
        <Button small variant="ghost" onclick={undo} disabled={undoing}>{undoing ? "Undoing…" : "Undo"}</Button>
      </div>
    </div>
  {:else}
    <div class="panel-body grid">
      <div class="ask">
        <p class="found">
          Logged numbers found:
          <b class="num">{plural(totals.sessions, "session")}</b> ·
          <b class="num">{plural(totals.sets, "set")}</b>
          {#if span}<span class="subtle">({span})</span>{/if}
        </p>

        <label class="when">
          <span class="q">When did the latest week start?</span>
          <input class="input date" type="date" max={today} bind:value={latest} required aria-describedby="hi-when-hint" />
        </label>
        <p class="subtle fine" id="hi-when-hint">
          {#if trainingDays?.length}
            Days land on the client's training days; a weekday in a day's name wins.
          {:else}
            No training days set, so days fall on consecutive dates; a weekday in a day's name wins.
          {/if}
        </p>

        {#if weeks.length > 1}
          <details class="adjust">
            <summary>Adjust weeks <span class="subtle">for gaps between them</span></summary>
            <ul class="weeks">
              {#each weeks as w (w)}
                <li>
                  <span class="wk">{result.weeks[w]?.label ?? `Week ${w + 1}`}</span>
                  {#if w === lastWeek}
                    <input class="input date" type="date" max={today} bind:value={latest} aria-label="Start of {result.weeks[w]?.label ?? 'the latest week'}" />
                  {:else}
                    <input
                      class="input date"
                      type="date"
                      max={today}
                      value={weekStarts[w]}
                      disabled={!latest}
                      aria-label="Start of {result.weeks[w]?.label ?? `week ${w + 1}`}"
                      onchange={(e) => (overrides[w] = e.currentTarget.value)}
                    />
                  {/if}
                </li>
              {/each}
            </ul>
          </details>
        {/if}

        {#if latest && !datesOk}<p class="err" role="alert">Each week needs a start date, today or earlier.</p>{/if}
        {#if error}<p class="err" role="alert">{error}</p>{/if}
        <div class="row-end">
          <Button variant="primary" onclick={save} disabled={!canSave}>{saving ? "Saving…" : "Save history"}</Button>
        </div>
        <p class="subtle fine">Independent of “Use this”. Archived programs are read-only; Undo removes them and their logs.</p>
      </div>

      <div class="preview" aria-label="What will be saved">
        {#if !latest}
          <p class="subtle placeholder">Pick the latest week's start to see the dates.</p>
        {:else}
          {#each plan.programs as p (p.block)}
            <div class="prog">
              <h3>{p.name}</h3>
              <ul class="logs">
                {#each p.logs as l (l.programSessionId)}
                  <li>
                    <span class="date num">{day(l.date)}</span>
                    <span class="label">{l.dayLabel}</span>
                    <span class="subtle counts">{plural(l.exercises, "exercise")} · {plural(l.sets.length, "set")}</span>
                  </li>
                {/each}
              </ul>
            </div>
          {:else}
            <p class="subtle placeholder">Nothing to save with these dates.</p>
          {/each}
        {/if}
        {#if plan.skipped.length}
          {@render skippedList(plan.skipped)}
        {/if}
      </div>
    </div>
  {/if}
</section>

{#snippet skippedList(items: { week: string; day?: string; exercise?: string; message: string }[])}
  <div class="skipped">
    <p class="skipped-head"><span class="lamp amber" aria-hidden="true"></span> Not saved ({items.length})</p>
    <ul>
      {#each items as s, i (i)}
        <li>
          <span>{[s.week, s.day, s.exercise].filter(Boolean).join(" · ")}</span>
          <span class="why">— {s.message}</span>
        </li>
      {/each}
    </ul>
  </div>
{/snippet}

<style>
  .history { margin-bottom: 16px; }
  .head-note { margin-left: 8px; }
  .fine { font-size: 12px; margin: 0; }
  .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 16px 32px; align-items: start; }
  .ask { display: flex; flex-direction: column; gap: 8px; }
  .found { margin: 0; font-size: 14px; }
  .when { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .q { font: 600 14px var(--font-ui); }
  .date { width: auto; font-family: var(--font-mono); font-size: 13px; }
  .adjust summary { cursor: pointer; font-size: 13px; color: var(--blue); }
  .adjust summary .subtle { font-size: 12px; margin-left: 4px; }
  .weeks { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .weeks li { display: grid; grid-template-columns: minmax(80px, 140px) auto; align-items: center; gap: 10px; font-size: 13px; }
  .wk { color: var(--muted); }
  .row-end { display: flex; justify-content: flex-end; gap: 8px; }

  .preview { border: 1px solid var(--line); border-radius: var(--radius); background: var(--well); padding: 4px 0; min-height: 64px; }
  .placeholder { margin: 0; padding: 12px 14px; font-size: 13px; }
  .prog + .prog { border-top: 1px solid var(--line-soft); }
  .prog h3 { font: 600 13px/1.35 var(--font-ui); margin: 0; padding: 8px 14px 2px; }
  .logs { list-style: none; margin: 0; padding: 0 0 6px; }
  .logs li { display: grid; grid-template-columns: 104px minmax(0, 1fr) auto; gap: 10px; align-items: baseline; padding: 3px 14px; font-size: 13px; }
  .date { color: var(--ink); font-size: 12px; }
  .label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .counts { font-size: 12px; white-space: nowrap; }

  .skipped { margin: 4px 14px 8px; padding: 6px 10px; background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: var(--radius); }
  .done-body .skipped { margin: 0; }
  .skipped-head { display: flex; align-items: center; gap: 8px; margin: 0 0 2px; font: 600 12.5px var(--font-ui); color: var(--warn-ink); }
  .skipped ul { list-style: none; margin: 0; padding: 0; }
  .skipped li { font-size: 12.5px; color: var(--warn-ink); }
  .why { color: var(--warn); }

  .done-body { display: flex; flex-direction: column; gap: 8px; }
  .done-line { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 14px; flex-wrap: wrap; }
  .links { list-style: none; margin: 0; padding: 0 0 0 16px; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }

  .lamp { width: 8px; height: 8px; border-radius: 50%; display: inline-block; flex: none; }
  .lamp.green { background: var(--green-btn); }
  .lamp.amber { background: var(--lamp-amber); }
  .err { margin: 0; font-size: 13px; color: var(--bad); }

  @media (max-width: 1000px) {
    .grid { grid-template-columns: minmax(0, 1fr); }
    .head-note { display: none; }
  }
</style>
