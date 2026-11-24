<script lang="ts">
  import { onMount } from "svelte";
  import { groupSessionTypes, isPresetKey, presetParent, type SessionKind } from "@pt/shared";
  import { api } from "$lib/api";
  import type { SessionTypeDto } from "$lib/api/types";
  import { FORMAT_HINT, FORMAT_LABEL, searchSessionTypes } from "$lib/sessionTypeSearch";
  import Button from "$lib/ui/Button.svelte";
  import SelectCell from "$lib/ui/SelectCell.svelte";
  import SelectDescribed from "$lib/ui/SelectDescribed.svelte";
  import type { SelectOption } from "$lib/ui/select/options";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import InputField from "$lib/ui/InputField.svelte";
  import InputRename from "$lib/ui/InputRename.svelte";
  import InputSearch from "$lib/ui/InputSearch.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import SkeletonRows from "$lib/ui/SkeletonRows.svelte";
  import LeaveGuard from "$lib/ui/LeaveGuard.svelte";
  import { createLibraryGuard } from "$lib/libraryGuard.svelte";
  import { hasDraft } from "$lib/libraryDraft";
  import { revealRow } from "$lib/revealRow";

  let types = $state<SessionTypeDto[]>([]);
  let loaded = $state(false);
  let query = $state("");
  let error = $state<string | null>(null);

  let newName = $state("");
  let newFormat = $state<SessionKind>("exercises");
  let adding = $state(false);

  let editingId = $state<string | null>(null);
  let showArchived = $state(false);

  const isPreset = (t: SessionTypeDto) => isPresetKey(t.presetKey);
  const searching = $derived(query.trim() !== "");

  const live = $derived(types.filter((t) => !t.archivedAt));
  const archived = $derived(types.filter((t) => t.archivedAt));
  /** Presets as the taxonomy tree; custom types in list order. */
  const tree = $derived(groupSessionTypes(live));
  const livePresets = $derived(live.filter(isPreset));
  const presetHits = $derived(searchSessionTypes(livePresets, query));
  const customShown = $derived(searchSessionTypes(tree.custom, query));
  const archivedShown = $derived(searchSessionTypes(archived, query));

  /** Replace one row with the server's copy. */
  const put = (row: SessionTypeDto) => (types = types.map((t) => (t.id === row.id ? row : t)));

  async function run(fn: () => Promise<void>) {
    error = null;
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!newName.trim() || adding) return;
    adding = true;
    await run(async () => {
      const row = await api.createSessionType({ name: newName, format: newFormat });
      types = [...types, row];
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
  const guard = createLibraryGuard({ dirty: () => hasDraft(newName), what: () => `The new type “${newName.trim()}”` });

  const startRename = (t: SessionTypeDto) => (editingId = t.id);

  /** The rename box closes itself; it only calls here with a changed, non-empty name. */
  const saveRename = (t: SessionTypeDto, name: string) =>
    run(async () => void put(await api.patchSessionType(t.id, { name })));

  const setFormat = (t: SessionTypeDto, format: SessionKind) =>
    run(async () => void put(await api.patchSessionType(t.id, { format })));
  const setArchived = (t: SessionTypeDto, archived: boolean) =>
    run(async () => void put(await api.patchSessionType(t.id, { archived })));
  const remove = (t: SessionTypeDto) =>
    run(async () => {
      await api.deleteSessionType(t.id);
      types = types.filter((x) => x.id !== t.id);
    });

  /** The two formats a custom type can take. */
  const FORMATS: SessionKind[] = ["exercises", "cardio"];
  const formatOptions: SelectOption<SessionKind>[] = FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f], description: FORMAT_HINT[f] }));
  const cellOptions: SelectOption<SessionKind>[] = FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f] }));

  const usage = (n: number) => (n === 0 ? "Not used yet" : `In ${n} program${n === 1 ? "" : "s"}`);

  onMount(async () => {
    await run(async () => {
      types = await api.sessionTypes();
    });
    loaded = true;
  });
</script>

<svelte:head><title>Session types · Program Tracker</title></svelte:head>

<PageHead
  title="Session types"
  sub="Label each session with a main type, or a sub-type when you want to be specific. Programs keep the name they were saved with."
/>

