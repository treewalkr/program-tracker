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
    try {
      await api.updateExample(id, {
        goal: editGoal.trim(),
        level: editLevel,
        daysPerWeek: editDays,
        note: editNote.trim() || null,
      });
      editingId = null;
      await load();
    } finally {
      savingEdit = false;
    }
  }

  async function remove(id: string) {
    await api.deleteExample(id);
    if (editingId === id) editingId = null;
    if (reuseId === id) reuseId = null;
    await load();
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
  sub={`Gold-standard programs the AI reuses as few-shot examples — mark any program from its page.`}
>
</PageHead>

<div class="cols">
  <Panel title="Filters">
    <form
      class="panel-body stack"
      onsubmit={(e) => {
        e.preventDefault();
      }}
    >
      <Field label="Search" htmlFor="ex-q">
        <input class="input" id="ex-q" placeholder="search name, goal, note" bind:value={query} />
      </Field>
      <Field label="Level" htmlFor="ex-level">
        <select class="input" id="ex-level" bind:value={level}>
          <option value="">Any level</option>
          {#each EXAMPLE_LEVELS as l (l)}
            <option value={l}>{cap(l)}</option>
          {/each}
        </select>
      </Field>
      <Field label="Days per week" htmlFor="ex-days">
        <select class="input" id="ex-days" bind:value={days}>
          <option value="">Any days</option>
          {#each [1, 2, 3, 4, 5, 6, 7] as d (d)}
            <option value={d}>{d}</option>
          {/each}
        </select>
      </Field>
    </form>
  </Panel>

  <Panel title="Library" count={filtered.length}>
    {#if !loaded}
      <div class="panel-body"><Skeleton h="120px" /></div>
    {:else if examples.length === 0}
      <EmptyState>No examples yet — open a program and choose Mark as example.</EmptyState>
    {:else}
      <div class="list">
        {#each filtered as e (e.id)}
          <div class="item">
            {#if editingId === e.id}
              <form
                class="stack"
                onsubmit={(e2) => {
                  e2.preventDefault();
                  saveEdit(e.id);
                }}
              >
                <Field label="Goal" htmlFor={`eg-${e.id}`}>
                  <input class="input" id={`eg-${e.id}`} bind:value={editGoal} maxlength="120" aria-label="Goal" />
                </Field>
                <div class="edit-row">
                  <Field label="Level" htmlFor={`el-${e.id}`}>
                    <select class="input" id={`el-${e.id}`} bind:value={editLevel} aria-label="Level">
                      {#each EXAMPLE_LEVELS as l (l)}
                        <option value={l}>{cap(l)}</option>
                      {/each}
                    </select>
                  </Field>
                  <Field label="Days/week" htmlFor={`ed-${e.id}`}>
                    <input
                      class="input"
                      id={`ed-${e.id}`}
                      type="number"
                      min="1"
                      max="7"
                      bind:value={editDays}
                      aria-label="Days per week"
                    />
                  </Field>
                </div>
                <Field label="Note" htmlFor={`en-${e.id}`}>
                  <textarea
                    class="textarea"
                    id={`en-${e.id}`}
                    rows="2"
                    maxlength="500"
                    bind:value={editNote}
                    aria-label="Note"
                  ></textarea>
                </Field>
                <div class="row-actions">
                  <Button small type="submit" disabled={savingEdit || !editGoal.trim()}>Save</Button>
                  <Button variant="ghost" small type="button" onclick={() => (editingId = null)}>Cancel</Button>
                </div>
              </form>
            {:else}
              <div class="item-head">
                <a class="prog-link" href={`/programs/${e.programId}`}>{e.program.name}</a>
                <span class="subtle">{fmtDate(e.createdAt)}</span>
              </div>
              <div class="chips">
                <span class="chip">{e.goal}</span>
                <span class="chip">{cap(e.level)}</span>
                <span class="chip">{e.daysPerWeek} d/wk</span>
              </div>
              {#if e.note}<p class="note">{e.note}</p>{/if}

              {#if reuseId === e.id}
                <form
                  class="reuse-form"
                  onsubmit={(e2) => {
                    e2.preventDefault();
                    reuse(e);
                  }}
                >
                  <select class="input" bind:value={reuseClientId} aria-label="Client for the reused program">
                    {#each clients as c (c.id)}
                      <option value={c.id}>{c.name}</option>
                    {/each}
                  </select>
                  <Button variant="primary" small type="submit" disabled={reusing || !reuseClientId}>
                    {reusing ? "Creating…" : "Create draft"}
                  </Button>
                  <Button variant="ghost" small type="button" onclick={() => (reuseId = null)}>Cancel</Button>
                </form>
                {#if error}<p class="err">{error}</p>{/if}
              {:else}
                <div class="row-actions">
                  <Button variant="ghost" small onclick={() => startReuse(e)}>Use for client…</Button>
                  <Button variant="ghost" small onclick={() => startEdit(e)}>Edit</Button>
                  <ConfirmButton label="Remove" confirmLabel="Really remove?" onconfirm={() => remove(e.id)} small />
                </div>
              {/if}
            {/if}
          </div>
        {/each}
        {#if filtered.length === 0}
          <EmptyState>No examples match the current filters.</EmptyState>
        {/if}
      </div>
    {/if}
  </Panel>
</div>

<style>
  .cols { display: grid; grid-template-columns: 4fr 8fr; gap: 18px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 12px; }

  .list { display: flex; flex-direction: column; }
  .item { padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: none; }
  .item-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; }
  .prog-link { color: var(--text); font-weight: 600; text-decoration: none; }
  .prog-link:hover { text-decoration: underline; }

  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 4px; }
  .chip {
    font: 11px/1.4 var(--font-mono);
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 2px 8px;
  }

  .note { margin: 2px 0 8px; font-size: 13px; color: var(--muted); }
  .row-actions { display: flex; gap: 8px; }
  .edit-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

  .reuse-form { display: flex; gap: 8px; align-items: center; margin-top: 8px; flex-wrap: wrap; }
  .reuse-form .input { max-width: 240px; }

  .err { color: var(--danger, #c0392b); font-size: 13px; margin: 0; }

  @media (max-width: 980px) { .cols { grid-template-columns: 1fr; } }
</style>
