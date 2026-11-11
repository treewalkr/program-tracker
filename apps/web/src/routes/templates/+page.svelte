<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import { fmtDate } from "$lib/format";
  import { INSTRUCTION_PRESETS, type InstructionPreset } from "@pt/shared";
  import type { ClientDto, InstructionTemplateDto, PreferencesDto } from "$lib/api/types";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import SkeletonRows from "$lib/ui/SkeletonRows.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";

  let templates = $state<InstructionTemplateDto[]>([]);
  let loaded = $state(false);

  let prefs = $state<PreferencesDto[]>([]);
  let clients = $state<ClientDto[]>([]);
  let pickedClientId = $state("");
  let distilling = $state(false);
  let distillingClient = $state(false);
  let prefError = $state<string | null>(null);

  const trainerPref = $derived(prefs.find((p) => p.clientId === null) ?? null);
  const clientPrefs = $derived(prefs.filter((p) => p.clientId !== null));
  const pickedClient = $derived(clients.find((c) => c.id === pickedClientId) ?? null);

  let newName = $state("");
  let newContent = $state("");
  let saving = $state(false);
  let error = $state<string | null>(null);

  let editingId = $state<string | null>(null);
  let editName = $state("");
  let editContent = $state("");
  let savingEdit = $state(false);
  let listError = $state<string | null>(null);

  async function load() {
    templates = await api.instructionTemplates();
    loaded = true;
  }

  async function loadPrefs() {
    prefs = await api.preferences();
  }

  async function distill(clientId: string | null) {
    if (clientId === null) distilling = true;
    else distillingClient = true;
    prefError = null;
    try {
      await api.distillPreferences(clientId === null ? {} : { clientId });
      await loadPrefs();
    } catch (e) {
      prefError = (e as Error).message;
    } finally {
      distilling = false;
      distillingClient = false;
    }
  }

  async function removePref(id: string) {
    prefError = null;
    try {
      await api.deletePreference(id);
      await loadPrefs();
    } catch (e) {
      prefError = (e as Error).message;
    }
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
    listError = null;
    try {
      await api.updateInstructionTemplate(id, { name: editName.trim(), content: editContent.trim() });
      editingId = null;
      await load();
    } catch (e) {
      listError = (e as Error).message;
    } finally {
      savingEdit = false;
    }
  }

  let copyingKey = $state<string | null>(null);

  /** Built-ins are read-only; copying makes an editable one in the library. */
  async function copyPreset(p: InstructionPreset) {
    copyingKey = p.key;
    listError = null;
    try {
      await api.createInstructionTemplate({ name: p.name, content: p.content });
      await load();
    } catch (e) {
      listError = (e as Error).message;
    } finally {
      copyingKey = null;
    }
  }

  async function remove(id: string) {
    listError = null;
    try {
      await api.deleteInstructionTemplate(id);
      if (editingId === id) editingId = null;
      await load();
    } catch (e) {
      listError = (e as Error).message;
    }
  }

  onMount(async () => {
    await load();
    clients = await api.clients();
    await loadPrefs();
  });
</script>

<svelte:head><title>Instruction templates · Program Tracker</title></svelte:head>

