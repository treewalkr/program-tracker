<script lang="ts">
  import { GLOSSARY_KINDS, GLOSSARY_KIND_LABELS, GLOSSARY_MEANING_MAX, type GlossaryKind, type ImportNewTerm } from "@pt/shared";
  import { api } from "$lib/api";
  import { newWordInput, newWordRows, shownNewWords, type NewWordRow } from "$lib/vocabulary";
  import Button from "$lib/ui/Button.svelte";
  import Counter from "$lib/ui/Counter.svelte";

  /**
   * "New words" in an import's review: shorthand and technique words the
   * read met that the trainer's glossary lacks. Add saves one to the
   * glossary (it applies from the next "Read it"); Dismiss hides it for this
   * import only. Mount it once per import (key it on the import id).
   */
  let { terms, onjump }: { terms: ImportNewTerm[] | undefined; onjump?: (line: number) => void } = $props();

  // seeded once per import; the component is keyed on the import id
  // svelte-ignore state_referenced_locally
  let rows = $state<NewWordRow[]>(newWordRows(terms));
  const shown = $derived(shownNewWords(rows));
  const open = $derived(rows.filter((r) => r.status === "open" || r.status === "saving").length);

  async function add(row: NewWordRow) {
    const input = newWordInput(row);
    if (!input || row.status !== "open") return;
    row.status = "saving";
    row.error = undefined;
    try {
      await api.createGlossaryTerm(input);
      row.status = "added";
    } catch (err) {
      row.status = "open";
      row.error = (err as Error).message;
    }
  }
</script>

{#if shown.length > 0}
  <section class="panel words" aria-labelledby="nw-title">
    <div class="panel-head">
      <h2 class="panel-title" id="nw-title">New words</h2>
      <Counter value={shown.length} />
      <span class="subtle fine head-note">Add the ones you use — imports read them from the next “Read it”.</span>
    </div>
    <ul class="rows">
      {#each shown as row (row.term)}
        <li class="row" class:added={row.status === "added"}>
          <span class="term">
            {row.term}
            {#if onjump}<button type="button" class="lref" aria-label="Show line {row.line} in your notes" onclick={() => onjump(row.line)}>L{row.line}</button>{/if}
          </span>
          {#if row.status === "added"}
            <span class="meaning-text">{row.meaning.trim()}</span>
            <span class="kind-text">{GLOSSARY_KIND_LABELS[row.kind]}</span>
            <span class="done" role="status">added</span>
          {:else}
            <label class="meaning">
              <span class="lbl">{row.suggested ? "suggested" : "meaning"}</span>
              <input
                class="input"
                bind:value={row.meaning}
                maxlength={GLOSSARY_MEANING_MAX}
                placeholder="What it means"
                aria-label="Meaning of {row.term}"
                disabled={row.status === "saving"}
              />
            </label>
            <select class="select kind" bind:value={row.kind} aria-label="Kind of {row.term}" disabled={row.status === "saving"}>
              {#each GLOSSARY_KINDS as k (k)}<option value={k as GlossaryKind}>{GLOSSARY_KIND_LABELS[k]}</option>{/each}
            </select>
            <div class="acts">
              <Button small variant="primary" onclick={() => add(row)} disabled={row.status === "saving" || !newWordInput(row)}>
                {row.status === "saving" ? "Adding…" : "Add"}
              </Button>
              <Button small variant="ghost" onclick={() => (row.status = "dismissed")} disabled={row.status === "saving"}>Dismiss</Button>
            </div>
            {#if row.error}<p class="err" role="alert">{row.error}</p>{/if}
          {/if}
        </li>
      {/each}
    </ul>
    {#if open === 0}<p class="subtle fine foot">All set. Manage them any time under Vocabulary → Glossary.</p>{/if}
  </section>
{/if}

<style>
  .words { margin-top: 16px; }
  .head-note { margin-left: 8px; }
  .fine { font-size: 12px; margin: 0; }
  .rows { list-style: none; margin: 0; padding: 0; }
  .row {
    display: grid;
    grid-template-columns: minmax(90px, 160px) minmax(180px, 1fr) 140px auto;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .row:last-child { border-bottom: none; }
  .term { display: flex; align-items: center; gap: 8px; font: 600 13px var(--font-mono); color: var(--ink); overflow-wrap: anywhere; }
  .lref {
    padding: 0 4px;
    border: none;
    border-radius: var(--radius);
    background: none;
    font: 500 11px var(--font-mono);
    color: var(--muted);
    cursor: pointer;
  }
  .lref:hover { color: var(--blue); background: var(--well); }
  .meaning { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .meaning .input { flex: 1; min-width: 0; }
  .lbl { font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); white-space: nowrap; }
  .kind { width: 140px; font-size: 13px; }
  .acts { display: flex; gap: 4px; justify-content: flex-end; }
  .meaning-text { font-size: 14px; color: var(--ink); }
  .kind-text { font-size: 12px; color: var(--muted); }
  .done { justify-self: end; font-size: 12px; font-weight: 600; color: var(--good); }
  .row.added .term { color: var(--muted); }
  .err { grid-column: 1 / -1; margin: 0; font-size: 12px; color: var(--bad); }
  .foot { padding: 8px 16px; border-top: 1px solid var(--line-soft); }

  @media (max-width: 640px) {
    .row { grid-template-columns: 1fr auto; row-gap: 6px; }
    .meaning { grid-column: 1 / -1; grid-row: 2; }
    .kind { grid-column: 1; grid-row: 3; }
    .acts { grid-column: 2; grid-row: 3; }
    .head-note { display: none; }
  }
</style>
