<script lang="ts">
  import { onMount, tick } from "svelte";
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
  import Pill from "$lib/ui/Pill.svelte";
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


  type Entry = {
    id: string;
    kind: "builtin" | "own";
    name: string;
    content: string;
    summary?: string;
    sources?: string[];
    updatedAt?: string;
    preset?: InstructionPreset;
    tpl?: InstructionTemplateDto;
  };
  /** Yours first, then the built-ins; one list, one reader. */
  const entries = $derived<Entry[]>([
    ...templates.map((t) => ({ id: t.id, kind: "own" as const, name: t.name, content: t.content, updatedAt: t.updatedAt, tpl: t })),
    ...INSTRUCTION_PRESETS.map((p) => ({
      id: `builtin:${p.key}`,
      kind: "builtin" as const,
      name: p.name,
      content: p.content,
      summary: p.summary,
      sources: p.sources,
      preset: p,
    })),
  ]);
  let q = $state("");
  const matches = (e: Entry) => {
    const n = q.trim().toLowerCase();
    return !n || `${e.name}\n${e.summary ?? ""}\n${e.content}`.toLowerCase().includes(n);
  };
  const railGroups = $derived([
    { label: "Yours", rows: entries.filter((e) => e.kind === "own" && matches(e)) },
    { label: "Built-in", rows: entries.filter((e) => e.kind === "builtin" && matches(e)) },
  ]);
  let selId = $state<string | null>(null);
  let composing = $state(false);
  const picked = $derived(entries.find((e) => e.id === selId) ?? entries[0] ?? null);

  /** An open edit that differs from what is saved. */
  const dirty = $derived.by(() => {
    const t = editingId ? templates.find((x) => x.id === editingId) : null;
    return !!t && (editName !== t.name || editContent !== t.content);
  });
  const leaveEdit = () => !dirty || confirm("Discard your unsaved changes to this template?");

  async function pick(id: string) {
    if (id !== editingId && !leaveEdit()) return;
    selId = id;
    composing = false;
    editingId = null;
    await tick();
    document.getElementById("rd-title")?.focus({ preventScroll: true });
  }
  function startNew() {
    if (!leaveEdit()) return;
    composing = true;
    editingId = null;
  }
  async function copyAndSelect(p: InstructionPreset) {
    await copyPreset(p);
    const mine = [...templates].reverse().find((t) => t.name === p.name);
    if (!listError && mine) pick(mine.id);
  }

  const ruleCount = (e: Entry) => parseRule(e.content).reduce((n, b) => n + b.items.length, 0);
  const rulesLabel = (e: Entry) => `${ruleCount(e)} ${ruleCount(e) === 1 ? "rule" : "rules"}`;
  const firstRule = (e: Entry) => parseRule(e.content)[0]?.items[0] ?? "";

  /** Reads a headed list for display only; the stored text is never changed. */
  function parseRule(content: string): { head: string | null; items: string[] }[] {
    const blocks: { head: string | null; items: string[] }[] = [];
    for (const raw of content.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (/^[^-].*:$/.test(line)) blocks.push({ head: line.slice(0, -1), items: [] });
      else {
        if (!blocks.length) blocks.push({ head: null, items: [] });
        blocks[blocks.length - 1].items.push(line.replace(/^- /, ""));
      }
    }
    return blocks;
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
  sub="Standing rules you switch on per draft, under Rules on a client's Generate page. Keep them true for any client; one client's injuries or equipment belong in that client's Limitations."
>
</PageHead>

<div class="lib">
  <aside class="rail">
  <div class="bar">
    <input class="input" type="search" placeholder="Search names and rules" bind:value={q} aria-label="Search names and rules" />
    <Button variant="primary" onclick={startNew}>New template</Button>
  </div>

  <div class="shelves">
    {#each railGroups as g (g.label)}
      <section class="shelf" aria-label={g.label}>
        <h2 class="shelf-h">{g.label} <span class="mono">{g.rows.length}</span></h2>
        {#if g.rows.length}
          <ul class="tiles">
            {#each g.rows as e (e.id)}
              <li>
                <button type="button" class="tile {e.kind}" class:on={!composing && picked?.id === e.id} aria-current={!composing && picked?.id === e.id ? "true" : undefined} title={e.name} onclick={() => pick(e.id)}>
                  <span class="tile-top">
                    <span class="tile-name">{e.name}</span>
                    <span class="tile-n">{rulesLabel(e)}</span>
                  </span>
                  <span class="tile-sub">{e.summary ?? firstRule(e)}</span>
                </button>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="shelf-none">{q.trim() ? "No match." : "Nothing of your own yet. Open a built-in and copy it, or press New template."}</p>
        {/if}
      </section>
    {/each}
  </div>
  </aside>

  <section class="reader" aria-label="Selected template">
    {#if composing}
      <header class="rd-head"><div><h2 id="rd-title" tabindex="-1">New template</h2><p class="rd-sum">Write it as a headed list. It lands in the prompt exactly as written.</p></div></header>
      <form
        class="stack rd-form"
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
            class="textarea mono-body"
            id="t-content"
            rows="10"
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
    {:else if !loaded}
      <SkeletonRows rows={4} />
    {:else if picked}
      {#if listError}<div class="rd-err"><Note tone="bad">{listError}</Note></div>{/if}
      {#if picked.kind === "own" && editingId === picked.id}
        <header class="rd-head"><div><h2 id="rd-title" tabindex="-1">Editing {picked.name}</h2></div></header>
        <form
          class="stack rd-form"
          onsubmit={(e) => {
            e.preventDefault();
            saveEdit(picked.id);
          }}
        >
          <Field label="Name" htmlFor="e-name">
            <input class="input" id="e-name" bind:value={editName} maxlength="80" />
          </Field>
          <Field label="Body" htmlFor="e-content">
            <textarea class="textarea mono-body" id="e-content" rows="12" bind:value={editContent} maxlength="4000"></textarea>
          </Field>
          <div class="row-actions">
            <Button variant="primary" type="submit" disabled={savingEdit || !editName.trim() || !editContent.trim()}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" type="button" onclick={() => (editingId = null)}>Cancel</Button>
            <span class="subtle mono rd-count">{editContent.length}/4000</span>
          </div>
        </form>
      {:else}
        <header class="rd-head">
          <div>
            <h2 id="rd-title" tabindex="-1">{picked.name}</h2>
            <p class="rd-sum">
              <Pill>{picked.kind === "builtin" ? "Built-in" : "Yours"}</Pill>
              {picked.summary ?? `Updated ${fmtDate(picked.updatedAt!)}`}
            </p>
          </div>
          <div class="rd-actions">
            {#if picked.kind === "builtin"}
              <Button variant="primary" onclick={() => copyAndSelect(picked.preset!)} disabled={copyingKey === picked.preset!.key}>
                {copyingKey === picked.preset!.key ? "Copying…" : "Copy to library"}
              </Button>
            {:else}
              <Button onclick={() => startEdit(picked.tpl!)}>Edit</Button>
              <ConfirmButton label="Delete" confirmLabel="Really delete?" onconfirm={() => remove(picked.id)} variant="ghost" class="danger" />
            {/if}
          </div>
        </header>
        <div class="rd-grid">
          <div class="rd-rules">
            {#each parseRule(picked.content) as b}
              <section class="rd-block">
                {#if b.head}<h3 class="rd-label">{b.head}</h3>{/if}
                <ul>
                  {#each b.items as it}<li>{it}</li>{/each}
                </ul>
              </section>
            {/each}
          </div>
          <aside class="rd-side">
            {#if picked.sources}
              <section>
                <h3 class="rd-label">Evidence</h3>
                <ul class="rd-srcs">
                  {#each picked.sources as src}<li>{src}</li>{/each}
                </ul>
              </section>
            {/if}
            <details class="rd-raw">
              <summary>Exact prompt text</summary>
              <pre class="body">{picked.content}</pre>
            </details>
          </aside>
        </div>
      {/if}
    {:else}
      <EmptyState>No templates yet. Press New template to write your first standing rule.</EmptyState>
    {/if}
  </section>
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
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .form-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

  .item-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 10px; }

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


  /* ---- library: sticky list rail + reader ---- */
  .lib { display: grid; grid-template-columns: 272px minmax(0, 1fr); gap: 28px; align-items: start; margin-top: 4px; }
  .rail { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 14px; max-height: calc(100vh - 24px); min-height: 0; }
  .bar { display: flex; flex-direction: column; gap: 8px; }
  .shelves { display: flex; flex-direction: column; gap: 18px; overflow-y: auto; min-height: 0; padding-right: 2px; }
  .shelf-h { display: flex; align-items: baseline; gap: 8px; margin: 0 0 6px; font-size: 13px; font-weight: 600; }
  .shelf-h .mono { font-weight: 400; font-size: 12px; color: var(--muted); }
  .shelf-none { margin: 0; font-size: 13px; color: var(--muted); }
  .tiles { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
  .tile {
    display: flex; flex-direction: column; gap: 3px; width: 100%; text-align: left;
    padding: 9px 11px 10px; border-radius: var(--radius); border: 1px solid var(--line); background: var(--well);
    color: var(--muted); font: inherit; cursor: pointer; min-width: 0;
  }
  .tile:hover { border-color: var(--ink); }
  .tile:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; box-shadow: 0 0 0 2px var(--surface); }
  .tile.on { border-color: var(--ink); box-shadow: inset 0 0 0 1px var(--ink); background: var(--surface); }
  .tile.on .tile-name { font-weight: 700; }
  .tile-top { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .tile-name { font: 600 13px/1.3 var(--font-ui); color: var(--ink); min-width: 0; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }
  .tile-n { margin-left: auto; font: 400 12px/1 var(--font-mono); white-space: nowrap; }
  .tile-sub { font: 400 12px/1.4 var(--font-ui); display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; }

  .reader { min-width: 0; }
  .reader :global(#rd-title:focus) { outline: none; }
  .rd-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
  .rd-head h2 { margin: 0 0 6px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.2; }
  .rd-sum { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0; color: var(--muted); max-width: var(--measure-prose); }
  .rd-actions { display: flex; gap: 8px; align-items: center; flex: none; }
  .rd-err { margin-bottom: 16px; }
  .rd-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 24px; align-items: start; }
  .rd-rules { display: flex; flex-direction: column; gap: 22px; padding: 22px 26px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
  .rd-label { margin: 0 0 8px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--muted); }
  .rd-block ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .rd-block li { position: relative; padding-left: 20px; font-size: 14px; line-height: 1.65; max-width: var(--measure-prose); }
  .rd-block li::before { content: ""; position: absolute; left: 4px; top: 0.72em; width: 6px; height: 6px; border-radius: 50%; background: var(--line-strong); }
  .rd-side { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  .rd-srcs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); }
  .rd-srcs li { padding-bottom: 6px; border-bottom: 1px solid var(--line-soft); }
  .rd-raw { margin: 0; }
  .rd-raw summary { cursor: pointer; font-size: 13px; color: var(--muted); margin-bottom: 8px; }
  .rd-raw summary:hover { color: var(--ink); }
  .rd-form { max-width: 720px; }
  .rd-count { margin-left: auto; }

  @media (max-width: 1060px) {
    .rd-grid { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 860px) {
    .lib { grid-template-columns: minmax(0, 1fr); }
    .rail { position: static; max-height: none; }
    .shelves { max-height: 260px; }
    .rd-head { flex-wrap: wrap; }
  }
</style>
