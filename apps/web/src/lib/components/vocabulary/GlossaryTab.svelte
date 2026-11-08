<script lang="ts">
  import { onMount, tick } from "svelte";
  import { GLOSSARY_KINDS, GLOSSARY_KIND_LABELS, GLOSSARY_MEANING_MAX, GLOSSARY_TERM_MAX, type GlossaryKind } from "@pt/shared";
  import { api } from "$lib/api";
  import type { GlossaryTermDto } from "$lib/api/types";
  import { searchGlossary, termOverride } from "$lib/vocabulary";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  /**
   * Glossary: shorthand, techniques and equipment words the trainer uses.
   * The import reads them in its prompt; abbreviations also expand exercise
   * names for matching. Global terms are read-only — Override makes a
   * personal copy (which hides the global one) to edit.
   */
  let list = $state<GlossaryTermDto[]>([]);
  let loaded = $state(false);
  let query = $state("");
  let error = $state<string | null>(null);

  let draft = $state({ term: "", meaning: "", kind: "abbreviation" as GlossaryKind });
  let adding = $state(false);

  let editingId = $state<string | null>(null);
  let edit = $state({ term: "", meaning: "", kind: "abbreviation" as GlossaryKind });
  let editInput = $state<HTMLInputElement>();

  const shown = $derived(searchGlossary(list, query));
  const personalCount = $derived(list.filter((g) => g.scope === "personal").length);

  async function run(fn: () => Promise<void>) {
    error = null;
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const reload = async () => void (list = await api.glossary());

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!draft.term.trim() || !draft.meaning.trim() || adding) return;
    adding = true;
    await run(async () => {
      await api.createGlossaryTerm({ ...draft });
      await reload();
      draft = { term: "", meaning: "", kind: draft.kind };
    });
    adding = false;
  }

  async function startEdit(g: GlossaryTermDto) {
    editingId = g.id;
    edit = { term: g.term, meaning: g.meaning, kind: g.kind };
    await tick();
    editInput?.focus();
  }

  const save = (g: GlossaryTermDto) =>
    run(async () => {
      const updated = await api.patchGlossaryTerm(g.id, { ...edit });
      list = list.map((x) => (x.id === g.id ? updated : x));
      editingId = null;
    });

  const remove = (g: GlossaryTermDto) =>
    run(async () => {
      await api.deleteGlossaryTerm(g.id);
      // the global term it overrode comes back
      await reload();
    });

  /** A personal copy that hides the global term, opened for editing. */
  const override = (g: GlossaryTermDto) =>
    run(async () => {
      const mine = await api.createGlossaryTerm(termOverride(g));
      await reload();
      await startEdit(mine);
    });

  onMount(async () => {
    await run(reload);
    loaded = true;
  });
</script>

