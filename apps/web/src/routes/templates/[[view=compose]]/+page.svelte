<script lang="ts">
  import { onMount, tick } from "svelte";
  import { page } from "$app/state";
  import { afterNavigate, pushState, replaceState } from "$app/navigation";
  import { api } from "$lib/api";
  import { errorText } from "$lib/api/errors";
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
  import InputField from "$lib/ui/InputField.svelte";
  import InputNote from "$lib/ui/InputNote.svelte";
  import InputSearch from "$lib/ui/InputSearch.svelte";
  import SelectCombobox from "$lib/ui/SelectCombobox.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import LeaveGuard from "$lib/ui/LeaveGuard.svelte";
  import { createLeaveGuard } from "$lib/leaveGuard.svelte";

  /** Below this library width the list and the reader stop sitting side by side. */
  const NARROW = 760;

  let templates = $state<InstructionTemplateDto[]>([]);
  let loaded = $state(false);

  let prefs = $state<PreferencesDto[]>([]);
  let clients = $state<ClientDto[]>([]);
  let pickedClientId = $state("");
  let distilling = $state(false);
  let distillingClient = $state(false);
  let prefError = $state<string | null>(null);
  /** The API's 422 when a distill has nothing to learn from yet: an empty state, not a failure. */
  const NO_SIGNALS = /no feedback signals/i;
  let prefNothing = $state<string | null>(null);

  const trainerPref = $derived(prefs.find((p) => p.clientId === null) ?? null);
  const clientPrefs = $derived(prefs.filter((p) => p.clientId !== null));
  const clientOptions = $derived(clients.map((c) => ({ value: c.id, label: c.name })));
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
    prefNothing = null;
    try {
      await api.distillPreferences(clientId === null ? {} : { clientId });
      await loadPrefs();
    } catch (e) {
      if (NO_SIGNALS.test((e as Error).message)) {
        const name = clientId === null ? null : (clients.find((c) => c.id === clientId)?.name ?? "this client");
        prefNothing = name
          ? `Nothing to learn from for ${name} yet — notes, reject reasons and edits on their drafts feed this.`
          : "Nothing to learn from yet — notes, reject reasons and edits on your drafts feed this.";
      } else prefError = errorText(e);
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
      prefError = errorText(e);
    }
  }

  async function create() {
    if (!newName.trim() || !newContent.trim()) return;
    saving = true;
    error = null;
    try {
      const name = newName.trim();
      await api.createInstructionTemplate({ name, content: newContent.trim() });
      newName = "";
      newContent = "";
      await load();
      const mine = [...templates].reverse().find((t) => t.name === name);
      if (mine) await pick(mine.id);
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
  /* The composer has its own address, /templates/new: a shallow history entry
     when opened here, a real route when loaded or shared. */
  const composing = $derived(!!page.state.tplNew);
  const listPath = () => page.url.pathname.replace(/\/new\/?$/, "");
  const picked = $derived(entries.find((e) => e.id === selId) ?? entries[0] ?? null);

  /** An open edit that differs from what is saved. */
  const dirty = $derived.by(() => {
    const t = editingId ? templates.find((x) => x.id === editingId) : null;
    return !!t && (editName !== t.name || editContent !== t.content);
  });
  const editingName = () => templates.find((x) => x.id === editingId)?.name || "this template";
  const leaveGuard = createLeaveGuard({
    dirty: () => dirty,
    prompt: () => ({ title: "Leave without saving?", body: `Your changes to ${editingName()} haven't been saved. Leaving drops them.` }),
  });
  /** True when there's no unsaved edit, or the trainer agrees to drop it. */
  async function leaveEdit() {
    if (!dirty) return true;
    const a = await leaveGuard.ask({
      title: "Discard your changes?",
      body: `Your changes to ${editingName()} haven't been saved.`,
      confirmLabel: "Discard changes",
      cancelLabel: "Keep editing",
    });
    return a === "confirm";
  }

  /* Narrow (phone, iPad portrait): the list and the reader take turns. Opening
     one pushes a shallow history entry, so the back gesture returns to the list. */
  let libWidth = $state(0);
  const narrow = $derived(libWidth > 0 && libWidth < NARROW);
  const reading = $derived(narrow && !!page.state.tplOpen);
  let listScroll = 0;

  async function open() {
    if (!narrow) return;
    if (!page.state.tplOpen) {
      listScroll = window.scrollY;
      pushState("", { tplOpen: true });
    }
    await tick();
    window.scrollTo(0, 0);
  }
  async function backToList() {
    if (page.state.tplOpen) history.back();
  }
  let wasReading = false;
  $effect(() => {
    if (wasReading && !reading) tick().then(() => window.scrollTo(0, listScroll));
    wasReading = reading;
  });

  async function pick(id: string) {
    if (id !== editingId) {
      if (!(await leaveEdit())) return;
      editingId = null;
    }
    selId = id;
    if (page.state.tplNew) replaceState(listPath(), narrow ? { tplOpen: true } : {});
    await open();
    await tick();
    document.getElementById("rd-title")?.focus({ preventScroll: true });
  }
  async function startNew() {
    if (!(await leaveEdit())) return;
    editingId = null;
    if (!page.state.tplNew) {
      if (!page.state.tplOpen) listScroll = window.scrollY;
      const go = page.state.tplOpen ? replaceState : pushState;
      go(`${listPath()}/new`, { tplOpen: true, tplNew: true });
    }
    await tick();
    if (narrow) window.scrollTo(0, 0);
    await tick();
    document.getElementById("rd-title")?.focus({ preventScroll: true });
  }
  async function copyAndSelect(p: InstructionPreset) {
    await copyPreset(p);
    const mine = [...templates].reverse().find((t) => t.name === p.name);
    if (!listError && mine) await pick(mine.id);
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

  /* Loaded at /templates/new: put the list underneath, so Back lands on it.
     (Shallow routing waits for the router, which is ready by afterNavigate.) */
  afterNavigate(({ type }) => {
    if (type !== "enter" || page.params.view !== "new" || page.state.tplNew) return;
    const at = page.url.pathname;
    replaceState(listPath(), {});
    pushState(at, { tplOpen: true, tplNew: true });
  });

  onMount(async () => {
    await load();
    clients = await api.clients();
    await loadPrefs();
  });

  /** Fills the body with a built-in's rules to edit; asks before replacing your own writing. */
  async function startFrom(p: InstructionPreset) {
    const own = newContent.trim() && !INSTRUCTION_PRESETS.some((x) => x.content === newContent);
    if (own) {
      const a = await leaveGuard.ask({
        title: `Replace your rules with ${p.name}?`,
        body: "What you've written in Body so far will be replaced.",
        confirmLabel: "Replace",
        cancelLabel: "Keep mine",
      });
      if (a !== "confirm") return;
    }
    if (!newName.trim() || INSTRUCTION_PRESETS.some((x) => x.name === newName)) newName = p.name;
    newContent = p.content;
  }
</script>

<svelte:head><title>Instruction templates · Program Tracker</title></svelte:head>

{#if reading}
  <!-- Rides the menu toggle's line like a crumbs Back (and stands in for the layout's,
       which would leave the page): back to the list, not off it. -->
  <p class="crumbs compact tpl-back">
    <button type="button" class="back" onclick={backToList}><Icon name="chevron" size={16} /><span>Templates</span></button>
  </p>
{:else}
  <PageHead
    title="Instruction templates"
    sub="Standing rules you switch on per draft, under Rules on a client's Generate page. Keep them true for any client; one client's injuries or equipment belong in that client's Limitations."
  />
{/if}

<div class="lib-wrap" bind:clientWidth={libWidth}>
<div class="lib" class:reading>
  <aside class="rail" aria-label="Templates">
    <div class="bar">
      <div class="find"><InputSearch label="Search templates" bind:value={q} /></div>
      <Button variant="primary" onclick={startNew}>New template</Button>
    </div>

    <div class="shelves">
      {#each railGroups as g (g.label)}
        <Panel title={g.label} count={g.rows.length} aria-label={g.label}>
          {#if g.rows.length}
            <ul class="rows">
              {#each g.rows as e (e.id)}
                {@const on = !narrow && !composing && picked?.id === e.id}
                <li>
                  <button type="button" class="row" class:on aria-current={on ? "true" : undefined} onclick={() => pick(e.id)}>
                    <span class="row-main">
                      <span class="row-name">{e.name}</span>
                      <span class="row-sub">{e.summary ?? firstRule(e)}</span>
                    </span>
                    <span class="row-n">{rulesLabel(e)}</span>
                    <span class="go" aria-hidden="true"><Icon name="chevron" size={16} /></span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <p class="shelf-none">{q.trim() ? "No match." : "Nothing of your own yet. Open a built-in and copy it, or press New template."}</p>
          {/if}
        </Panel>
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
        <InputField label="Name" placeholder="e.g. Deload policy" bind:value={newName} maxlength={80} />
        <div class="start">
          <p class="start-lead">Start from</p>
          <div class="seeds" role="group" aria-label="Start from a built-in">
            {#each INSTRUCTION_PRESETS as p (p.key)}
              {@const n = parseRule(p.content).reduce((sum, b) => sum + b.items.length, 0)}
              <button type="button" class="seed" aria-pressed={newContent === p.content} onclick={() => startFrom(p)}>
                <span class="seed-name">{p.name}</span>
                <span class="seed-sum">{p.summary}</span>
                <span class="seed-n mono">{n} {n === 1 ? "rule" : "rules"}</span>
              </button>
            {/each}
          </div>
        </div>
        <InputNote
          label="Body"
          mono
          rows={10}
          maxRows={24}
          placeholder={"Rules:\n- Cap main lifts at RPE 8.\n- Progress by 2.5 kg when all sets hit target reps."}
          bind:value={newContent}
          maxlength={4000}
        />
        {#if error}<p class="err" role="alert">{error}</p>{/if}
        <div class="form-foot">
          <Button variant="primary" type="submit" disabled={saving || !newName.trim() || !newContent.trim()}>
            {saving ? "Saving…" : "Create template"}
          </Button>
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
          <InputField label="Name" bind:value={editName} maxlength={80} />
          <InputNote label="Body" mono rows={12} maxRows={24} bind:value={editContent} maxlength={4000} />
          <div class="row-actions">
            <Button variant="primary" type="submit" disabled={savingEdit || !editName.trim() || !editContent.trim()}>
              {savingEdit ? "Saving…" : "Save"}
            </Button>
            <Button variant="ghost" type="button" onclick={() => (editingId = null)}>Cancel</Button>
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
          <div class="pick">
            <SelectCombobox
              label="Client to distill for"
              placeholder="Choose a client…"
              options={clientOptions}
              bind:value={pickedClientId}
              emptyText="No clients match"
            />
          </div>
          <Button small onclick={() => pickedClient && distill(pickedClient.id)} disabled={!pickedClient || distillingClient}>
            {distillingClient ? "Distilling…" : "Distill for client"}
          </Button>
        </div>
      </section>

      {#if prefNothing}<p class="subtle" role="status">{prefNothing}</p>{/if}
      {#if prefError}<Note tone="bad">{prefError}</Note>{/if}
    </div>
  </Panel>
</div>
</div>

<LeaveGuard guard={leaveGuard} />

<style>
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .form-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

  .item-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; gap: 4px 12px; margin-bottom: 10px; }

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
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 1px dashed var(--line);
    border-radius: var(--radius);
    color: var(--muted);
  }
  .pref-empty p { margin: 0; }
  /* Wraps rather than pushing the card wide on a phone: the button drops under the select. */
  .picker { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .picker .pick { flex: 1 1 220px; min-width: 0; max-width: 320px; }


  /* ---- library: a sticky list rail beside the reader; on a narrow library
     (phone, iPad portrait, a squeezed landscape) they take turns ---- */
  .lib-wrap { container: lib / inline-size; }
  .lib { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 28px; align-items: start; margin-top: 4px; }
  .rail { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 12px; max-height: calc(100vh - 24px); min-height: 0; }
  .bar { display: flex; flex-wrap: wrap; gap: 8px; }
  .find { flex: 1 1 160px; min-width: 0; }
  .shelves { display: flex; flex-direction: column; gap: 12px; overflow-y: auto; min-height: 0; padding-bottom: 2px; }
  .shelf-none { margin: 0; padding: 12px 16px; font-size: 13px; color: var(--muted); }

  .rows { list-style: none; margin: 0; padding: 0; }
  .rows li + li { border-top: 1px solid var(--line-soft); }
  .row {
    display: flex; align-items: flex-start; gap: 10px; width: 100%; min-width: 0;
    padding: 10px 14px; border: 0; background: none; text-align: left;
    font: inherit; color: var(--ink); cursor: pointer;
  }
  .row:hover { background: var(--row-hover); }
  .row:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
  .row.on { background: var(--well-2); box-shadow: inset 0 0 0 1px var(--ink); }
  .rows li:last-child .row { border-radius: 0 0 calc(var(--radius) - 1px) calc(var(--radius) - 1px); }
  .row-main { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
  .row-name { font: 600 13px/1.35 var(--font-ui); overflow-wrap: anywhere; }
  .row-sub {
    font: 400 12px/1.45 var(--font-ui); color: var(--muted);
    display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden;
  }
  .row-n { flex: none; padding-top: 1px; font: 400 12px/1.35 var(--font-mono); font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; }
  .go { display: none; flex: none; align-self: center; color: var(--faint); transform: rotate(-90deg); }

  .reader { min-width: 0; }
  .reader :global(#rd-title:focus) { outline: none; }
  .rd-head { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; margin-bottom: 22px; }
  .rd-head > div:first-child { min-width: 0; flex: 1 1 280px; }
  .rd-head h2 { margin: 0 0 6px; font-size: 20px; font-weight: 600; letter-spacing: -0.02em; line-height: 1.25; text-wrap: balance; }
  .rd-sum { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin: 0; color: var(--muted); max-width: var(--measure-prose); }
  .rd-actions { display: flex; gap: 8px; align-items: center; flex: none; }
  .rd-err { margin-bottom: 16px; }
  .rd-grid { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: 24px; align-items: start; }
  .rd-rules { display: flex; flex-direction: column; gap: 22px; padding: 20px 24px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
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

  /* The page's own Back, styled as BackButton: a 28px line with a 44px target. */
  .tpl-back { margin: -2px 0 12px; line-height: 28px; }
  .tpl-back .back {
    position: relative; display: inline-flex; align-items: center; gap: 4px; height: 28px;
    margin-left: -6px; padding: 0 6px; border: 0; border-radius: 6px; background: none;
    font: 500 16px/1 var(--font-ui); color: var(--blue); cursor: pointer;
  }
  .tpl-back .back::before { content: ""; position: absolute; inset: -8px; }
  .tpl-back .back:hover { background: var(--well-2); }
  .tpl-back .back:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
  .tpl-back .back :global(svg) { transform: rotate(90deg); }

  @container lib (max-width: 1000px) {
    .rd-grid { grid-template-columns: minmax(0, 1fr); }
  }
  @container lib (max-width: 759px) {
    .lib { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .rail { position: static; max-height: none; gap: 16px; }
    .shelves { overflow: visible; gap: 16px; }
    .lib.reading .rail, .lib:not(.reading) .reader { display: none; }
    .lib.reading ~ .prefs { display: none; }
    .row { align-items: center; padding: 12px 12px 12px 16px; min-height: 56px; }
    .row-name { font-size: 14px; }
    .row-sub { font-size: 13px; }
    .go { display: block; }
    .rd-rules { padding: 16px; }
  }

  /* New template: start from a built-in, then edit. Cards scroll sideways. */
  .start { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .start-lead { margin: 0; font: 600 12px var(--font-ui); color: var(--ink); }
  .seeds { display: flex; gap: 8px; overflow-x: auto; scroll-snap-type: x proximity; padding-bottom: 4px; }
  .seed {
    flex: none; width: 196px; scroll-snap-align: start;
    display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
    padding: 10px 12px; text-align: left; cursor: pointer;
    background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius);
    font: 400 12px/1.4 var(--font-ui); color: var(--muted);
  }
  .seed:hover { border-color: var(--line-strong); }
  .seed:focus-visible { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
  .seed[aria-pressed="true"] { border-color: var(--hover-ink); box-shadow: inset 0 0 0 1px var(--hover-ink); }
  .seed-name { font: 600 13px/1.3 var(--font-ui); color: var(--ink); }
  .seed-sum { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .seed-n { margin-top: auto; padding-top: 2px; font-size: 11px; color: var(--faint); }
</style>
