<script lang="ts">
  import { onMount, tick } from "svelte";
  import type { SessionKind } from "@pt/shared";
  import { api } from "$lib/api";
  import type { SessionTypeDto } from "$lib/api/types";
  import { FORMAT_HINT, FORMAT_LABEL, groupByFormat, searchSessionTypes } from "$lib/sessionTypeSearch";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import SkeletonRows from "$lib/ui/SkeletonRows.svelte";

  let types = $state<SessionTypeDto[]>([]);
  let loaded = $state(false);
  let query = $state("");
  let error = $state<string | null>(null);

  let newName = $state("");
  let newFormat = $state<SessionKind>("lifting");
  let adding = $state(false);

  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editInput = $state<HTMLInputElement>();
  let showArchived = $state(false);

  const live = $derived(types.filter((t) => !t.archivedAt));
  const archived = $derived(types.filter((t) => t.archivedAt));
  const shown = $derived(searchSessionTypes(live, query));
  const groups = $derived(query.trim() ? [{ format: null, items: shown }] : groupByFormat(shown));
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
      types = [...types, await api.createSessionType({ name: newName, format: newFormat })];
      newName = "";
    });
    adding = false;
  }

  async function startRename(t: SessionTypeDto) {
    editingId = t.id;
    editName = t.name;
    await tick();
    editInput?.select();
  }

  async function saveRename(t: SessionTypeDto) {
    const name = editName.trim();
    if (!name || name === t.name) {
      editingId = null;
      return;
    }
    await run(async () => {
      put(await api.patchSessionType(t.id, { name }));
      editingId = null;
    });
  }

  const setFormat = (t: SessionTypeDto, format: SessionKind) =>
    run(async () => void put(await api.patchSessionType(t.id, { format })));
  const setArchived = (t: SessionTypeDto, archived: boolean) =>
    run(async () => void put(await api.patchSessionType(t.id, { archived })));
  const remove = (t: SessionTypeDto) =>
    run(async () => {
      await api.deleteSessionType(t.id);
      types = types.filter((x) => x.id !== t.id);
    });

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
  sub="The labels you pick for each session: Strength, Mobility, Intervals and so on. Each one is either lifting (exercises and sets) or cardio (time, zone and distance). Programs keep the name they were saved with."
/>

