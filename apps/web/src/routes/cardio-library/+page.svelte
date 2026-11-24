<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { CARDIO_METRICS, type CardioMetric } from "@pt/shared";
  import { api } from "$lib/api";
  import type { CardioTemplateDto, CardioTemplatePresetDto, CardioTemplatesDto, ModalityDto } from "$lib/api/types";
  import { METRIC_HINT, METRIC_LABEL, templateSummary } from "$lib/cardioLibrary";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import InputField from "$lib/ui/InputField.svelte";
  import InputRename from "$lib/ui/InputRename.svelte";
  import InputSearch from "$lib/ui/InputSearch.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import SelectCell from "$lib/ui/SelectCell.svelte";
  import SelectDescribed from "$lib/ui/SelectDescribed.svelte";
  import SkeletonRows from "$lib/ui/SkeletonRows.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import LeaveGuard from "$lib/ui/LeaveGuard.svelte";
  import { createLibraryGuard } from "$lib/libraryGuard.svelte";
  import { hasDraft } from "$lib/libraryDraft";
  import { revealRow } from "$lib/revealRow";
  import type { SelectOption } from "$lib/ui/select/options";

  type Tab = "templates" | "modalities";
  const tab = $derived<Tab>(page.url.hash === "#modalities" ? "modalities" : "templates");
  const setTab = (id: string) => goto(`#${id}`, { replaceState: true, noScroll: true, keepFocus: true });

  let templates = $state<CardioTemplatesDto | null>(null);
  let modalities = $state<ModalityDto[] | null>(null);
  let error = $state<string | null>(null);
  let query = $state("");
  let showArchived = $state(false);

  async function run(fn: () => Promise<void>) {
    error = null;
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const q = $derived(query.trim().toLowerCase());
  const hit = (name: string) => !q || name.toLowerCase().includes(q);

  // ---- Templates ----
  const presets = $derived((templates?.presets ?? []).filter((p) => hit(p.name)));
  const own = $derived((templates?.templates ?? []).filter((t) => !t.archivedAt && hit(t.name)));
  const ownArchived = $derived((templates?.templates ?? []).filter((t) => t.archivedAt && hit(t.name)));
  const putTemplate = (row: CardioTemplateDto) =>
    templates && (templates = { ...templates, templates: templates.templates.map((t) => (t.id === row.id ? row : t)) });

  const setPresetHidden = (p: CardioTemplatePresetDto, hidden: boolean) =>
    run(async () => {
      const keys = await api.setCardioPresetHidden(p.key, hidden);
      if (templates) templates = { ...templates, presets: templates.presets.map((x) => ({ ...x, hidden: keys.includes(x.key) })) };
    });
  const renameTemplate = (t: CardioTemplateDto, name: string) => run(async () => void putTemplate(await api.patchCardioTemplate(t.id, { name })));
  const archiveTemplate = (t: CardioTemplateDto, archived: boolean) =>
    run(async () => void putTemplate(await api.patchCardioTemplate(t.id, { archived })));
  const deleteTemplate = (t: CardioTemplateDto) =>
    run(async () => {
      await api.deleteCardioTemplate(t.id);
      if (templates) templates = { ...templates, templates: templates.templates.filter((x) => x.id !== t.id) };
    });

  // ---- Modalities ----
  const liveModalities = $derived((modalities ?? []).filter((m) => !m.archivedAt && hit(m.name)));
  const presetModalities = $derived(liveModalities.filter((m) => m.presetKey));
  const customModalities = $derived(liveModalities.filter((m) => !m.presetKey));
  const archivedModalities = $derived((modalities ?? []).filter((m) => m.archivedAt && hit(m.name)));
  const putModality = (row: ModalityDto) => modalities && (modalities = modalities.map((m) => (m.id === row.id ? row : m)));

  let newName = $state("");
  let newMetric = $state<CardioMetric>("pace");
  let adding = $state(false);
  const metricOptions: SelectOption<CardioMetric>[] = CARDIO_METRICS.map((m) => ({ value: m, label: METRIC_LABEL[m], description: METRIC_HINT[m] }));
  const metricCells: SelectOption<CardioMetric>[] = CARDIO_METRICS.map((m) => ({ value: m, label: METRIC_LABEL[m] }));

  async function addModality(e: SubmitEvent) {
    e.preventDefault();
    if (!newName.trim() || adding || !modalities) return;
    adding = true;
    await run(async () => {
      const row = await api.createModality({ name: newName, metric: newMetric });
      modalities = [...(modalities ?? []), row];
      newName = "";
      added = `Added ${row.name}.`;
      void revealRow(row.id);
    });
    adding = false;
  }
  /** Set after an add, cleared when the name is typed in again. */
  let added = $state<string | null>(null);
  $effect(() => {
    if (newName) added = null;
  });
  const guard = createLibraryGuard({ dirty: () => hasDraft(newName), what: () => `The new modality “${newName.trim()}”` });

  const renameModality = (m: ModalityDto, name: string) => run(async () => void putModality(await api.patchModality(m.id, { name })));
  const setMetric = (m: ModalityDto, metric: CardioMetric) => run(async () => void putModality(await api.patchModality(m.id, { metric })));
  const archiveModality = (m: ModalityDto, archived: boolean) => run(async () => void putModality(await api.patchModality(m.id, { archived })));
  const deleteModality = (m: ModalityDto) =>
    run(async () => {
      await api.deleteModality(m.id);
      modalities = (modalities ?? []).filter((x) => x.id !== m.id);
    });

  const usage = (n: number) => (n === 0 ? "Not used yet" : `In ${n} program${n === 1 ? "" : "s"}`);

  onMount(() => {
    run(async () => {
      [templates, modalities] = await Promise.all([api.cardioTemplates(), api.modalities()]);
    });
  });
</script>

<svelte:head><title>Cardio library · Program Tracker</title></svelte:head>

<PageHead
  title="Cardio library"
  sub="Templates to start a cardio session from, and the modalities your members train on. A session keeps its own copy, so editing here never changes a program or a log."
/>

{#if error}<div class="err"><Note tone="bad">{error}</Note></div>{/if}

<Tabs
  label="Cardio library"
  idPrefix="cl"
  value={tab}
  onchange={setTab}
  items={[
    { id: "templates", label: "Templates", count: templates ? String(templates.presets.filter((p) => !p.hidden).length + templates.templates.filter((t) => !t.archivedAt).length) : undefined },
    { id: "modalities", label: "Modalities", count: modalities ? String(modalities.filter((m) => !m.archivedAt).length) : undefined },
  ]}
/>

<div class="search"><InputSearch label={tab === "templates" ? "Search templates" : "Search modalities"} bind:value={query} /></div>

{#if tab === "templates"}
  <div role="tabpanel" id="panel-templates" aria-labelledby="cl-templates" class="stack">
    <Panel title="Built in" count={templates ? templates.presets.filter((p) => !p.hidden).length : undefined}>
      <p class="lock-note"><Icon name="lock" /> <span>Every trainer gets these six. Hide the ones you don't use; a hidden one leaves the editor's chips.</span></p>
      {#if !templates}
        <SkeletonRows rows={6} dense />
      {:else if presets.length === 0}
        <EmptyState>No built-in template matches “{query.trim()}”.</EmptyState>
      {:else}
        <ul class="rows">
          {#each presets as p (p.key)}
            <li class="row" class:muted={p.hidden}>
              <div class="main">
                <span class="name">{p.name}{#if p.hidden}{" "}<Pill>Hidden</Pill>{/if}</span>
                <span class="sub">{p.summary}</span>
              </div>
              <span class="fact">{templateSummary(p.prescription)}</span>
              <div class="acts">
                <Button small variant="ghost" onclick={() => setPresetHidden(p, !p.hidden)}>{p.hidden ? "Show" : "Hide"}</Button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Panel>

    <Panel title="Yours" count={own.length}>
      <p class="lock-note"><Icon name="bolt" /> <span>Save one from any cardio session with <b>Save as template</b> in the session editor.</span></p>
      {#if !templates}
        <SkeletonRows rows={2} dense />
      {:else if own.length === 0}
        <EmptyState>{q ? `No template of yours matches “${query.trim()}”.` : "None yet. Build a session you'll reuse, then save it as a template."}</EmptyState>
      {:else}
        <ul class="rows">
          {#each own as t (t.id)}
            <li class="row">
              <div class="main">
                <InputRename value={t.name} thing="template" size="row" onsave={(name) => renameTemplate(t, name)} />
                {#if t.basedOn}<span class="sub">From {templates.presets.find((p) => p.key === t.basedOn)?.name ?? "another template"}</span>{/if}
              </div>
              <span class="fact">{templateSummary(t.prescription)}</span>
              <div class="acts">
                <Button small variant="ghost" onclick={() => archiveTemplate(t, true)}>Archive</Button>
                <ConfirmButton label="Delete" confirmLabel="Delete {t.name}?" onconfirm={() => deleteTemplate(t)} small variant="ghost" class="danger" />
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Panel>

    {#if ownArchived.length}
      {@render archivedList(ownArchived.map((t) => ({ id: t.id, name: t.name, fact: templateSummary(t.prescription), restore: () => archiveTemplate(t, false) })))}
    {/if}
  </div>
{:else}
  <div role="tabpanel" id="panel-modalities" aria-labelledby="cl-modalities" class="stack">
    <Panel title="Presets" count={presetModalities.length}>
      <p class="lock-note"><Icon name="lock" /> <span>Fixed names and pace, so logs read the same everywhere. Archive the ones you don't use.</span></p>
      {#if !modalities}
        <SkeletonRows rows={8} dense />
      {:else if presetModalities.length === 0}
        <EmptyState>{q ? `No preset matches “${query.trim()}”.` : "Every preset is archived. Restore one below."}</EmptyState>
      {:else}
        <ul class="rows">
          {#each presetModalities as m (m.id)}
            <li class="row">
              <div class="main"><span class="name">{m.name}</span><span class="sub">{METRIC_LABEL[m.metric]}</span></div>
              <span class="fact">{usage(m.usedIn)}</span>
              <div class="acts"><Button small variant="ghost" onclick={() => archiveModality(m, true)}>Archive</Button></div>
            </li>
          {/each}
        </ul>
      {/if}
    </Panel>

    <Panel title="Yours" count={customModalities.length}>
      <form class="panel-body add" onsubmit={addModality} aria-label="Add a modality">
        <div class="new-name"><InputField label="Name" placeholder="Assault bike, Swimming…" bind:value={newName} maxlength={40} /></div>
        <div class="new-metric"><SelectDescribed label="How pace shows" options={metricOptions} bind:value={newMetric} /></div>
        <Button variant="primary" type="submit" disabled={adding || !newName.trim()}>{adding ? "Adding…" : "Add modality"}</Button>
      </form>
      <p class="added" role="status">{added ?? ""}</p>
      {#if !modalities}
        <SkeletonRows rows={2} dense />
      {:else if customModalities.length === 0}
        <EmptyState>{q ? `No modality of yours matches “${query.trim()}”.` : "None yet. Add one for anything the presets don't cover."}</EmptyState>
      {:else}
        <ul class="rows">
          {#each customModalities as m (m.id)}
            <li class="row custom" data-row={m.id}>
              <div class="main"><InputRename value={m.name} thing="modality" size="row" onsave={(name) => renameModality(m, name)} /></div>
              <span class="fact">{usage(m.usedIn)}</span>
              <div class="metric"><SelectCell label="How pace shows for {m.name}" options={metricCells} value={m.metric} onchange={(v) => setMetric(m, v)} /></div>
              <div class="acts">
                {#if m.usedIn === 0}
                  <ConfirmButton label="Delete" confirmLabel="Delete {m.name}?" onconfirm={() => deleteModality(m)} small variant="ghost" class="danger" />
                {:else}
                  <Button small variant="ghost" onclick={() => archiveModality(m, true)}>Archive</Button>
                {/if}
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </Panel>

    {#if archivedModalities.length}
      {@render archivedList(archivedModalities.map((m) => ({ id: m.id, name: m.name, fact: m.presetKey ? "Preset" : usage(m.usedIn), restore: () => archiveModality(m, false) })))}
    {/if}
  </div>
{/if}

{#snippet archivedList(items: { id: string; name: string; fact: string; restore: () => void }[])}
  <section class="archived" aria-label="Archived">
    <button class="toggle" type="button" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)}>
      <Icon name="chevron" />
      Archived <span class="mono">{items.length}</span>
    </button>
    {#if showArchived}
      <ul class="rows">
        {#each items as it (it.id)}
          <li class="row muted">
            <div class="main"><span class="name">{it.name}</span></div>
            <span class="fact">{it.fact}</span>
            <div class="acts"><Button small variant="ghost" onclick={it.restore}>Restore</Button></div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/snippet}

<LeaveGuard guard={guard.asker} />

<style>
  .err { margin-bottom: 12px; }
  .search { max-width: 360px; margin: 16px 0; }
  /* Phone: the full column, like every other phone field. */
  @media (max-width: 720px) { .search { max-width: none; } }
  .stack { display: grid; gap: 16px; }
  .lock-note { display: flex; align-items: baseline; gap: 6px; margin: 0; padding: 8px 16px; border-bottom: 1px solid var(--line-soft); font-size: 13px; color: var(--muted); }
  .lock-note :global(svg) { width: 13px; height: 13px; flex: none; }
  .added { margin: 0; padding: 0 16px; font-size: 13px; font-weight: 500; color: var(--good); }
  .added:not(:empty) { padding-block: 8px; border-bottom: 1px solid var(--line-soft); }
  .add { display: flex; gap: 8px 12px; align-items: flex-end; flex-wrap: wrap; border-bottom: 1px solid var(--line-soft); }
  .new-name { flex: 1; min-width: 200px; }
  .new-metric { flex: 0 1 260px; min-width: 220px; }
  .rows { list-style: none; margin: 0; padding: 0; }
  .row {
    display: grid;
    grid-template-columns: minmax(160px, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    min-height: 44px;
    padding: 6px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .row.custom { grid-template-columns: minmax(160px, 1fr) auto 150px auto; }
  .row:last-child { border-bottom: none; }
  .row:hover { background: var(--well); }
  .row.muted .name { color: var(--muted); }
  .main { display: grid; gap: 2px; min-width: 0; }
  .name { display: inline-flex; align-items: center; gap: 8px; font: 600 14px var(--font-ui); color: var(--ink); }
  .sub { font-size: 12px; color: var(--muted); }
  .fact { font: 400 12px var(--font-mono); color: var(--muted); white-space: nowrap; }
  .acts { display: flex; gap: 4px; justify-content: flex-end; min-width: 140px; }
  .archived { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .toggle { display: flex; align-items: center; gap: 6px; width: 100%; padding: 10px 16px; border: none; background: none; font: 500 13px var(--font-ui); color: var(--muted); cursor: pointer; }
  .toggle :global(svg) { width: 12px; height: 12px; transform: rotate(-90deg); transition: transform 120ms; }
  .toggle[aria-expanded="true"] :global(svg) { transform: none; }
  .mono { font-family: var(--font-mono); }
  .archived .rows { border-top: 1px solid var(--line-soft); }
  @media (max-width: 640px) {
    .row, .row.custom { grid-template-columns: 1fr auto; row-gap: 4px; }
    .fact { grid-column: 1; grid-row: 2; white-space: normal; }
    .metric { grid-column: 2; grid-row: 1; }
    .acts { min-width: 0; grid-column: 1 / -1; justify-content: flex-start; }
    /* Renaming: the field takes the whole first line; pace drops beside the usage. */
    .row:has(:global(.rn .edit)) .main { grid-column: 1 / -1; }
    .row:has(:global(.rn .edit)) .metric { grid-row: 2; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle :global(svg) { transition: none; }
  }
</style>
