<script lang="ts">
  import { onMount, tick, type Snippet } from "svelte";
  import { SCHEME_PRESETS, schemePreset, type SchemePreset, type SchemePresetGoal } from "@pt/shared";
  import { api } from "$lib/api";
  import type { PeriodizationSchemeDto, WeekPlan } from "$lib/api/types";
  import { planIndexes } from "$lib/draftReview";
  import { rowsToWeekPlans, weekPlansToRows, type PhasingRow } from "$lib/phasing";
  import SchemeScore from "$lib/components/SchemeScore.svelte";
  import SchemeShape from "$lib/components/SchemeShape.svelte";
  import WeekPlanRows from "$lib/components/WeekPlanRows.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import InputField from "$lib/ui/InputField.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  let schemes = $state<PeriodizationSchemeDto[]>([]);
  let hidden = $state<string[]>([]);
  let loaded = $state(false);
  let error = $state<string | null>(null);
  let showHidden = $state(false);

  /** The open editor: a new scheme (`id` null) or an existing one. */
  let editor = $state<{ id: string | null; name: string; description: string; basedOn: string | null; rows: PhasingRow[] } | null>(null);
  let saving = $state(false);
  let editorEl = $state<HTMLElement>();

  const visiblePresets = $derived(SCHEME_PRESETS.filter((p) => !hidden.includes(p.key)));
  const hiddenPresets = $derived(SCHEME_PRESETS.filter((p) => hidden.includes(p.key)));
  const editorValid = $derived(
    editor != null && editor.name.trim().length > 0 && editor.rows.length >= 2 && editor.description.length <= 500
  );

  const GOAL_LABEL: Record<SchemePresetGoal, string> = {
    strength: "Strength",
    hypertrophy: "Hypertrophy",
    peaking: "Peaking",
    general: "General",
  };

  /** One volume axis for every silhouette on the page, so a taller shape means a bigger block. */
  const shapeScale = $derived(
    Math.max(120, ...[...schemes.map((s) => s.weeks), ...SCHEME_PRESETS.map((p) => p.weeks)].flatMap((ws) => planIndexes({ weeks: ws }).map((x) => x.vol)))
  );

  /** "Hypertrophy volume ramp" for a preset key, the scheme's name for a scheme id. */
  function basisName(basedOn: string | null): string | null {
    if (!basedOn) return null;
    return schemePreset(basedOn)?.name ?? schemes.find((s) => s.id === basedOn)?.name ?? null;
  }

  async function run(fn: () => Promise<void>) {
    error = null;
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function openEditor(next: NonNullable<typeof editor>) {
    editor = next;
    await tick();
    editorEl?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    editorEl?.querySelector<HTMLInputElement>("input")?.focus();
  }

  const startNew = () => openEditor({ id: null, name: "", description: "", basedOn: null, rows: DEFAULT_ROWS() });

  const startEdit = (s: PeriodizationSchemeDto) =>
    openEditor({ id: s.id, name: s.name, description: s.description ?? "", basedOn: s.basedOn, rows: weekPlansToRows(s.weeks) });

  /** A copy the trainer owns, opened straight in the editor. */
  function duplicate(source: { name: string; weeks: WeekPlan[]; description: string | null; basedOn: string }) {
    return run(async () => {
      const copy = await api.createScheme({
        name: `${source.name} (copy)`.slice(0, 120),
        description: source.description,
        basedOn: source.basedOn,
        weeks: $state.snapshot(source.weeks) as WeekPlan[],
      });
      schemes = [...schemes, copy];
      await startEdit(copy);
    });
  }

  const duplicatePreset = (p: SchemePreset) =>
    duplicate({ name: p.name, weeks: [...p.weeks], description: p.summary, basedOn: p.key });
  const duplicateScheme = (s: PeriodizationSchemeDto) =>
    duplicate({ name: s.name, weeks: s.weeks, description: s.description, basedOn: s.id });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!editor || !editorValid || saving) return;
    const ed = editor;
    saving = true;
    await run(async () => {
      const input = {
        name: ed.name.trim(),
        description: ed.description.trim() || null,
        basedOn: ed.basedOn,
        weeks: rowsToWeekPlans(ed.rows),
      };
      if (ed.id) {
        const updated = await api.updateScheme(ed.id, input);
        schemes = schemes.map((s) => (s.id === updated.id ? updated : s));
      } else {
        schemes = [...schemes, await api.createScheme(input)];
      }
      editor = null;
    });
    saving = false;
  }

  const remove = (s: PeriodizationSchemeDto) =>
    run(async () => {
      await api.deleteScheme(s.id);
      schemes = schemes.filter((x) => x.id !== s.id);
      if (editor?.id === s.id) editor = null;
    });

  const setHidden = (p: SchemePreset, hide: boolean) =>
    run(async () => {
      hidden = await api.setSchemePresetHidden(p.key, hide);
    });

  /** A new scheme's starting weeks: three building weeks and a deload. */
  const DEFAULT_ROWS = (): PhasingRow[] => [
    { directive: "base", metric: "", deltaPercent: null },
    { directive: "+intensity", metric: "", deltaPercent: null, progKind: "percent", progAmount: 2.5 },
    { directive: "+intensity", metric: "", deltaPercent: null, progKind: "percent", progAmount: 2.5 },
    { directive: "deload", metric: "", deltaPercent: null },
  ];
  /** Swap the draft's weeks for a preset's (or the blank 4-week start). */
  function startFrom(p: SchemePreset | null) {
    if (!editor) return;
    editor.rows = p ? weekPlansToRows(p.weeks) : DEFAULT_ROWS();
    editor.basedOn = p?.key ?? null;
    if (p && !editor.description) editor.description = p.summary.slice(0, 500);
  }

  onMount(async () => {
    await run(async () => {
      [schemes, hidden] = await Promise.all([api.schemes(), api.hiddenSchemePresets()]);
    });
    loaded = true;
  });
