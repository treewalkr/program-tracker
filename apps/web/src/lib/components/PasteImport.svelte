<script lang="ts">
  import { onMount, tick } from "svelte";
  import { api, apiMode } from "$lib/api";
  import type { ExerciseDto, ExerciseInput, ImportDto, ImportSummaryDto, ProviderDto } from "$lib/api/types";
  import {
    DEFAULT_PROVIDER_ID,
    IMPORT_MAX_CHARS,
    exerciseUnits,
    groupKind,
    WEEK_HEADER,
    importLines,
    typicalGenerationSeconds,
    type ImportFlag,
    type ImportResult,
    type ReviewExercise,
    hasActuals,
  } from "@pt/shared";
  import { clearDraft, readDraft, writeDraft } from "$lib/localDraft";
  import { formatElapsed } from "$lib/generation";
  import { uuid } from "$lib/uuid";
  import type { DraftForm } from "$lib/programForm";
  import {
    aliasesToSave,
    blockLabel,
    cardioLabel,
    choiceFor,
    exerciseKey,
    flagSummary,
    formFromImport,
    hasTraining,
    itemsByLine,
    lineOfItem,
    lineStates,
    newExerciseNames,
    sessionKey,
    setsLabel,
    templateWeekIndex,
    dayKey,
    type ChoiceState,
    type MatchChoice,
  } from "$lib/pasteImport";
  import ModelSettings from "./ModelSettings.svelte";
  import ExercisePicker from "./ExercisePicker.svelte";
  import NewWordsPanel from "./NewWordsPanel.svelte";
  import HistoryImportPanel from "./HistoryImportPanel.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Counter from "$lib/ui/Counter.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import sample from "../../../../../packages/shared/fixtures/import/week11-12.txt?raw";

  /**
   * Paste notes: a trainer's plain-text program → reviewed → the new-program
   * form. Self-contained (text, model, read, progress, resume, review, "Use
   * this") so it can sit on other pages later. The review reads like a file
   * view: the notes with their line numbers on the left, what was read from
   * each line on the right, linked both ways.
   */
  let {
    clientId,
    catalog,
    base,
    oncreate,
    onuse,
    trainingDays = null,
  }: {
    clientId: string;
    catalog: ExerciseDto[];
    /** The client's training days — Save history dates Day N on the Nth of them. */
    trainingDays?: number[] | null;
    /** The form as it stands — "Use this" keeps its plan settings and replaces name and sessions. */
    base: () => DraftForm;
    /** Saves a new library exercise (and keeps the page's catalog in sync). */
    oncreate: (input: ExerciseInput) => Promise<ExerciseDto>;
    onuse: (form: DraftForm) => void;
  } = $props();

  type Phase = "write" | "reading" | "review" | "failed";
  let phase = $state<Phase>("write");
  let text = $state("");
  let providers = $state<ProviderDto[]>([]);
  let providerId = $state<string>(DEFAULT_PROVIDER_ID);
  let model = $state("");
  let effort = $state("");
  let row = $state<ImportDto | null>(null);
  let importId = $state<string | null>(null);
  let startedAt = $state<string>(new Date().toISOString());
  let error = $state<string | null>(null);
  let notice = $state<string | null>(null);
  let recent = $state<ImportSummaryDto[]>([]);
  let cancelling = $state(false);
  let using = $state(false);

  let block = $state(0);
  let choices = $state<Record<string, ChoiceState>>({});
  /** Line under the pointer (or tapped) — its items light up, and vice versa. */
  let hotLine = $state<number | null>(null);
  let changing = $state<string | null>(null);

  // —— local draft: the paste and the in-flight import survive a reload ——————
  const draftKey = $derived(`pt.draft.paste-import.${clientId}`);
  interface Kept {
    text: string;
    importId: string | null;
  }
  const keep = () => writeDraft<Kept>(draftKey, { text, importId });
  $effect(() => {
    if (phase !== "write") return;
    const t = setTimeout(keep, 400);
    // track the text
    void text;
    return () => clearTimeout(t);
  });

  const chars = $derived(text.length);
  const tooLong = $derived(chars > IMPORT_MAX_CHARS);
  const hasWeeks = $derived(importLines(row?.text ?? text).some((l) => WEEK_HEADER.test(l)));
  const unit = $derived(hasWeeks ? "weeks" : "parts");

  // —— reading ——————————————————————————————————————————————————————————
  function settle(r: ImportDto) {
    row = r;
    importId = r.id;
    if (r.status === "done" && r.result && !hasTraining(r.result)) {
      // read fine, but no training in it — back to the notes, never a blank review
      phase = "write";
      notice = "No training found in these notes, so there's nothing to draft. Paste a program with exercises, sets or reps.";
      importId = null;
      keep();
    } else if (r.status === "done" && r.result) {
      phase = "review";
      block = r.result.defaultBlock;
      choices = {};
      hotLine = null;
      keep();
    } else if (r.status === "failed") {
      phase = "failed";
      error = r.error ?? "The notes couldn't be read.";
    } else if (r.status === "cancelled") {
      phase = "write";
      notice = "Stopped. Your notes are still here.";
      importId = null;
      keep();
    }
  }

  /** The pending row this read created — the POST only answers when it's done. */
  async function discover(): Promise<string | null> {
    const since = new Date(startedAt).getTime() - 5000;
    const list = await api.imports(clientId).catch(() => []);
    return list.find((i) => i.status === "pending" && new Date(i.createdAt).getTime() >= since)?.id ?? null;
  }

  async function read() {
    if (!text.trim() || tooLong) return;
    phase = "reading";
    error = null;
    notice = null;
    row = null;
    importId = null;
    startedAt = new Date().toISOString();
    keep();
    try {
      settle(
        await api.createImport({
          clientId,
          text,
          providerId: providerId || undefined,
          model: model || undefined,
          effort: effort || undefined,
        }),
      );
    } catch (err) {
      // a dropped connection (or a 502 with the row) is not the end: the row settles on the server
      const id = importId ?? (await discover());
      if (id) {
        importId = id;
        keep();
        const r = await api.importRow(id).catch(() => null);
        if (r && r.status !== "pending") settle(r);
        else if (phase !== "reading") phase = "reading";
        return;
      }
      phase = "failed";
      error = (err as Error).message;
    }
  }

  // progress: find the row, then poll it while the read runs (and after a reload)
  $effect(() => {
    if (phase !== "reading") return;
    let stopped = false;
    const t = setInterval(async () => {
      if (stopped) return;
      if (!importId) {
        importId = await discover();
        if (importId) keep();
        return;
      }
      const r = await api.importRow(importId).catch(() => null);
      if (stopped || !r) return;
      row = r;
      if (r.status !== "pending" && phase === "reading") settle(r);
    }, 1500);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  });

  async function cancel() {
    cancelling = true;
    try {
      const id = importId ?? (await discover());
      if (id) settle(await api.cancelImport(id));
      else phase = "write";
    } catch (err) {
      error = (err as Error).message;
    } finally {
      cancelling = false;
    }
  }

  let now = $state(Date.now());
  $effect(() => {
    if (phase !== "reading") return;
    now = Date.now();
    const t = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(t);
  });
  const typical = $derived(typicalGenerationSeconds(row?.providerId ?? providerId));
  const provider = $derived(providers.find((p) => p.id === (row?.providerId ?? providerId)) ?? null);

  /** `quiet`: resuming after a reload — an import that's gone just leaves the text. */
  async function reopen(id: string, quiet = false) {
    error = null;
    const r = await api.importRow(id).catch((err) => {
      if (!quiet) error = `Couldn't reopen that import: ${(err as Error).message}`;
      return null;
    });
    if (!r) {
      importId = null;
      keep();
      return;
    }
    text = r.text;
    importId = r.id;
    if (r.status === "pending") {
      row = r;
      startedAt = r.createdAt;
      phase = "reading";
      keep();
    } else settle(r);
  }

  function editText() {
    phase = "write";
    importId = null;
    keep();
  }

  // —— review ——————————————————————————————————————————————————————————
  const result = $derived<ImportResult | null>(row?.status === "done" ? row.result : null);
  const lines = $derived(importLines(row?.text ?? ""));
  const states = $derived(result ? lineStates(result, lines) : []);
  const byLine = $derived(result ? itemsByLine(result) : new Map<number, string[]>());
  const lineOf = $derived(result ? lineOfItem(result) : new Map<string, number>());
  const hotKeys = $derived(new Set(hotLine !== null ? (byLine.get(hotLine) ?? []) : []));
  const summary = $derived(result ? flagSummary(result, block, choices) : null);
  const wi = $derived(result ? templateWeekIndex(result, block) : 0);
  const week = $derived(result?.weeks[wi]);
  const exerciseCount = $derived(week?.days.reduce((n, d) => n + d.sessions.reduce((m, s) => m + s.exercises.length, 0), 0) ?? 0);
  const skippedReason = $derived(new Map((result?.skipped ?? []).map((s) => [s.line, s.reason])));
  /** Line → the flags raised on it, for the left pane's tooltips. */
  const lineFlags = $derived.by(() => {
    const m = new Map<number, ImportFlag[]>();
    const add = (line: number | null, flags: ImportFlag[]) => {
      if (line !== null && flags.length) m.set(line, [...(m.get(line) ?? []), ...flags]);
    };
    for (const w of result?.weeks ?? []) {
      add(w.line, w.flags);
      for (const d of w.days) {
        add(d.line, d.flags);
        for (const s of d.sessions) {
          add(s.line, s.flags);
          for (const e of s.exercises) add(e.line, e.flags);
        }
      }
    }
    return m;
  });
  /** The chosen block's line span: its first week header up to the next week's header. */
  const blockSpan = $derived.by<[number, number]>(() => {
    if (!result) return [1, Infinity];
    const idx = result.blocks[block]?.weeks ?? [];
    const first = result.weeks[idx[0]]?.line ?? 1;
    const next = result.weeks.slice((idx.at(-1) ?? 0) + 1).find((w) => w.line !== null)?.line;
    return [idx[0] === 0 ? 1 : first, next ? next - 1 : Infinity];
  });
  const inBlock = (line: number) => line >= blockSpan[0] && line <= blockSpan[1];

  function point(line: number | null) {
    hotLine = line;
  }

  /** Tap a line ref: light it up and bring its other half into view. */
  async function jump(line: number, toSide: "src" | "parsed") {
    hotLine = line;
    await tick();
    const target =
      toSide === "src"
        ? document.getElementById(`pi-l${line}`)
        : document.getElementById(`pi-${(byLine.get(line) ?? []).at(-1)}`);
    target?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }

  const choice = (key: string, ex: ReviewExercise): MatchChoice => choiceFor(choices, key, ex);
  function choose(key: string, c: MatchChoice) {
    choices[key] = { choice: c, confirmed: true };
    changing = null;
  }

  async function createAndChoose(key: string, input: ExerciseInput) {
    const created = await oncreate(input);
    choose(key, { kind: "catalog", exerciseId: created.id, exerciseName: created.name });
    return created;
  }

  const blocked = $derived(summary ? summary.blocking : []);

  async function useThis() {
    if (!result || blocked.length > 0 || using) return;
    using = true;
    error = null;
    // plain data for the pure helpers (they structuredClone, which proxies refuse)
    const result_ = $state.snapshot(result) as ImportResult;
    const choices_ = $state.snapshot(choices) as Record<string, ChoiceState>;
    try {
      // custom exercises first, so every row points at a real catalog entry
      const ids = new Map<string, string>();
      for (const name of newExerciseNames(result_, block, choices_)) {
        const existing = catalog.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
        const ex = existing ?? (await oncreate({ name, primaryMuscleGroup: "full_body", equipment: "other" }));
        ids.set(name.toLowerCase(), ex.id);
      }
      const aliases = aliasesToSave(result_, block, choices_, ids);
      // aliases only help the next import — never block the draft on them
      if (aliases.length) await api.saveAliases(aliases).catch(() => {});
      const form = formFromImport(result_, block, base(), {
        choices: choices_,
        newKey: uuid,
        catalog,
        resolve: (c) =>
          c.kind === "catalog"
            ? { exerciseId: c.exerciseId, exerciseName: c.exerciseName }
            : { exerciseId: ids.get(c.exerciseName.trim().toLowerCase()) ?? "", exerciseName: c.exerciseName },
      });
      clearDraft(draftKey);
      onuse(form);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      using = false;
    }
  }

  onMount(async () => {
    const kept = readDraft<Kept>(draftKey);
    if (kept) text = kept.data.text ?? "";
    const [list, recentList] = await Promise.all([api.providers().catch(() => []), api.imports(clientId).catch(() => [])]);
    providers = list.filter((p) => p.configured);
    if (providers.length && !providers.some((p) => p.id === providerId)) providerId = providers[0].id;
    recent = recentList;
    if (kept?.data.importId) await reopen(kept.data.importId, true);
  });
