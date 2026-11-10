<script lang="ts">
  import { onMount, tick } from "svelte";
  import { progressionLabel, SCHEME_PRESETS, schemePreset, type SchemePreset, type SchemePresetGoal } from "@pt/shared";
  import { api } from "$lib/api";
  import type { PeriodizationSchemeDto, WeekPlan } from "$lib/api/types";
  import { weekPlanLabel } from "$lib/format";
  import { rowsToWeekPlans, weekPlansToRows, type PhasingRow } from "$lib/phasing";
  import DirChip from "$lib/components/DirChip.svelte";
  import WeekPlanRows from "$lib/components/WeekPlanRows.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
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

  /** "W2 · +intensity · intensity +3% · +2.5% 1RM" — the rule is what the presets are for. */
  const chipLabel = (w: WeekPlan) => weekPlanLabel(w) + (w.progression ? ` · ${progressionLabel(w.progression)}` : "");

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

  const startNew = () =>
    openEditor({
      id: null,
      name: "",
      description: "",
      basedOn: null,
      rows: [
        { directive: "base", metric: "", deltaPercent: null },
        { directive: "+intensity", metric: "", deltaPercent: null, progKind: "percent", progAmount: 2.5 },
        { directive: "+intensity", metric: "", deltaPercent: null, progKind: "percent", progAmount: 2.5 },
        { directive: "deload", metric: "", deltaPercent: null },
      ],
    });

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

{#snippet chips(weeks: WeekPlan[])}
  <div class="chips">
    {#each weeks as w (w.week)}
      <span title={w.note}><DirChip directive={w.directive}>{chipLabel(w)}</DirChip></span>
    {/each}
  </div>
{/snippet}

{#snippet schemeEditor()}
  {#if editor}
    <form class="editor" bind:this={editorEl} onsubmit={save} aria-label={editor.id ? `Edit ${editor.name}` : "New scheme"}>
      <div class="editor-fields">
        <label class="field">
          <span class="field-label">Name</span>
          <input class="input" maxlength="120" placeholder="e.g. 5-week peak" bind:value={editor.name} />
        </label>
        <label class="field grow">
          <span class="field-label">Description <span class="opt">optional</span></span>
          <input class="input" maxlength="500" placeholder="When you use it, what it's for" bind:value={editor.description} />
        </label>
      </div>
      <WeekPlanRows bind:rows={editor.rows} />
      <div class="editor-acts">
        <Button variant="primary" type="submit" disabled={!editorValid || saving}>{saving ? "Saving…" : "Save scheme"}</Button>
        <Button variant="ghost" type="button" onclick={() => (editor = null)}>Cancel</Button>
        <span class="subtle"><span class="mono">{editor.rows.length}</span> weeks</span>
      </div>
    </form>
  {/if}
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
      <EmptyState>No schemes of your own yet. Duplicate a preset below, or start a new one.</EmptyState>
    {:else}
      <ul class="rows">
        {#each schemes as s (s.id)}
          <li class="row">
            {#if editor?.id === s.id}
              {@render schemeEditor()}
            {:else}
              <div class="row-head">
                <h3 class="name">{s.name}</h3>
                <span class="weeks mono">{s.weeks.length} wk</span>
                <div class="acts">
                  <Button small variant="ghost" onclick={() => startEdit(s)}>Edit</Button>
                  <Button small variant="ghost" onclick={() => duplicateScheme(s)}>Duplicate</Button>
                  <ConfirmButton label="Delete" confirmLabel="Delete {s.name}?" onconfirm={() => remove(s)} small variant="ghost" class="danger" />
                </div>
              </div>
              {#if s.description}<p class="desc">{s.description}</p>{/if}
              {@render chips(s.weeks)}
              {#if basisName(s.basedOn)}<p class="basis">Based on {basisName(s.basedOn)}</p>{/if}
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
            <div class="row-head">
              <h3 class="name">{p.name}</h3>
              <Pill>{GOAL_LABEL[p.goal]}</Pill>
              <span class="weeks mono">{p.weeks.length} wk</span>
              <div class="acts">
                <Button small variant="ghost" onclick={() => duplicatePreset(p)}>Duplicate</Button>
                <Button small variant="ghost" onclick={() => setHidden(p, true)}>Hide</Button>
              </div>
            </div>
            <p class="desc">{p.summary}</p>
            {@render chips(p.weeks)}
            <details class="sources">
              <summary>Sources <span class="mono">{p.sources.length}</span></summary>
              <ul>
                {#each p.sources as src (src)}<li>{src}</li>{/each}
              </ul>
            </details>
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
          <ul class="rows">
            {#each hiddenPresets as p (p.key)}
              <li class="row muted">
                <div class="row-head">
                  <h3 class="name">{p.name}</h3>
                  <Pill>{GOAL_LABEL[p.goal]}</Pill>
                  <span class="weeks mono">{p.weeks.length} wk</span>
                  <div class="acts">
                    <Button small variant="ghost" onclick={() => setHidden(p, false)}>Show</Button>
                  </div>
                </div>
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

  .rows { list-style: none; margin: 0; padding: 0; }
  .row { display: flex; flex-direction: column; gap: 6px; padding: 12px 16px; border-bottom: 1px solid var(--line-soft); }
  .row:last-child { border-bottom: none; }
  .row-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .name { margin: 0; font: 600 14px var(--font-ui); color: var(--ink); }
  .weeks { font-size: 12px; color: var(--muted); }
  .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .acts { margin-left: auto; display: flex; gap: 4px; }
  .desc { margin: 0; font-size: 13px; color: var(--muted); max-width: 72ch; }
  .basis { margin: 0; font-size: 12px; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .row.muted .name { color: var(--muted); }

  .sources { font-size: 12px; color: var(--muted); }
  .sources summary { cursor: pointer; width: fit-content; }
  .sources ul { margin: 4px 0 0; padding-left: 18px; }
  .sources li + li { margin-top: 2px; }

  .editor { display: flex; flex-direction: column; gap: 12px; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); background: var(--well); }
  .row .editor { margin: -12px -16px; border-bottom: none; }
  .editor-fields { display: flex; gap: 12px; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; min-width: 200px; }
  .field.grow { flex: 1; }
  .field-label { font: 500 12px var(--font-ui); color: var(--ink); }
  .opt { font-weight: 400; color: var(--muted); }
  .editor-acts { display: flex; align-items: center; gap: 8px; }
  .editor-acts .subtle { margin-left: auto; font-size: 12px; color: var(--muted); }

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
  .toggle :global(svg) { width: 12px; height: 12px; transform: rotate(-90deg); transition: transform 120ms; }
  .toggle[aria-expanded="true"] :global(svg) { transform: none; }

  @media (max-width: 640px) {
    .acts { margin-left: 0; width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle :global(svg) { transition: none; }
  }
</style>