{#snippet kindSelect(value: GlossaryKind, onchange: (k: GlossaryKind) => void, label: string)}
  <select class="select kind" {value} aria-label={label} onchange={(e) => onchange(e.currentTarget.value as GlossaryKind)}>
    {#each GLOSSARY_KINDS as k (k)}<option value={k}>{GLOSSARY_KIND_LABELS[k]}</option>{/each}
  </select>
{/snippet}

{#if error}<div class="err"><Note tone="bad">{error}</Note></div>{/if}

<Panel title="Glossary" count={list.length}>
  <form class="panel-body add" onsubmit={add} aria-label="Add a term">
    <input class="input term" placeholder="Term, e.g. LPD" bind:value={draft.term} maxlength={GLOSSARY_TERM_MAX} aria-label="Term" />
    <input class="input meaning" placeholder="What it means, e.g. lat pulldown" bind:value={draft.meaning} maxlength={GLOSSARY_MEANING_MAX} aria-label="Meaning" />
    {@render kindSelect(draft.kind, (k) => (draft.kind = k), "Kind")}
    <Button variant="primary" type="submit" disabled={adding || !draft.term.trim() || !draft.meaning.trim()}>
      {adding ? "Adding…" : "Add term"}
    </Button>
  </form>

  <div class="search">
    <Icon name="search" />
    <input bind:value={query} type="search" placeholder="Search terms, meanings or kinds" aria-label="Search the glossary" autocomplete="off" />
  </div>

  {#if loaded && personalCount === 0 && !query.trim()}
    <p class="hint">
      Imports read your notes with these words in mind, and abbreviations also expand exercise names when matching. Add your own
      shorthand here, or from “New words” when an import meets one it doesn't know.
    </p>
  {/if}

  {#if !loaded}
    <div class="panel-body"><Skeleton h="160px" /></div>
  {:else if shown.length === 0}
    <EmptyState>{query.trim() ? `No term matches “${query.trim()}”.` : "No terms yet. Add your first one above."}</EmptyState>
  {:else}
    <ul class="rows">
      {#each shown as g (g.id)}
        <li class="row">
          {#if editingId === g.id}
            <form class="edit" onsubmit={(e) => { e.preventDefault(); save(g); }} aria-label="Edit {g.term}">
              <input bind:this={editInput} bind:value={edit.term} class="input term" maxlength={GLOSSARY_TERM_MAX} aria-label="Term" />
              <input
                bind:value={edit.meaning}
                class="input meaning"
                maxlength={GLOSSARY_MEANING_MAX}
                aria-label="Meaning"
                onkeydown={(e) => { if (e.key === "Escape") editingId = null; }}
              />
              {@render kindSelect(edit.kind, (k) => (edit.kind = k), "Kind")}
              <Button small variant="primary" type="submit" disabled={!edit.term.trim() || !edit.meaning.trim()}>Save</Button>
              <Button small variant="ghost" type="button" onclick={() => (editingId = null)}>Cancel</Button>
            </form>
          {:else}
            <span class="term-text">{g.term}</span>
            <span class="meaning-text">{g.meaning}</span>
            <span class="kind-text">{GLOSSARY_KIND_LABELS[g.kind]}{#if g.scope === "global"} <Pill>global</Pill>{/if}</span>
            <div class="acts">
              {#if g.scope === "personal"}
                <Button small variant="ghost" onclick={() => startEdit(g)}>Edit</Button>
                <ConfirmButton label="Delete" confirmLabel="Delete “{g.term}”?" onconfirm={() => remove(g)} small variant="ghost" class="danger" />
              {:else}
                <Button small variant="ghost" onclick={() => override(g)} title="Make your own copy to edit">Override</Button>
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</Panel>

<style>
  .err { margin-bottom: 12px; }

  .add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--line-soft); }
  .term { flex: 0 1 140px; min-width: 100px; }
  .meaning { flex: 1 1 240px; min-width: 180px; }
  .kind { width: 136px; font-size: 13px; }

  .search { display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid var(--line-soft); color: var(--muted); }
  .search :global(svg) { width: 14px; height: 14px; flex: none; }
  .search input { flex: 1; border: none; outline: none; background: none; padding: 10px 0; font: 14px var(--font-ui); color: var(--ink); }
  .search:focus-within { color: var(--blue); }

  .hint { margin: 0; padding: 10px 16px; font-size: 13px; color: var(--muted); border-bottom: 1px solid var(--line-soft); background: var(--well); }

  .rows { list-style: none; margin: 0; padding: 0 0 6px; }
  .row {
    display: grid;
    grid-template-columns: minmax(80px, 140px) minmax(160px, 1fr) 150px auto;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 4px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .row:last-child { border-bottom: none; }
  .term-text { font: 600 13px var(--font-mono); color: var(--ink); overflow-wrap: anywhere; }
  .meaning-text { font-size: 14px; color: var(--ink); }
  .kind-text { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .acts { display: flex; gap: 4px; justify-content: flex-end; min-width: 150px; }
  .edit { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }

  @media (max-width: 640px) {
    .row { grid-template-columns: auto 1fr; row-gap: 2px; }
    .meaning-text { grid-column: 1 / -1; grid-row: 2; }
    .kind-text { grid-column: 1; grid-row: 3; }
    .acts { grid-column: 2; grid-row: 3; min-width: 0; }
  }
</style>