</script>

<svelte:head><title>Progression schemes · Program Tracker</title></svelte:head>

<PageHead
  title="Progression schemes"
  sub="Week-by-week plans for a block: what each week pushes, and the rule that writes it from the week before. Presets are built in — duplicate one to make it yours. Programs keep the weeks they were saved with."
/>

{#if error}<div class="err"><Note tone="bad">{error}</Note></div>{/if}

{#snippet schemeEditor()}
  {#if editor}
    <form class="editor" bind:this={editorEl} onsubmit={save} aria-label={editor.id ? `Edit ${editor.name}` : "New scheme"}>
      <div class="editor-fields">
        <div class="field"><InputField label="Name" maxlength={120} placeholder="e.g. 5-week peak" bind:value={editor.name} /></div>
        <div class="field grow"><InputField label="Description" optional maxlength={500} placeholder="When you use it, what it's for" bind:value={editor.description} /></div>
      </div>
      {#if editor.id === null}
      <div class="start">
        <p class="start-lead">Start from</p>
        <div class="picks" role="group" aria-label="Start from a preset">
          <button type="button" class="pick" aria-pressed={editor.basedOn === null} onclick={() => startFrom(null)}>
            <span class="blank" aria-hidden="true"></span><span>Blank</span>
          </button>
          {#each SCHEME_PRESETS as p (p.key)}
            <button type="button" class="pick" aria-pressed={editor.basedOn === p.key} onclick={() => startFrom(p)}>
              <SchemeShape weeks={p.weeks} scale={shapeScale} /><span>{p.name}</span>
            </button>
          {/each}
        </div>
      </div>
      {/if}
      <WeekPlanRows bind:rows={editor.rows} />
      <div class="editor-acts">
        <Button variant="primary" type="submit" disabled={!editorValid || saving}>{saving ? "Saving…" : "Save scheme"}</Button>
        <Button variant="ghost" type="button" onclick={() => (editor = null)}>Cancel</Button>
        <span class="subtle"><span class="mono">{editor.rows.length}</span> weeks</span>
      </div>
    </form>
  {/if}
{/snippet}

<!-- One scheme: the silhouette and name lead, the week score reads beside them
     on a wide row and under them on a narrow one. -->
{#snippet scheme(s: { name: string; weeks: WeekPlan[]; summary: string | null; goal?: SchemePresetGoal; basis?: string | null }, acts: Snippet, extra?: Snippet)}
  <article class="scheme">
    <div class="lede">
      <div class="head">
        <SchemeShape weeks={s.weeks} scale={shapeScale} />
        <div class="title">
          <h3 class="name">{s.name}</h3>
          <p class="meta">
            {#if s.goal}<Pill>{GOAL_LABEL[s.goal]}</Pill>{/if}
            <span class="mono">{s.weeks.length} wk</span>
            {#if s.basis}<span class="basis">from {s.basis}</span>{/if}
          </p>
        </div>
      </div>
      {#if s.summary}<p class="desc">{s.summary}</p>{/if}
      {#if extra}<div class="extra">{@render extra()}</div>{/if}
      <div class="acts">{@render acts()}</div>
    </div>
    <div class="score"><SchemeScore weeks={s.weeks} name={s.name} /></div>
  </article>
{/snippet}

<div class="stack">
  <Panel title="Your schemes" count={schemes.length}>
    {#snippet act()}
      <Button small onclick={startNew} disabled={editor?.id === null}>{#snippet icon()}<Icon name="plus" />{/snippet}New scheme</Button>
    {/snippet}

    {#if editor && editor.id === null}{@render schemeEditor()}{/if}

    {#if !loaded}
      <div class="panel-body"><Skeleton h="120px" /></div>
    {:else if schemes.length === 0 && !editor}
      <p class="empty">No schemes of your own yet. Duplicate a preset below, or start a new one.</p>
    {:else}
      <ul class="rows">
        {#each schemes as s (s.id)}
          <li class="row">
            {#if editor?.id === s.id}
              {@render schemeEditor()}
            {:else}
              {#snippet acts()}
                <Button small onclick={() => startEdit(s)}>{#snippet icon()}<Icon name="pencil" />{/snippet}Edit</Button>
                <Button small variant="ghost" onclick={() => duplicateScheme(s)}>Duplicate</Button>
                <ConfirmButton label="Delete" confirmLabel="Delete {s.name}?" subject={s.name} onconfirm={() => remove(s)} small variant="ghost" class="danger" />
              {/snippet}
              {@render scheme({ name: s.name, weeks: s.weeks, summary: s.description, basis: basisName(s.basedOn) }, acts)}
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </Panel>

  <Panel title="Presets" count={visiblePresets.length}>
    {#if visiblePresets.length === 0}
      <EmptyState>Every preset is hidden.</EmptyState>
    {:else}
      <ul class="rows">
        {#each visiblePresets as p (p.key)}
          <li class="row">
            {#snippet acts()}
              <Button small onclick={() => duplicatePreset(p)}>{#snippet icon()}<Icon name="layers" />{/snippet}Duplicate</Button>
              <Button small variant="ghost" onclick={() => setHidden(p, true)}>{#snippet icon()}<Icon name="eye" />{/snippet}Hide</Button>
            {/snippet}
            {#snippet sources()}
              <details class="sources">
                <summary>Sources <span class="mono">{p.sources.length}</span></summary>
                <ul>
                  {#each p.sources as src (src)}<li>{src}</li>{/each}
                </ul>
              </details>
            {/snippet}
            {@render scheme({ name: p.name, weeks: p.weeks, summary: p.summary, goal: p.goal }, acts, sources)}
          </li>
        {/each}
      </ul>
    {/if}

    {#if hiddenPresets.length > 0}
      <div class="hidden-group">
        <button class="toggle" type="button" aria-expanded={showHidden} onclick={() => (showHidden = !showHidden)}>
          <Icon name="chevron" />
          Hidden <span class="mono">{hiddenPresets.length}</span>
        </button>
        {#if showHidden}
          <ul class="hidden-rows">
            {#each hiddenPresets as p (p.key)}
              <li class="hidden-row">
                <SchemeShape weeks={p.weeks} scale={shapeScale} />
                <span class="name">{p.name}</span>
                <span class="mono weeks">{p.weeks.length} wk</span>
                <Button small variant="ghost" onclick={() => setHidden(p, false)}>Show</Button>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </Panel>
</div>

<style>
  .err { margin-bottom: 12px; }
  .stack { display: flex; flex-direction: column; gap: 16px; }
  .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  .empty { margin: 0; padding: 14px 16px; font-size: 13px; color: var(--muted); }

  /* —— one scheme ——————————————————————— */
  .rows { list-style: none; margin: 0; padding: 0; container-type: inline-size; }
  .row { border-bottom: 1px solid var(--line-soft); }
  .row:last-child { border-bottom: none; }
  /* Narrow rows read top to bottom: who it is, the weeks, then what to do. */
  .scheme { display: flex; flex-direction: column; gap: 10px; padding: 16px; }
  .lede { display: contents; }
  .score { order: 1; margin-block: 2px; }
  .extra, .acts { order: 2; }
  .head { display: flex; align-items: flex-end; gap: 12px; }
  .title { min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .name { margin: 0; font: 600 15px/1.3 var(--font-ui); color: var(--ink); text-wrap: balance; }
  .meta { margin: 0; display: flex; align-items: center; flex-wrap: wrap; gap: 4px 8px; font-size: 12px; color: var(--muted); }
  .basis::before { content: "· "; }
  .desc { margin: 0; font-size: 13px; line-height: 1.5; color: var(--muted); max-width: 64ch; text-wrap: pretty; }
  .acts { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 2px; }
  .score { min-width: 0; }

  .sources { font-size: 12px; color: var(--muted); }
  .sources summary { cursor: pointer; width: fit-content; }
  .sources summary:hover { color: var(--ink); }
  .sources ul { margin: 6px 0 0; padding-left: 18px; line-height: 1.45; }
  .sources li + li { margin-top: 4px; }

  /* Wide rows: the story on the left, the score on the right. */
  @container (min-width: 760px) {
    .scheme { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 32px; padding: 18px 20px; }
    .lede { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
    .score { margin: 0; }
  }

  /* —— editor ——————————————————————————— */
  .editor { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); background: var(--well); }
  .row .editor { border-bottom: none; }
  .editor-fields { display: flex; gap: 12px; flex-wrap: wrap; }
  .field { flex: 1 1 200px; }
  .field.grow { flex: 2 1 260px; }
  .editor-acts { display: flex; align-items: center; gap: 8px; }
  .editor-acts .subtle { margin-left: auto; display: inline-flex; align-items: flex-end; gap: 10px; font-size: 12px; color: var(--muted); }

  /* —— hidden presets ———————————————————— */
  .hidden-group { border-top: 1px solid var(--line); }
  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 10px 16px;
    border: none;
    background: none;
    font: 500 13px var(--font-ui);
    color: var(--muted);
    cursor: pointer;
  }
  .toggle:hover { color: var(--ink); }
  .toggle :global(svg) { width: 12px; height: 12px; transform: rotate(-90deg); transition: transform 120ms; }
  .toggle[aria-expanded="true"] :global(svg) { transform: none; }
  .hidden-rows { list-style: none; margin: 0; padding: 0 0 6px; }
  .hidden-row { display: flex; align-items: center; gap: 12px; padding: 6px 16px; opacity: 0.75; }
  .hidden-row:hover { opacity: 1; }
  .hidden-row .name { font-weight: 500; color: var(--muted); min-width: 0; }
  .hidden-row .weeks { font-size: 12px; color: var(--muted); }
  .hidden-row :global(.btn) { margin-left: auto; }

  @media (prefers-reduced-motion: reduce) {
    .toggle :global(svg) { transition: none; }
  }

  /* —— start from a preset ————————————— */
  .start { display: flex; flex-direction: column; gap: 6px; }
  .start-lead { margin: 0; font: 600 12px var(--font-ui); color: var(--ink); }
  .picks { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 4px; margin-inline: -16px; padding-inline: 16px; scroll-snap-type: x proximity; }
  .pick {
    flex: none; scroll-snap-align: start;
    display: flex; flex-direction: column; align-items: flex-start; gap: 6px;
    width: 116px; padding: 8px 10px 9px;
    border: 1px solid var(--line); border-radius: 6px; background: var(--surface);
    font: 500 12px/1.3 var(--font-ui); color: var(--ink); text-align: left; cursor: pointer;
  }
  .pick:hover { border-color: var(--line-strong); }
  .pick[aria-pressed="true"] { border-color: var(--hover-ink); box-shadow: inset 0 0 0 1px var(--hover-ink); }
  .pick:focus-visible { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
  .blank { display: block; height: 36px; width: 40px; border-bottom: 1px solid var(--line-strong); }
</style>
