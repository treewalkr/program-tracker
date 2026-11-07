<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import { fmtDate } from "$lib/format";
  import { toReuseInput } from "$lib/examples";
  import { EXAMPLE_LEVELS } from "@pt/shared";
  import type { ClientDto, ProgramExampleDto } from "$lib/api/types";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  let examples = $state<ProgramExampleDto[]>([]);
  let clients = $state<ClientDto[]>([]);
  let loaded = $state(false);

  let query = $state("");
  let level = $state<"" | (typeof EXAMPLE_LEVELS)[number]>("");
  let days = $state<"" | number>("");

  let editingId = $state<string | null>(null);
  let editGoal = $state("");
  let editLevel = $state<ProgramExampleDto["level"]>("intermediate");
  let editDays = $state(3);
  let editNote = $state("");
  let savingEdit = $state(false);

  let reuseId = $state<string | null>(null);
  let reuseClientId = $state("");
  let reusing = $state(false);
  let error = $state<string | null>(null);
  let listError = $state<string | null>(null);

  const filtering = $derived(level !== "" || days !== "" || query.trim() !== "");
  function clearFilters() {
    query = "";
    level = "";
    days = "";
  }

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const filtered = $derived(
    examples.filter((e) => {
      if (level && e.level !== level) return false;
      if (days !== "" && e.daysPerWeek !== days) return false;
      if (query.trim()) {
        const q = query.trim().toLowerCase();
        const hay = `${e.program.name} ${e.goal} ${e.note ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
  );

  async function load() {
    examples = await api.examples();
    loaded = true;
  }

  function startEdit(e: ProgramExampleDto) {
    editingId = e.id;
    editGoal = e.goal;
    editLevel = e.level;
    editDays = e.daysPerWeek;
    editNote = e.note ?? "";
  }

  async function saveEdit(id: string) {
    if (!editGoal.trim()) return;
    savingEdit = true;
    listError = null;
    try {
      await api.updateExample(id, {
        goal: editGoal.trim(),
        level: editLevel,
        daysPerWeek: editDays,
        note: editNote.trim() || null,
      });
      editingId = null;
      await load();
    } catch (err) {
      listError = (err as Error).message;
    } finally {
      savingEdit = false;
    }
  }

  async function remove(id: string) {
    listError = null;
    try {
      await api.deleteExample(id);
      if (editingId === id) editingId = null;
      if (reuseId === id) reuseId = null;
      await load();
    } catch (err) {
      listError = (err as Error).message;
    }
  }

  function startReuse(e: ProgramExampleDto) {
    reuseId = e.id;
    reuseClientId = clients[0]?.id ?? "";
    error = null;
  }

  async function reuse(e: ProgramExampleDto) {
    if (!reuseClientId) return;
    reusing = true;
    error = null;
    try {
      const created = await api.createProgram(toReuseInput(e, reuseClientId));
      await goto(`/programs/${created.id}`);
    } catch (err) {
      error = (err as Error).message;
    } finally {
      reusing = false;
    }
  }

  onMount(async () => {
    await load();
    clients = await api.clients();
  });
</script>

<svelte:head><title>Example library · Program Tracker</title></svelte:head>

<PageHead
  title="Example library"
  sub="Gold-standard programs the AI studies as worked examples when it drafts a new block. Mark any program as an example from its page."
>
</PageHead>

{#if !loaded}
  <div class="cols">
    <Panel title="Filters"><div class="panel-body"><Skeleton h="160px" /></div></Panel>
    <Panel title="Library"><div class="panel-body"><Skeleton h="120px" /></div></Panel>
  </div>
{:else if examples.length === 0}
  <Panel title="Library" class="empty-panel">
    <div class="onramp">
      <span class="onramp-icon" aria-hidden="true"><Icon name="star" size={20} /></span>
      <h2>No examples yet</h2>
      <p>
        When a program works well, open it and choose <strong>Mark as example</strong>. Its goal, level and
        weekly frequency let the AI pick the closest match when it drafts for a similar client.
      </p>
      <Button href="/clients">Browse client programs</Button>
    </div>
  </Panel>
{:else}
  <div class="cols">
    <Panel title="Filters">
      {#snippet act()}
        {#if filtering}
          <button type="button" class="clear" onclick={clearFilters}>Clear</button>
        {/if}
      {/snippet}
      <form
        class="panel-body stack"
        role="search"
        onsubmit={(e) => {
          e.preventDefault();
        }}
      >
        <Field label="Search" htmlFor="ex-q">
          <input class="input" id="ex-q" type="search" placeholder="Name, goal or note" bind:value={query} />
        </Field>
        <Field label="Level" htmlFor="ex-level">
          <select class="select" id="ex-level" bind:value={level}>
            <option value="">Any level</option>
            {#each EXAMPLE_LEVELS as l (l)}
              <option value={l}>{cap(l)}</option>
            {/each}
          </select>
        </Field>
        <Field label="Days per week" htmlFor="ex-days">
          <select class="select" id="ex-days" bind:value={days}>
            <option value="">Any frequency</option>
            {#each [1, 2, 3, 4, 5, 6, 7] as d (d)}
              <option value={d}>{d} {d === 1 ? "day" : "days"}</option>
            {/each}
          </select>
        </Field>
      </form>
    </Panel>

    <Panel title="Library" count={filtering ? `${filtered.length} of ${examples.length}` : examples.length}>
      {#if listError}<div class="list-err"><Note tone="bad">{listError}</Note></div>{/if}
      <div class="list">
        {#each filtered as e (e.id)}
          <article class="item">
            {#if editingId === e.id}
              <form
                class="stack"
                onsubmit={(e2) => {
                  e2.preventDefault();
                  saveEdit(e.id);
                }}
              >
                <Field label="Goal" htmlFor={`eg-${e.id}`}>
                  <input class="input" id={`eg-${e.id}`} bind:value={editGoal} maxlength="120" />
                </Field>
                <div class="edit-row">
                  <Field label="Level" htmlFor={`el-${e.id}`}>
                    <select class="select" id={`el-${e.id}`} bind:value={editLevel}>
                      {#each EXAMPLE_LEVELS as l (l)}
                        <option value={l}>{cap(l)}</option>
                      {/each}
                    </select>
                  </Field>
                  <Field label="Days per week" htmlFor={`ed-${e.id}`}>
                    <input class="input" id={`ed-${e.id}`} type="number" min="1" max="7" bind:value={editDays} />
                  </Field>
                </div>
                <Field label="Note" htmlFor={`en-${e.id}`}>
                  <textarea
                    class="textarea"
                    id={`en-${e.id}`}
                    rows="2"
                    maxlength="500"
                    placeholder="Why this program is worth copying"
                    bind:value={editNote}
                  ></textarea>
                </Field>
                <div class="row-actions">
                  <Button variant="primary" small type="submit" disabled={savingEdit || !editGoal.trim()}>
                    {savingEdit ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="ghost" small type="button" onclick={() => (editingId = null)}>Cancel</Button>
                </div>
              </form>
            {:else}
              <div class="item-head">
                <h3><a class="prog-link" href={`/programs/${e.programId}`}>{e.program.name}</a></h3>
                <span class="subtle">Added {fmtDate(e.createdAt)}</span>
              </div>
              <div class="facts">
                <span class="goal">{e.goal}</span>
                <Pill>{cap(e.level)}</Pill>
                <Pill>{e.daysPerWeek} {e.daysPerWeek === 1 ? "day" : "days"}/week</Pill>
              </div>
              {#if e.note}<p class="ex-note">{e.note}</p>{/if}

              {#if reuseId === e.id}
                <form
                  class="reuse-form"
                  onsubmit={(e2) => {
                    e2.preventDefault();
                    reuse(e);
                  }}
                >
                  <select class="select" bind:value={reuseClientId} aria-label="Client for the reused program">
                    {#each clients as c (c.id)}
                      <option value={c.id}>{c.name}</option>
                    {/each}
                  </select>
                  <Button variant="primary" small type="submit" disabled={reusing || !reuseClientId}>
                    {reusing ? "Creating…" : "Create draft"}
                  </Button>
                  <Button variant="ghost" small type="button" onclick={() => (reuseId = null)}>Cancel</Button>
                </form>
                <p class="subtle reuse-hint">Copies this program as a new draft for the client. Nothing is activated.</p>
                {#if error}<p class="err" role="alert">{error}</p>{/if}
              {:else}
                <div class="row-actions">
                  <Button small onclick={() => startReuse(e)} disabled={clients.length === 0}>Use for client…</Button>
                  <Button variant="ghost" small onclick={() => startEdit(e)}>Edit</Button>
                  <ConfirmButton label="Remove" confirmLabel="Really remove?" onconfirm={() => remove(e.id)} small variant="ghost" class="danger" />
                </div>
              {/if}
            {/if}
          </article>
        {/each}
        {#if filtered.length === 0}
          <EmptyState>
            No examples match these filters.
            {#snippet actions()}<Button small onclick={clearFilters}>Clear filters</Button>{/snippet}
          </EmptyState>
        {/if}
      </div>
    </Panel>
  </div>
{/if}

<style>
  .cols { display: grid; grid-template-columns: minmax(240px, 3fr) 9fr; gap: 18px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 14px; }

  .clear {
    margin-left: auto;
    appearance: none;
    background: none;
    border: 0;
    padding: 0;
    font: 400 12px/1 var(--font-ui);
    color: var(--blue);
    cursor: pointer;
  }
  .clear:hover { text-decoration: underline; }

  .list { display: flex; flex-direction: column; }
  .list-err { padding: 12px 16px 0; }
  .item { padding: 16px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: none; }
  .item-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .item-head h3 { font-size: 14px; }
  .prog-link { color: var(--ink); }
  .prog-link:hover { color: var(--blue); text-underline-offset: 3px; }

  .facts { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 10px; }
  .goal { color: var(--ink); margin-right: 4px; }
  .goal::first-letter { text-transform: uppercase; }

  .ex-note {
    margin: 0 0 12px;
    max-width: var(--measure-prose);
    color: var(--muted);
  }
  .row-actions { display: flex; gap: 8px; align-items: center; }
  .edit-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .reuse-form { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .reuse-form .select { width: auto; min-width: 200px; max-width: 260px; }
  .reuse-hint { margin: 6px 0 0; }

  :global(.empty-panel) { max-width: var(--measure-form); }
  .onramp { padding: 32px 24px 28px; text-align: center; }
  .onramp-icon {
    display: inline-grid;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 99px;
    background: var(--well);
    border: 1px solid var(--line);
    color: var(--muted);
    margin-bottom: 12px;
  }
  .onramp h2 { margin-bottom: 6px; }
  .onramp p { margin: 0 auto 16px; max-width: 52ch; color: var(--muted); }

  @media (max-width: 980px) { .cols { grid-template-columns: 1fr; } }
</style>