</script>

{#snippet flagLines(flags: ImportFlag[])}
  {#if flags.length}
    <ul class="flags">
      {#each flags as f, i (i)}
        <li class:warn={f.level === "warn"}>
          <span class="lamp" class:amber={f.level === "warn"} aria-hidden="true"></span>
          <span>{f.message}</span>
        </li>
      {/each}
    </ul>
  {/if}
{/snippet}

{#snippet lineInner(n: number, l: string, st: string, i: number)}
  <span class="no">{n}</span>
  <span class="tx">{l || " "}</span>
  {#if st === "unused"}<span class="tag">not used</span>
  {:else if st === "flagged"}<span class="tag amber">check</span>
  {:else if st === "skipped"}<span class="tag">skipped</span>
  {:else if st === "unread" && (n === 1 || states[i - 1] !== "unread")}<span class="tag red">couldn't read</span>{/if}
{/snippet}

{#snippet lineRef(line: number)}
  <button
    type="button"
    class="lref"
    class:hot={hotLine === line}
    aria-label="Show line {line} in your notes"
    onclick={() => jump(line, "src")}
    onmouseenter={() => point(line)}
    onmouseleave={() => point(null)}
  >L{line}</button>
{/snippet}

{#if phase === "write" || phase === "failed"}
  <section class="panel compose" aria-labelledby="pi-compose-title">
    <div class="panel-head">
      <h2 class="panel-title" id="pi-compose-title">Paste your notes</h2>
      <span class="chars" class:over={tooLong}>
        <span class="num">{chars.toLocaleString()}</span> / {IMPORT_MAX_CHARS.toLocaleString()}
      </span>
    </div>
    <div class="panel-body stack">
      <textarea
        class="textarea paste"
        bind:value={text}
        rows="16"
        spellcheck="false"
        aria-describedby="pi-hint"
        aria-invalid={tooLong}
        placeholder={"Week 1\n\nDay 1 Lower\nBack squat 5 reps x 5 sets\nRDL 8-10 reps x 3 sets\n…"}
      ></textarea>
      <p class="subtle hint" id="pi-hint">
        Straight from your notes, LINE or WhatsApp — typos and shorthand are fine, and nothing is translated.
        Week and Day headers help. Each value read is checked against the line it came from.
      </p>
      {#if tooLong}<p class="err" role="alert">That's over {IMPORT_MAX_CHARS.toLocaleString()} characters. Paste one block at a time.</p>{/if}
      {#if notice}<Note tone="warn" role="status">{notice}</Note>{/if}
      {#if phase === "failed" && error}
        <p class="err" role="alert">Couldn't read the notes: {error}</p>
      {:else if error}
        <p class="err" role="alert">{error}</p>
      {/if}
      <div class="compose-foot">
        {#if providers.length}
          <ModelSettings {providers} bind:providerId bind:model bind:effort hint="Used to read these notes." />
        {/if}
        {#if apiMode === "mock" && !text.trim()}
          <Button small variant="ghost" onclick={() => (text = sample)}>Paste a sample</Button>
        {/if}
        <span class="grow"></span>
        <Button variant="primary" onclick={read} disabled={!text.trim() || tooLong}>Read it</Button>
      </div>
    </div>
  </section>

  {#if recent.length}
    <section class="recent" aria-labelledby="pi-recent-title">
      <h3 id="pi-recent-title">Recent imports</h3>
      <ul>
        {#each recent as r (r.id)}
          <li>
            <span class="preview">{r.preview.split("\n").find((l) => l.trim()) ?? "—"}</span>
            <span class="subtle when">{new Date(r.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            <Pill tone={r.status === "done" ? "good" : r.status === "pending" ? "neutral" : r.status === "failed" ? "bad" : "neutral"}>{r.status === "done" ? "read" : r.status}</Pill>
            {#if r.status === "done" || r.status === "pending"}
              <Button small variant="ghost" onclick={() => reopen(r.id)}>Reopen</Button>
            {/if}
          </li>
        {/each}
      </ul>
    </section>
  {/if}
{:else if phase === "reading"}
  <section class="panel reading" aria-busy="true">
    <div class="panel-body stack">
      <div class="reading-head" role="status">
        <span class="spinner" aria-hidden="true"></span>
        <h2>Reading your notes…</h2>
      </div>
      <p class="meta">{provider?.label ?? row?.providerId ?? providerId} · {row?.model || model || provider?.model || ""}</p>
      {#if row && row.chunksTotal > 0}
        <div class="chunks" aria-label="{row.chunksDone} of {row.chunksTotal} {unit} read">
          {#each Array.from({ length: row.chunksTotal }, (_, i) => i) as i (i)}
            <span class="chunk" class:done={i < row.chunksDone}></span>
          {/each}
          <span class="chunk-label"><span class="num">{row.chunksDone}</span> of <span class="num">{row.chunksTotal}</span> {unit} read</span>
        </div>
      {/if}
      <p class="elapsed">
        <span class="num">{formatElapsed(now - new Date(startedAt).getTime())}</span> elapsed · usually about
        <span class="num">{formatElapsed(typical * 1000)}</span>
      </p>
      <p class="subtle">You can leave this page — the notes keep being read on the server, and the result waits here.</p>
      <div>
        <Button variant="ghost" onclick={cancel} disabled={cancelling}>{cancelling ? "Stopping…" : "Stop reading"}</Button>
      </div>
    </div>
  </section>
{:else if result && summary && week}
  {#if row && hasActuals(result)}
    {#key row.id}
      <HistoryImportPanel
        importId={row.id}
        savedIds={row.historyProgramIds ?? null}
        {result}
        {choices}
        {trainingDays}
        {catalog}
        {oncreate}
        onchange={(ids) => {
          if (row) row.historyProgramIds = ids;
        }}
      />
    {/key}
  {/if}
  <section class="panel band" aria-labelledby="pi-band-title">
    <div class="panel-head">
      <h2 class="panel-title" id="pi-band-title">Values found in your text</h2>
      <Counter value="{exerciseCount} exercises" />
    </div>
    <div class="panel-body band-body">
      <ul class="checks">
        <li>
          <span class="lamp" class:amber={summary.amber > 0} class:green={summary.amber === 0} aria-hidden="true"></span>
          <span><b class="num">{summary.amber}</b> to check</span>
          <span class="subtle">a number not on its line, an unusual value, or no sets in the text</span>
        </li>
        <li>
          <span class="lamp green" aria-hidden="true"></span>
          <span><b class="num">{summary.matched}</b> {summary.matched === 1 ? "name" : "names"} matched</span>
          <span class="subtle">accepted — tap Change on any that's wrong; what you pick is saved for next time</span>
        </li>
        <li>
          <span class="lamp" class:amber={summary.unused > 0} class:green={summary.unused === 0} aria-hidden="true"></span>
          <span><b class="num">{summary.unused}</b> {summary.unused === 1 ? "line" : "lines"} not used</span>
          <span class="subtle">tinted on the left</span>
        </li>
        {#if summary.unread > 0}
          <li>
            <span class="lamp red" aria-hidden="true"></span>
            <span><b class="num">{summary.unread}</b> lines couldn't be read</span>
            <span class="subtle">{result.unread.map((u) => `lines ${u.from}–${u.to}`).join(", ")} — the rest is kept</span>
          </li>
        {/if}
      </ul>
      <div class="decide">
        <p class="subtle fine">
          Every number on the right was found on the line it cites. That catches made-up and misplaced values, not every misreading — your review is the last check.
        </p>
        {#if blocked.length}
          <p class="blocker" id="pi-blocker">{blocked[0]} Shorten the notes and read again.</p>
        {/if}
        {#if error}<p class="err" role="alert">{error}</p>{/if}
        <div class="decide-row">
          <Button variant="ghost" onclick={editText}>Edit the text</Button>
          <Button
            variant="primary"
            onclick={useThis}
            disabled={using || blocked.length > 0}
            aria-describedby={blocked.length ? "pi-blocker" : undefined}
          >{using ? "Filling the editor…" : "Use this"}</Button>
        </div>
        <p class="subtle fine">Fills the editor with {week.label ?? "these notes"}. Nothing is saved until you save the draft.</p>
      </div>
    </div>
  </section>

  {#if result.blocks.length > 1}
    <fieldset class="blocks">
      <legend>Found <span class="num">{result.blocks.length}</span> blocks. Draft which one?</legend>
      {#each result.blocks as _, bi (bi)}
        <label class="block-opt" class:on={block === bi}>
          <input type="radio" name="pi-block" value={bi} checked={block === bi} onchange={() => (block = bi)} />
          <span>{blockLabel(result, bi)}</span>
          {#if bi === result.blocks.length - 1}<span class="subtle">latest</span>{/if}
        </label>
      {/each}
      {#if result.alternating}
        <p class="subtle fine">Looks like alternating weeks, so both are kept as notes. One block is drafted — the editor builds a single template week.</p>
      {/if}
    </fieldset>
  {/if}

  <div class="panes">
    <section class="panel src" aria-labelledby="pi-src-title">
      <div class="panel-head">
        <h2 class="panel-title" id="pi-src-title">Your notes</h2>
        <Counter value="{lines.length} lines" />
      </div>
      <div class="src-body">
        {#each lines as l, i (i)}
          {@const n = i + 1}
          {@const st = states[i]}
          {@const linked = byLine.has(n)}
          {@const why = st === "unused" ? "Not used — nothing was read from this line" : st === "skipped" ? `Skipped: ${skippedReason.get(n) ?? ""}` : st === "unread" ? "Couldn't be read" : (lineFlags.get(n) ?? []).map((f) => f.message).join("\n")}
          {#if linked}
            <button
              type="button"
              class="ln {st}"
              class:hot={hotLine === n}
              class:dim={!inBlock(n)}
              id="pi-l{n}"
              title={why || undefined}
              onmouseenter={() => point(n)}
              onmouseleave={() => point(null)}
              onclick={() => jump(n, "parsed")}
            >{@render lineInner(n, l, st, i)}</button>
          {:else}
            <div class="ln {st}" class:dim={!inBlock(n)} id="pi-l{n}" title={why || undefined}>{@render lineInner(n, l, st, i)}</div>
          {/if}
        {/each}
      </div>
    </section>

    <section class="panel parsed" aria-labelledby="pi-parsed-title">
      <div class="panel-head">
        <h2 class="panel-title" id="pi-parsed-title">{week.label ?? "Read from your notes"}</h2>
        <Counter value="{week.days.length} {week.days.length === 1 ? 'day' : 'days'}" />
        {#if (result.blocks[block]?.weeks.length ?? 1) > 1}
          <span class="subtle fine">latest week of {result.blocks[block].weeks.length} — the template</span>
        {/if}
      </div>
      {@render flagLines(week.flags)}
      {#each week.days as d, di (di)}
        <div class="day" id="pi-{dayKey(wi, di)}" class:hot={hotKeys.has(dayKey(wi, di))}>
          <div class="day-head">
            <h3>{d.label}</h3>
            {@render lineRef(d.line)}
          </div>
          {@render flagLines(d.flags)}
          {#each d.sessions as s, si (si)}
            {@const sk = sessionKey(wi, di, si)}
            {#if s.kind === "cardio"}
              <div class="ex cardio" id="pi-{sk}" class:hot={hotKeys.has(sk)}>
                {@render lineRef(s.line)}
                <div class="ex-main">
                  <span class="track">Cardio</span>
                  <span class="ex-name">{s.name}</span>
                  {@render flagLines(s.flags)}
                </div>
                <code class="setchip">{cardioLabel(s.cardio)}</code>
              </div>
            {:else}
              {#if d.sessions.filter((x) => x.kind === "lifting").length > 1}
                <p class="sess-name" id="pi-{sk}">{s.name}</p>
              {/if}
              {@render flagLines(s.flags)}
              {#snippet exRow(ex: (typeof s.exercises)[number], ei: number)}
                {@const key = exerciseKey(wi, di, si, ei)}
                {@const c = choice(key, ex)}
                {@const confirmed = choices[key]?.confirmed ?? false}
                {@const warn = ex.flags.some((f) => f.level === "warn")}
                <div class="ex" id="pi-{key}" class:hot={hotKeys.has(key) || hotLine === lineOf.get(key)} class:warn>
                  {@render lineRef(ex.line)}
                  <div class="ex-main">
                    <div class="ex-title">
                      <span class="ex-name">{c.exerciseName}</span>
                      {#if c.exerciseName.toLowerCase() !== ex.sourceName.toLowerCase()}
                        <span class="as-written" title="As written">“{ex.sourceName}”</span>
                      {/if}
                      {#if changing !== key}
                        {#if c.kind === "new"}
                          <Pill>new exercise</Pill>
                        {:else if confirmed}
                          <span class="subtle fine">saved as yours</span>
                        {:else if ex.match?.kind === "fuzzy"}
                          <span class="subtle fine">matched</span>
                        {:else if ex.match?.kind === "alias"}
                          <span class="subtle fine">your name for it</span>
                        {/if}
                        <button type="button" class="linkish" aria-label="Change the exercise for {ex.sourceName}" onclick={() => (changing = key)}>Change</button>
                      {/if}
                    </div>

                    {#if changing !== key && !confirmed && ex.match?.kind === "fuzzy" && !ex.match.exerciseId && ex.match.candidates?.length}
                      <p class="suggest">
                        <span class="subtle fine">Did you mean</span>
                        {#each ex.match.candidates as cand (cand.exerciseId)}
                          <button
                            type="button"
                            class="linkish"
                            onclick={() => choose(key, { kind: "catalog", exerciseId: cand.exerciseId, exerciseName: cand.name })}>{cand.name}</button
                          >
                        {/each}
                      </p>
                    {/if}

                    {#if changing === key}
                      <div class="change">
                        <ExercisePicker
                          value={c.kind === "catalog" ? c.exerciseId : ""}
                          {catalog}
                          label="Exercise for {ex.sourceName}"
                          onpick={(picked) => choose(key, { kind: "catalog", exerciseId: picked.id, exerciseName: picked.name })}
                          oncreate={(input) => createAndChoose(key, input)}
                        />
                        <Button small variant="ghost" onclick={() => (changing = null)}>Done</Button>
                      </div>
                    {/if}

                    {#if ex.note}<p class="ex-note">{ex.note}</p>{/if}
                    {@render flagLines(ex.flags)}
                  </div>
                  <code class="setchip">{setsLabel(ex.sets)}</code>
                </div>
              {/snippet}
              {#each exerciseUnits(s.exercises) as u (u.start)}
                {#if u.group}
                  <div class="xgroup" role="group" aria-label="{groupKind(u.items.length)} {u.group}">
                    <p class="xgroup-head"><span class="gletter">{u.group}</span> <strong>{groupKind(u.items.length)}</strong> · {u.items[0].sets.length} {u.items[0].sets.length === 1 ? "round" : "rounds"}</p>
                    {#each u.items as ex, k (u.start + k)}{@render exRow(ex, u.start + k)}{/each}
                  </div>
                {:else}
                  {@render exRow(u.items[0], u.start)}
                {/if}
              {/each}
            {/if}
          {/each}
        </div>
      {/each}
    </section>
  </div>

  {#key row?.id}
    <NewWordsPanel terms={result.newTerms} onjump={(line) => jump(line, "src")} />
  {/key}
{:else}
  <!-- never a blank page: a review with nothing to show falls back here -->
  <section class="panel compose" role="status">
    <div class="panel-body stack">
      <p>There's nothing to review for these notes.</p>
      <div><Button variant="primary" onclick={editText}>Back to your notes</Button></div>
    </div>
  </section>
{/if}

<style>
  .stack { display: flex; flex-direction: column; gap: 12px; }
  .grow { flex: 1; }
  .fine { font-size: 12px; margin: 0; }
  .num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  /* —— compose —— */
  .compose { max-width: var(--measure-form); }
  .chars { margin-left: auto; font-size: 12px; color: var(--muted); }
  .chars.over { color: var(--bad); font-weight: 600; }
  .paste {
    font: 13px/1.55 var(--font-mono);
    min-height: 320px;
    resize: vertical;
    tab-size: 4;
    white-space: pre;
    overflow-x: auto;
  }
  .hint { margin: 0; font-size: 13px; }
  .compose-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

  .recent { max-width: var(--measure-form); margin-top: 20px; }
  .recent h3 { font: 600 14px var(--font-ui); margin: 0 0 8px; }
  .recent ul { list-style: none; margin: 0; padding: 0; border: 1px solid var(--line); border-radius: var(--radius); }
  .recent li { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 12px; font-size: 13px; }
  .recent li + li { border-top: 1px solid var(--line-soft); }
  .preview { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-mono); font-size: 12px; }
  .when { white-space: nowrap; font-size: 12px; }

  /* —— reading —— */
  .reading { max-width: var(--measure-form); }
  .reading-head { display: flex; align-items: center; gap: 10px; }
  .reading-head h2 { font: 600 16px/1.3 var(--font-ui); margin: 0; }
  .meta { margin: 0; color: var(--muted); font-size: 13px; }
  .elapsed { margin: 0; font-size: 13px; color: var(--muted); }
  .elapsed .num { color: var(--ink); }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--line);
    border-top-color: var(--blue);
    border-radius: 50%;
    animation: spin 0.9s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .chunks { display: flex; align-items: center; gap: 4px; }
  .chunk { width: 28px; height: 10px; border-radius: 4px; background: var(--well-2); border: 1px solid var(--cell-edge); transition: background 240ms cubic-bezier(0.16, 1, 0.3, 1); }
  .chunk.done { background: var(--blue); }
  .chunk-label { margin-left: 8px; font-size: 13px; color: var(--muted); }

  /* —— decision band —— */
  .band { margin-bottom: 16px; }
  .band-body { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 16px 32px; align-items: start; }
  .checks { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .checks li { display: grid; grid-template-columns: 8px auto minmax(0, 1fr); align-items: baseline; gap: 4px 10px; font-size: 14px; }
  .checks .subtle { font-size: 13px; }
  .lamp { width: 8px; height: 8px; border-radius: 50%; background: var(--lamp-gray); display: inline-block; flex: none; }
  .lamp.green { background: var(--green-btn); }
  .lamp.amber { background: var(--lamp-amber); }
  .lamp.red { background: var(--bad); }
  .decide { display: flex; flex-direction: column; gap: 8px; }
  .decide-row { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }
  .blocker { margin: 0; font-size: 13px; color: var(--warn-ink); background: var(--warn-bg); border: 1px solid var(--warn-line); border-radius: var(--radius); padding: 6px 10px; }

  /* —— block picker —— */
  .blocks { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 16px 12px; margin: 0 0 16px; display: flex; flex-direction: column; gap: 6px; }
  .blocks legend { font: 600 14px var(--font-ui); padding: 0 4px; }
  .block-opt { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; padding: 4px 8px; border-radius: var(--radius); }
  .block-opt.on { background: var(--well); }

  /* —— panes —— */
  .panes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 16px; align-items: start; }
  .src { position: sticky; top: 16px; }
  .src-body { max-height: calc(100vh - 140px); overflow: auto; padding: 6px 0; font: 12.5px/1.6 var(--font-mono); }
  .ln { display: grid; grid-template-columns: 44px minmax(0, 1fr) auto; align-items: start; padding: 0 10px 0 0; color: var(--ink); }
  button.ln { width: 100%; text-align: left; font: inherit; background: transparent; border: 0; border-radius: 0; cursor: pointer; }
  .ln .no { text-align: right; padding-right: 12px; color: var(--faint); user-select: none; font-variant-numeric: tabular-nums; }
  .ln .tx { white-space: pre-wrap; overflow-wrap: anywhere; }
  .ln.blank .tx { color: var(--faint); }
  .ln.unused { background: var(--well); }
  .ln.unused .tx { color: var(--muted); text-decoration: underline dotted var(--line-strong); text-underline-offset: 3px; }
  .ln.flagged { background: var(--warn-bg); }
  .ln.flagged .no { color: var(--warn); }
  .ln.unread { background: var(--bad-bg); }
  .ln.unread .tx { color: var(--muted); }
  .ln.skipped .tx { color: var(--muted); }
  .ln.dim:not(.hot) { opacity: 0.5; }
  .ln.hot { background: var(--pulse-now-bg); box-shadow: inset 0 0 0 1px var(--blue-line); }
  .ln.hot .no { color: var(--blue); font-weight: 600; }
  .ln:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
  .xgroup { border: 1px solid var(--line); border-radius: var(--radius); margin: 4px 0; }
  .xgroup-head { margin: 0; padding: 4px 10px; background: var(--well); border-bottom: 1px solid var(--line); border-radius: var(--radius) var(--radius) 0 0; font: 500 12px/1.4 var(--font-ui); color: var(--muted); }
  .xgroup-head strong { color: var(--ink); font-weight: 600; }
  .gletter { font: 600 11px/1 var(--font-mono); }
  .tag { font: 500 11px/1.6 var(--font-ui); color: var(--muted); padding: 0 6px; border-radius: 99px; background: var(--surface); border: 1px solid var(--line); margin-left: 8px; white-space: nowrap; align-self: center; }
  .tag.amber { color: var(--warn); border-color: var(--warn-line); background: var(--warn-bg); }
  .tag.red { color: var(--bad); border-color: var(--bad-line); }

  .parsed > .flags { padding: 8px 16px 0; }
  .day { padding: 4px 0 8px; }
  .day + .day { border-top: 1px solid var(--line); }
  .day-head { display: flex; align-items: center; gap: 8px; padding: 10px 16px 4px; }
  .day-head h3 { font: 600 14px/1.3 var(--font-ui); margin: 0; }
  .day.hot .day-head h3 { color: var(--blue); }
  .sess-name { margin: 6px 16px 0; font: 600 13px var(--font-ui); color: var(--muted); }

  .ex { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; gap: 10px; padding: 8px 16px 8px 12px; align-items: start; }
  .ex + .ex { border-top: 1px solid var(--line-soft); }
  .ex.hot { background: var(--pulse-now-bg); }
  .ex-main { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .ex-title { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; }
  .ex-name { font: 600 14px/1.35 var(--font-ui); }
  .as-written { font: 12px var(--font-mono); color: var(--faint); }
  .ex .setchip { white-space: nowrap; align-self: start; margin-top: 1px; }
  .track { font: 500 12px/1 var(--font-mono); color: var(--good); margin-right: 6px; }
  .cardio .ex-main { flex-direction: row; flex-wrap: wrap; align-items: baseline; }
  .cardio .flags { flex-basis: 100%; }

  .lref {
    font: 500 11.5px/1.9 var(--font-mono);
    color: var(--faint);
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    padding: 0 4px;
    cursor: pointer;
    font-variant-numeric: tabular-nums;
    justify-self: start;
  }
  .lref:hover, .lref.hot { color: var(--blue); border-color: var(--blue-line); background: var(--pulse-now-bg); }

  .change { display: flex; align-items: center; gap: 8px; }
  .change :global(.picker), .change :global(> :first-child) { flex: 1; min-width: 0; }
  .linkish { background: none; border: 0; padding: 0; color: var(--muted); font: 12px var(--font-ui); cursor: pointer; }
  .ex:hover .linkish, .linkish:focus-visible { color: var(--blue); }
  .linkish:hover { text-decoration: underline; text-underline-offset: 3px; }
  .ex-note { margin: 0; font-size: 13px; color: var(--muted); }
  .suggest { margin: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
  .suggest .linkish { color: var(--blue); }

  .flags { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
  .flags li { display: flex; align-items: baseline; gap: 8px; font-size: 12.5px; color: var(--faint); }
  .flags li.warn { color: var(--warn); font-weight: 500; }
  .flags .lamp { width: 6px; height: 6px; transform: translateY(-1px); }

  @media (max-width: 1000px) {
    .band-body { grid-template-columns: minmax(0, 1fr); }
    .decide-row { justify-content: flex-start; }
    .panes { grid-template-columns: minmax(0, 1fr); }
    .src { position: static; }
    .src-body { max-height: 46vh; }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner { animation: none; }
    .chunk { transition: none; }
  }
</style>
