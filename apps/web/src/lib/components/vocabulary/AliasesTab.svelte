<script lang="ts">
  import { onMount } from "svelte";
  import { normalizeAlias } from "@pt/shared";
  import { api } from "$lib/api";
  import type { AliasDto, ExerciseDto, ExerciseInput } from "$lib/api/types";
  import { aliasOverride, overriddenAliases, personalAliasFor, searchAliases } from "$lib/vocabulary";
  import ExercisePicker from "../ExercisePicker.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  /**
   * Aliases: the names the trainer writes (as written → exercise). Their own
   * are saved by imports or added here and can be re-pointed or deleted;
   * global ones are read-only — Override makes a personal one to edit.
   */
  let list = $state<AliasDto[]>([]);
  let catalog = $state<ExerciseDto[]>([]);
  let loaded = $state(false);
  let query = $state("");
  let error = $state<string | null>(null);

  let newAlias = $state("");
  let newExerciseId = $state("");
  let adding = $state(false);
  let changingId = $state<string | null>(null);

  const shown = $derived(searchAliases(list, query));
  const overridden = $derived(overriddenAliases(list));
  const personalCount = $derived(list.filter((a) => a.scope === "personal").length);

  async function run(fn: () => Promise<void>) {
    error = null;
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  const reload = async () => void (list = await api.aliases());

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!normalizeAlias(newAlias) || !newExerciseId || adding) return;
    adding = true;
    await run(async () => {
      await api.saveAliases([{ alias: newAlias, exerciseId: newExerciseId, source: "manual" }]);
      await reload();
      newAlias = "";
      newExerciseId = "";
    });
    adding = false;
  }

  const repoint = (a: AliasDto, exerciseId: string) =>
    run(async () => {
      const updated = await api.patchAlias(a.id, exerciseId);
      list = list.map((x) => (x.id === a.id ? updated : x));
      changingId = null;
    });

  const remove = (a: AliasDto) =>
    run(async () => {
      await api.deleteAlias(a.id);
      list = list.filter((x) => x.id !== a.id);
    });

  /** A personal alias with the same words, opened for a change of exercise. */
  const override = (a: AliasDto) =>
    run(async () => {
      await api.saveAliases([aliasOverride(a)]);
      await reload();
      changingId = personalAliasFor(list, a.alias)?.id ?? null;
    });

  async function createExercise(input: ExerciseInput) {
    const created = await api.createExercise(input);
    catalog = [...catalog, created];
    return created;
  }

  onMount(async () => {
    await run(async () => {
      [list, catalog] = await Promise.all([api.aliases(), api.exercises()]);
    });
    loaded = true;
  });
</script>

{#if error}<div class="err"><Note tone="bad">{error}</Note></div>{/if}

<Panel title="Aliases" count={list.length}>
  <form class="panel-body add" onsubmit={add} aria-label="Add an alias">
    <input class="input written" placeholder="As you write it, e.g. SA Row" bind:value={newAlias} maxlength="200" aria-label="Alias as written" />
    <span class="arrow" aria-hidden="true">→</span>
    <div class="pick">
      <ExercisePicker value={newExerciseId} {catalog} label="Exercise for the new alias" onpick={(ex) => (newExerciseId = ex.id)} oncreate={createExercise} />
    </div>
    <Button variant="primary" type="submit" disabled={adding || !normalizeAlias(newAlias) || !newExerciseId}>
      {adding ? "Adding…" : "Add alias"}
    </Button>
  </form>

  <div class="search">
    <Icon name="search" />
    <input bind:value={query} type="search" placeholder="Search aliases or exercises" aria-label="Search aliases" autocomplete="off" />
  </div>

  {#if loaded && personalCount === 0 && !query.trim()}
    <p class="hint">
      None of your own yet. When you confirm or change a match while importing notes, that name is saved here, so the next import
      knows it. The global ones below are common gym names — override any that you use differently.
    </p>
  {/if}

  {#if !loaded}
    <div class="panel-body"><Skeleton h="160px" /></div>
  {:else if shown.length === 0}
    <EmptyState>
      {query.trim()
        ? `No alias matches “${query.trim()}”.`
        : "No aliases yet. They're saved automatically when you confirm matches during an import — or add one above."}
    </EmptyState>
  {:else}
    <ul class="rows">
      {#each shown as a (a.id)}
        {@const off = overridden.has(a.id)}
        <li class="row" class:muted={off}>
          <span class="written mono" title="As written (normalized)">{a.alias}</span>
          <span class="arrow" aria-hidden="true">→</span>
          {#if changingId === a.id}
            <div class="change">
              <ExercisePicker value={a.exerciseId} {catalog} label="Exercise for {a.alias}" onpick={(ex) => repoint(a, ex.id)} oncreate={createExercise} />
              <Button small variant="ghost" onclick={() => (changingId = null)}>Done</Button>
            </div>
          {:else}
            <span class="target">
              {a.exerciseName}
              {#if a.scope === "global"}<Pill>global</Pill>{/if}
              {#if off}<span class="subtle">yours is used instead</span>{/if}
            </span>
            <div class="acts">
              {#if a.scope === "personal"}
                <Button small variant="ghost" onclick={() => (changingId = a.id)}>Change</Button>
                <ConfirmButton label="Delete" confirmLabel="Delete “{a.alias}”?" onconfirm={() => remove(a)} small variant="ghost" class="danger" />
              {:else if !off}
                <Button small variant="ghost" onclick={() => override(a)} title="Make your own copy to point elsewhere">Override</Button>
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
  .mono { font-family: var(--font-mono); }

  .add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--line-soft); }
  .add .written { flex: 1 1 180px; min-width: 160px; }
  .add .pick { flex: 2 1 240px; min-width: 220px; }
  .arrow { color: var(--muted); }

  .search { display: flex; align-items: center; gap: 8px; padding: 0 16px; border-bottom: 1px solid var(--line-soft); color: var(--muted); }
  .search :global(svg) { width: 14px; height: 14px; flex: none; }
  .search input { flex: 1; border: none; outline: none; background: none; padding: 10px 0; font: 14px var(--font-ui); color: var(--ink); }
  .search:focus-within { color: var(--blue); }

  .hint { margin: 0; padding: 10px 16px; font-size: 13px; color: var(--muted); border-bottom: 1px solid var(--line-soft); background: var(--well); }

  .rows { list-style: none; margin: 0; padding: 0 0 6px; }
  .row {
    display: grid;
    grid-template-columns: minmax(120px, 0.8fr) 16px minmax(160px, 1.2fr) auto;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 4px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .row:last-child { border-bottom: none; }
  .written { font-size: 13px; color: var(--ink); overflow-wrap: anywhere; }
  .target { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font: 600 14px var(--font-ui); color: var(--ink); }
  .subtle { font-size: 12px; font-weight: 400; color: var(--muted); }
  .change { grid-column: 3 / -1; display: flex; gap: 8px; align-items: center; }
  .change > :global(:first-child) { flex: 1; max-width: 420px; }
  .acts { display: flex; gap: 4px; justify-content: flex-end; min-width: 150px; }
  .row.muted .written, .row.muted .target { opacity: 0.6; }

  @media (max-width: 640px) {
    .row { grid-template-columns: 1fr auto; row-gap: 2px; }
    .row .arrow { display: none; }
    .target { grid-column: 1; grid-row: 2; }
    .acts { grid-column: 2; grid-row: 1 / span 2; min-width: 0; }
    .change { grid-column: 1 / -1; }
  }
</style>
