<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { fmtDate } from "$lib/format";
  import type { InstructionTemplateDto } from "$lib/api/types";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";

  let templates = $state<InstructionTemplateDto[]>([]);
  let loaded = $state(false);

  let newName = $state("");
  let newContent = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);

  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editContent = $state("");
  let savingEdit = $state(false);

  async function load() {
    templates = await api.instructionTemplates();
    loaded = true;
  }

  async function create() {
    if (!newName.trim() || !newContent.trim()) return;
    saving = true;
    error = null;
    try {
      await api.createInstructionTemplate({ name: newName.trim(), content: newContent.trim() });
      newName = "";
      newContent = "";
      await load();
    } catch (e) {
      error = (e as Error).message;
    } finally {
      saving = false;
    }
  }

  function startEdit(t: InstructionTemplateDto) {
    editingId = t.id;
    editName = t.name;
    editContent = t.content;
  }

  async function saveEdit(id: string) {
    if (!editName.trim() || !editContent.trim()) return;
    savingEdit = true;
    try {
      await api.updateInstructionTemplate(id, { name: editName.trim(), content: editContent.trim() });
      editingId = null;
      await load();
    } finally {
      savingEdit = false;
    }
  }

  async function remove(id: string) {
    await api.deleteInstructionTemplate(id);
    if (editingId === id) editingId = null;
    await load();
  }

  onMount(load);
</script>

<svelte:head><title>Instruction templates · Program Tracker</title></svelte:head>

<PageHead
  title="Instruction templates"
  sub={`Standing rules the AI applies when drafting blocks. Reusable across every client.
      Use headings like Rules: Steps: Constraints: — they land in the prompt exactly as written.`}
>
</PageHead>

<div class="cols">
  <Panel title="New template">
    <form
      class="panel-body stack"
      onsubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <Field label="Name" htmlFor="t-name">
        <input class="input" id="t-name" placeholder="e.g. Deload policy" bind:value={newName} maxlength="80" />
      </Field>
      <Field label="Body" htmlFor="t-content">
        <textarea
          class="textarea"
          id="t-content"
          rows="8"
          placeholder={"Rules:\n- Cap main lifts at RPE 8.\n- Progress by 2.5 kg when all sets hit target reps."}
          bind:value={newContent}
          maxlength="4000"
        ></textarea>
      </Field>
      {#if error}<p class="err">{error}</p>{/if}
      <Button variant="primary" type="submit" disabled={saving || !newName.trim() || !newContent.trim()}>
        {saving ? "Saving…" : "Create template"}
      </Button>
    </form>
  </Panel>

  <Panel title="Library" count={templates.length}>
    {#if !loaded}
      <div class="panel-body"><Skeleton h="120px" /></div>
    {:else if templates.length === 0}
      <EmptyState>No templates yet — create one on the left.</EmptyState>
    {:else}
      <div class="list">
        {#each templates as t (t.id)}
          <div class="item">
            {#if editingId === t.id}
              <form
                class="stack"
                onsubmit={(e) => {
                  e.preventDefault();
                  saveEdit(t.id);
                }}
              >
                <input class="input" bind:value={editName} maxlength="80" aria-label="Template name" />
                <textarea class="textarea" rows="7" bind:value={editContent} maxlength="4000" aria-label="Template body"></textarea>
                <div class="row-actions">
                  <Button small type="submit" disabled={savingEdit}>Save</Button>
                  <Button variant="ghost" small type="button" onclick={() => (editingId = null)}>Cancel</Button>
                </div>
              </form>
            {:else}
              <div class="item-head">
                <strong>{t.name}</strong>
                <span class="subtle">{fmtDate(t.updatedAt)}</span>
              </div>
              <pre class="body">{t.content}</pre>
              <div class="row-actions">
                <Button variant="ghost" small onclick={() => startEdit(t)}>Edit</Button>
                <ConfirmButton label="Delete" confirmLabel="Really delete?" onconfirm={() => remove(t.id)} small />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </Panel>
</div>

<style>
  .cols { display: grid; grid-template-columns: 5fr 7fr; gap: 18px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 12px; }

  .list { display: flex; flex-direction: column; }
  .item { padding: 14px 18px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: none; }
  .item-head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; margin-bottom: 6px; }

  .body {
    margin: 0 0 8px;
    font: 12px/1.6 var(--font-mono);
    color: var(--muted);
    white-space: pre-wrap;
  }

  .row-actions { display: flex; gap: 8px; }

  @media (max-width: 980px) { .cols { grid-template-columns: 1fr; } }
</style>