{#if error}<div class="err"><Note tone="bad">{error}</Note></div>{/if}

<Panel title="Types" count={live.length}>
  <form class="panel-body add" onsubmit={add} aria-label="Add a session type">
    <input class="input" placeholder="New type, e.g. Plyometrics" bind:value={newName} maxlength="40" aria-label="New type name" />
    <div class="seg" role="radiogroup" aria-label="Format">
      {#each ["lifting", "cardio"] as const as f (f)}
        <label class="seg-opt" class:on={newFormat === f}>
          <input type="radio" name="new-format" value={f} bind:group={newFormat} />
          {FORMAT_LABEL[f]}
        </label>
      {/each}
    </div>
    <Button variant="primary" type="submit" disabled={adding || !newName.trim()}>
      {adding ? "Adding…" : "Add type"}
    </Button>
  </form>

  <div class="search">
    <Icon name="search" />
    <input bind:value={query} type="search" placeholder="Search types" aria-label="Search types" autocomplete="off" />
  </div>

  {#if !loaded}
    <SkeletonRows rows={5} dense />
  {:else if shown.length === 0}
    <EmptyState>{query.trim() ? `No type matches “${query.trim()}”.` : "No types yet. Add your first one above."}</EmptyState>
  {:else}
    {#each groups as g (g.format ?? "all")}
      {#if g.format}<h3 class="group">{FORMAT_LABEL[g.format]} <span>{FORMAT_HINT[g.format]}</span></h3>{/if}
      <ul class="rows">
        {#each g.items as t (t.id)}
          <li class="row">
            <span class="dot" class:cardio={t.format === "cardio"} aria-hidden="true"></span>
            {#if editingId === t.id}
              <form class="rename" onsubmit={(e) => { e.preventDefault(); saveRename(t); }}>
                <input
                  bind:this={editInput}
                  bind:value={editName}
                  class="input"
                  maxlength="40"
                  aria-label="Rename {t.name}"
                  onkeydown={(e) => { if (e.key === "Escape") editingId = null; }}
                />
                <Button small variant="primary" type="submit">Save</Button>
                <Button small variant="ghost" type="button" onclick={() => (editingId = null)}>Cancel</Button>
              </form>
            {:else}
              <button class="name" type="button" onclick={() => startRename(t)} title="Rename">{t.name}</button>
              <span class="use">{usage(t.usedIn)}</span>
              <select
                class="select fmt"
                value={t.format}
                aria-label="{t.name} format"
                onchange={(e) => setFormat(t, e.currentTarget.value as SessionKind)}
              >
                <option value="lifting">Lifting</option>
                <option value="cardio">Cardio</option>
              </select>
              <div class="acts">
                <Button small variant="ghost" onclick={() => startRename(t)}>Rename</Button>
                {#if t.usedIn === 0 && types.length > 1}
                  <ConfirmButton label="Delete" confirmLabel="Delete {t.name}?" onconfirm={() => remove(t)} small variant="ghost" class="danger" />
                {:else}
                  <Button small variant="ghost" onclick={() => setArchived(t, true)}>Archive</Button>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/each}
  {/if}

  {#if archived.length > 0}
    <div class="archived">
      <button class="toggle" type="button" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)}>
        <Icon name="chevron" />
        Archived <span class="mono">{archived.length}</span>
      </button>
      {#if showArchived}
        <ul class="rows">
          {#each archivedShown as t (t.id)}
            <li class="row muted">
              <span class="dot" class:cardio={t.format === "cardio"} aria-hidden="true"></span>
              <span class="name static">{t.name}</span>
              <span class="use">{usage(t.usedIn)}</span>
              <span class="fmt-text">{FORMAT_LABEL[t.format]}</span>
              <div class="acts">
                <Button small variant="ghost" onclick={() => setArchived(t, false)}>Restore</Button>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</Panel>

<style>
  .err { margin-bottom: 12px; }

  .add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--line-soft); }
  .add .input { flex: 1; min-width: 200px; }

  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .seg-opt { position: relative; padding: 5px 12px; font-size: 13px; color: var(--muted); cursor: pointer; background: var(--well); }
  .seg-opt + .seg-opt { border-left: 1px solid var(--line); }
  .seg-opt.on { background: var(--surface); color: var(--ink); font-weight: 600; }
  .seg-opt input { position: absolute; opacity: 0; pointer-events: none; }
  .seg-opt:has(input:focus-visible) { outline: 2px solid var(--blue); outline-offset: -2px; }

  .search { display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid var(--line-soft); color: var(--muted); }
  .search :global(svg) { width: 14px; height: 14px; flex: none; }
  .search input { flex: 1; border: none; outline: none; background: none; padding: 10px 0; font: 14px var(--font-ui); color: var(--ink); }
  .search:focus-within { color: var(--blue); }

  .group {
    margin: 0;
    padding: 14px 16px 4px;
    font: 500 11px/1.2 var(--font-ui);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .group span { margin-left: 6px; text-transform: none; letter-spacing: 0; font-weight: 400; }

  .rows { list-style: none; margin: 0; padding: 0 0 6px; }
  .row {
    display: grid;
    grid-template-columns: 10px minmax(120px, 1fr) auto 104px auto;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 4px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .row:last-child { border-bottom: none; }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--blue); }
  .dot.cardio { background: var(--good); }
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
  .name.static { cursor: default; text-decoration: none; }
  .use { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .fmt { width: 104px; font-size: 13px; padding-top: 3px; padding-bottom: 3px; }
  .fmt-text { font-size: 13px; color: var(--muted); }
  .acts { display: flex; gap: 4px; justify-content: flex-end; min-width: 150px; }
  .rename { grid-column: 2 / -1; display: flex; gap: 8px; align-items: center; }
  .rename .input { flex: 1; max-width: 320px; }
  .row.muted .name, .row.muted .dot { opacity: 0.6; }

  .archived { border-top: 1px solid var(--line); }
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

  @media (max-width: 640px) {
    .row { grid-template-columns: 10px 1fr auto; row-gap: 4px; }
    .use { grid-column: 2; grid-row: 2; }
    .fmt, .fmt-text { grid-column: 3; grid-row: 1; }
    .acts { grid-column: 2 / -1; justify-content: flex-start; min-width: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle :global(svg) { transition: none; }
  }
</style>