{#if error}<div class="err"><Note tone="bad">{error}</Note></div>{/if}

<div class="search"><InputSearch label="Search types" bind:value={query} /></div>

{#snippet dot(format: SessionTypeDto["format"])}
  <span class="dot {format}" aria-hidden="true"></span>
{/snippet}

{#snippet pathName(t: SessionTypeDto)}
  {@const parent = presetParent(t.presetKey)}
  <span>{#if parent}<span class="path">{`${parent.name} › `}</span>{/if}{t.name}</span>
{/snippet}

{#snippet presetActs(t: SessionTypeDto)}
  <span class="use">{usage(t.usedIn)}</span>
  <div class="acts">
    <Button small variant="ghost" onclick={() => setArchived(t, true)} aria-label="Archive {t.name}">Archive</Button>
  </div>
{/snippet}

<Panel title="Presets" count={livePresets.length} class="types-panel">
  <p class="lock-note"><Icon name="lock" /> Fixed names, so every trainer's programs read the same. Archive the ones you don't use.</p>
  {#if !loaded}
    <SkeletonRows rows={6} dense />
  {:else if searching}
    {#if presetHits.length === 0}
      <EmptyState>No preset matches “{query.trim()}”.</EmptyState>
    {:else}
      <ul class="rows">
        {#each presetHits as t (t.id)}
          <li class="row preset">
            {@render dot(t.format)}
            <span class="name static">
              {@render pathName(t)}
            </span>
            {@render presetActs(t)}
          </li>
        {/each}
      </ul>
    {/if}
  {:else if tree.groups.length === 0}
    <EmptyState>Every preset is archived. Restore one below.</EmptyState>
  {:else}
    <ul class="tree" aria-label="Preset session types">
      {#each tree.groups as g (g.main.key)}
        <li class="branch">
          <div class="row main" class:muted={!g.row}>
            {@render dot(g.main.format)}
            <span class="name static">{g.main.name}</span>
            {#if g.row}
              {@render presetActs(g.row)}
            {:else}
              <span class="use">Archived</span>
              <div class="acts"></div>
            {/if}
          </div>
          {#if g.subs.length}
            <ul class="subs" aria-label="{g.main.name} sub-types">
              {#each g.subs as t (t.id)}
                <li class="row sub">
                  <span class="elbow" aria-hidden="true"></span>
                  <span class="name static">{t.name}</span>
                  {@render presetActs(t)}
                </li>
              {/each}
            </ul>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Panel>

<Panel title="Custom" count={tree.custom.length} class="types-panel">
  <form class="panel-body add" onsubmit={add} aria-label="Add a custom session type">
    <div class="new-name">
      <InputField label="Name" placeholder="New type, e.g. Hypertrophy" bind:value={newName} maxlength={40} />
    </div>
    <div class="new-format">
      <SelectDescribed label="What does this session record?" options={formatOptions} bind:value={newFormat} />
    </div>
    <Button variant="primary" type="submit" disabled={adding || !newName.trim()}>
      {adding ? "Adding…" : "Add type"}
    </Button>
  </form>
  <p class="added" role="status">{added ?? ""}</p>

  {#if !loaded}
    <SkeletonRows rows={2} dense />
  {:else if customShown.length === 0}
    <EmptyState>
      {searching ? `No custom type matches “${query.trim()}”.` : "None yet. Add one for anything the presets don't cover."}
    </EmptyState>
  {:else}
    <ul class="rows">
      {#each customShown as t (t.id)}
        <li class="row custom" data-row={t.id}>
          {@render dot(t.format)}
          {#if editingId === t.id}
            <div class="rename">
              <InputRename
                value={t.name}
                thing={t.name}
                size="row"
                maxlength={40}
                bind:editing={() => editingId === t.id, (on) => (editingId = on ? t.id : null)}
                onsave={(name) => saveRename(t, name)}
              />
            </div>
          {:else}
            <button class="name" type="button" onclick={() => startRename(t)} title="Rename">{t.name}</button>
            <span class="use">{usage(t.usedIn)}</span>
            <div class="fmt">
              <SelectCell label="What {t.name} records" options={cellOptions} value={t.format === "cardio" ? "cardio" : "exercises"} onchange={(f) => setFormat(t, f)} />
            </div>
            <div class="acts">
              <Button small variant="ghost" onclick={() => startRename(t)}>Rename</Button>
              {#if t.usedIn === 0}
                <ConfirmButton label="Delete" confirmLabel="Delete {t.name}?" onconfirm={() => remove(t)} small variant="ghost" class="danger" />
              {:else}
                <Button small variant="ghost" onclick={() => setArchived(t, true)}>Archive</Button>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Panel>

{#if archived.length > 0}
  <section class="archived" aria-label="Archived session types">
    <button class="toggle" type="button" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)}>
      <Icon name="chevron" />
      Archived <span class="mono">{archived.length}</span>
    </button>
    {#if showArchived}
      <ul class="rows">
        {#each archivedShown as t (t.id)}
          <li class="row muted">
            {@render dot(t.format)}
            <span class="name static">
              {@render pathName(t)}
              {#if isPreset(t)}<span class="fmt-label neutral">Preset</span>{/if}
            </span>
            <span class="use">{usage(t.usedIn)}</span>
            <div class="acts">
              <Button small variant="ghost" onclick={() => setArchived(t, false)}>Restore</Button>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<LeaveGuard guard={guard.asker} />

<style>
  .err { margin-bottom: 12px; }

  .search { max-width: 360px; margin-bottom: 16px; }
  @container main (max-width: 700px) { .search { max-width: none; } }

  :global(.types-panel) + :global(.types-panel) { margin-top: 16px; }

  .lock-note {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line-soft);
    font-size: 13px;
    color: var(--muted);
  }
  .lock-note :global(svg) { width: 13px; height: 13px; flex: none; }

  .added { margin: 0; padding: 0 16px; font-size: 13px; font-weight: 500; color: var(--good); }
  .added:not(:empty) { padding-block: 8px; border-bottom: 1px solid var(--line-soft); }
  .add { display: flex; gap: 8px 12px; align-items: flex-end; flex-wrap: wrap; border-bottom: 1px solid var(--line-soft); }
  .new-name { flex: 1; min-width: 200px; }
  .new-format { flex: 0 1 260px; min-width: 220px; }


  .rows, .tree, .subs { list-style: none; margin: 0; padding: 0; }
  .branch + .branch { border-top: 1px solid var(--line); }

  .row {
    display: grid;
    grid-template-columns: 12px minmax(120px, 1fr) auto auto;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 4px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .rows > .row:last-child, .subs > .row:last-child { border-bottom: none; }
  .row.custom { grid-template-columns: 12px minmax(120px, 1fr) auto 104px auto; }
  .row.main { min-height: 44px; }
  .row.main .name { font-weight: 600; }
  .row.main.muted .name { color: var(--muted); }

  /* Sub-types hang off a hairline guide under their main type's dot. */
  .subs { position: relative; }
  .subs::before {
    content: "";
    position: absolute;
    left: 21px;
    top: 0;
    bottom: 18px;
    border-left: 1px solid var(--line-strong);
  }
  .row.sub { grid-template-columns: 12px 18px minmax(120px, 1fr) auto auto; gap: 0 12px; min-height: 36px; border-bottom-color: transparent; }
  .row.sub .elbow { grid-column: 2; justify-self: start; width: 16px; margin-left: -19px; border-top: 1px solid var(--line-strong); }
  .row.sub .name { grid-column: 3; font-weight: 400; }
  .row.sub:hover, .row.main:hover, .row.custom:hover, .row.preset:hover { background: var(--well); }

  /* Format swatch: blue exercises, green cardio, split for "any" (fits either). */
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--blue); justify-self: center; }
  .dot.cardio { background: var(--good); }
  .dot.any { background: linear-gradient(90deg, var(--blue) 50%, var(--good) 50%); }
  .row.main .dot { width: 10px; height: 10px; }

  .name {
    justify-self: start;
    padding: 2px 0;
    border: none;
    background: none;
    font: 600 14px var(--font-ui);
    color: var(--ink);
    cursor: text;
    text-align: left;
  }
  .name:hover { text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
  .name.static { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; cursor: default; font-weight: 500; }
  .name.static:hover { text-decoration: none; }
  .path { color: var(--muted); font-weight: 400; }

  .fmt-label {
    padding: 0 7px;
    border: 1px solid var(--line);
    border-radius: 99px;
    font: 500 12px/18px var(--font-ui);
    color: var(--muted);
    background: var(--surface);
  }

  .use { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .fmt { width: 120px; }
  .acts { display: flex; gap: 4px; justify-content: flex-end; min-width: 150px; }
  .rename { grid-column: 2 / -1; max-width: 480px; }
  .row.muted .name, .row.muted .dot { opacity: 0.6; }

  .archived { margin-top: 16px; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
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
  .toggle .mono { font-family: var(--font-mono); }
  .archived .rows { border-top: 1px solid var(--line-soft); }

  @media (max-width: 640px) {
    .acts { min-width: 0; }
    .row, .row.custom { grid-template-columns: 12px 1fr auto; row-gap: 4px; }
    .row.sub { grid-template-columns: 12px 18px 1fr auto; }
    .use { grid-column: 2; grid-row: 2; }
    .row.sub .use { grid-column: 3; }
    .fmt { grid-column: 3; grid-row: 1; }
    .row.custom .acts { grid-column: 2 / -1; justify-content: flex-start; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle :global(svg) { transition: none; }
  }
</style>