<PageHead
  title="Instruction templates"
  sub="Reusable rules you switch on per draft, under Rules on a client's Generate page. Keep them true for any client — one client's equipment or injuries belong in that client's Limitations, which always apply. Write them as headed lists (Rules:, Steps:, Constraints:) — they land in the prompt exactly as written."
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
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <div class="form-foot">
        <Button variant="primary" type="submit" disabled={saving || !newName.trim() || !newContent.trim()}>
          {saving ? "Saving…" : "Create template"}
        </Button>
        <span class="subtle mono">{newContent.length}/4000</span>
      </div>
    </form>
  </Panel>

  <Panel title="Library" count={templates.length}>
    {#if !loaded}
      <SkeletonRows rows={3} />
    {:else if templates.length === 0}
      <EmptyState>No templates yet. Write your first standing rule in New template.</EmptyState>
    {:else}
      {#if listError}<div class="list-err"><Note tone="bad">{listError}</Note></div>{/if}
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
                <textarea class="textarea mono-body" rows="9" bind:value={editContent} maxlength="4000" aria-label="Template body"></textarea>
                <div class="row-actions">
                  <Button variant="primary" small type="submit" disabled={savingEdit || !editName.trim() || !editContent.trim()}>
                    {savingEdit ? "Saving…" : "Save"}
                  </Button>
                  <Button variant="ghost" small type="button" onclick={() => (editingId = null)}>Cancel</Button>
                </div>
              </form>
            {:else}
              <div class="item-head">
                <h3>{t.name}</h3>
                <span class="subtle">Updated {fmtDate(t.updatedAt)}</span>
              </div>
              <pre class="body">{t.content}</pre>
              <div class="row-actions">
                <Button small onclick={() => startEdit(t)}>Edit</Button>
                <ConfirmButton label="Delete" confirmLabel="Really delete?" onconfirm={() => remove(t.id)} small variant="ghost" class="danger" />
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </Panel>
</div>

<div class="prefs">
  <Panel title="Built-in" count={INSTRUCTION_PRESETS.length}>
    <div class="list">
      <p class="lede builtin-lede">
        Science-based starting rules, always available under Rules on the Generate page. They can't be edited —
        copy one to your library to make it yours.
      </p>
      {#each INSTRUCTION_PRESETS as p (p.key)}
        <div class="item">
          <div class="item-head">
            <h3>{p.name}</h3>
            <Button small onclick={() => copyPreset(p)} disabled={copyingKey === p.key}>
              {copyingKey === p.key ? "Copying…" : "Copy to library"}
            </Button>
          </div>
          <p class="summary">{p.summary}</p>
          <details>
            <summary>Read rules</summary>
            <pre class="body">{p.content}</pre>
          </details>
          <p class="subtle sources">{p.sources.join(" · ")}</p>
        </div>
      {/each}
    </div>
  </Panel>
</div>

<div class="prefs">
  <Panel title="Learned preferences" count={prefs.length}>
    <div class="panel-body">
      <p class="lede">
        Distilling reads your instructions, revision notes, reject reasons, and post-approval edits, and writes
        them up as one standing style document the AI follows.
      </p>

      <section class="pref-group" aria-labelledby="pref-trainer">
        <h3 id="pref-trainer">Trainer-wide style</h3>
        {#if trainerPref}
          <div class="pref-row">
            <div class="item-head">
              <span class="subtle">Updated {fmtDate(trainerPref.updatedAt)}</span>
              <span class="subtle mono">{trainerPref.providerId} · {trainerPref.model}</span>
            </div>
            <pre class="body">{trainerPref.document}</pre>
            <div class="row-actions">
              <Button small onclick={() => distill(null)} disabled={distilling}>
                {distilling ? "Distilling…" : "Re-distill"}
              </Button>
              <ConfirmButton label="Delete" confirmLabel="Really delete?" onconfirm={() => removePref(trainerPref!.id)} small variant="ghost" class="danger" />
            </div>
          </div>
        {:else}
          <div class="pref-empty">
            <p>Nothing distilled yet.</p>
            <Button variant="primary" small onclick={() => distill(null)} disabled={distilling}>
              {distilling ? "Distilling…" : "Distill trainer style"}
            </Button>
          </div>
        {/if}
      </section>

      <section class="pref-group" aria-labelledby="pref-clients">
        <h3 id="pref-clients">Per-client style</h3>
        {#each clientPrefs as cp (cp.id)}
          <div class="pref-row">
            <div class="item-head">
              <strong>{cp.clientName ?? "Client"}</strong>
              <span class="subtle"
                >Updated {fmtDate(cp.updatedAt)} · <span class="mono">{cp.providerId} · {cp.model}</span></span
              >
            </div>
            <pre class="body">{cp.document}</pre>
            <div class="row-actions">
              <Button small onclick={() => distill(cp.clientId!)} disabled={distillingClient}>
                {distillingClient ? "Distilling…" : "Re-distill"}
              </Button>
              <ConfirmButton label="Delete" confirmLabel="Really delete?" onconfirm={() => removePref(cp.id)} small variant="ghost" class="danger" />
            </div>
          </div>
        {/each}

        <div class="picker">
          <select class="select" bind:value={pickedClientId} aria-label="Client to distill for">
            <option value="" disabled>Choose a client…</option>
            {#each clients as c (c.id)}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
          <Button small onclick={() => pickedClient && distill(pickedClient.id)} disabled={!pickedClient || distillingClient}>
            {distillingClient ? "Distilling…" : "Distill for client"}
          </Button>
        </div>
      </section>

      {#if prefError}<Note tone="bad">{prefError}</Note>{/if}
    </div>
  </Panel>
</div>

<style>
  .cols { display: grid; grid-template-columns: minmax(300px, 5fr) 7fr; gap: 18px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .form-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

  .list { display: flex; flex-direction: column; }
  .list-err { padding: 12px 16px 0; }
  .item { padding: 16px; border-bottom: 1px solid var(--line); }
  .item:last-child { border-bottom: none; }
  .item-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; }
  .item-head h3 { font-size: 14px; }

  .body {
    margin: 0 0 12px;
    padding: 10px 12px;
    background: var(--well);
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    font: 12px/1.65 var(--font-mono);
    color: var(--ink);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .mono-body { font: 12px/1.65 var(--font-mono); }

  .builtin-lede { padding: 16px 16px 0; margin-bottom: 0; }
  .summary { margin: 0 0 8px; color: var(--muted); }
  details summary { cursor: pointer; font-size: 13px; margin-bottom: 8px; }
  .sources { margin: 0; }

  .row-actions { display: flex; gap: 8px; align-items: center; }

  .prefs { margin-top: 18px; }
  .lede { margin: 0 0 18px; color: var(--muted); max-width: var(--measure-prose); }
  .pref-group + .pref-group { margin-top: 20px; padding-top: 18px; border-top: 1px solid var(--line); }
  .pref-group h3 { margin-bottom: 10px; }
  .pref-row { padding: 0 0 14px; }
  .pref-row + .pref-row { padding-top: 14px; border-top: 1px dashed var(--line-soft); }
  .pref-empty {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px dashed var(--line);
    border-radius: var(--radius);
    color: var(--muted);
  }
  .pref-empty p { margin: 0; }
  .picker { display: flex; gap: 8px; align-items: center; }
  .picker .select { width: auto; min-width: 220px; max-width: 320px; }

  @media (max-width: 980px) { .cols { grid-template-columns: 1fr; } }
</style>
