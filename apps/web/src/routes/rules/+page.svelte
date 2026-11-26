<script lang="ts">
  import { onMount } from "svelte";
  import { COACHING_RULE_CATEGORIES, COACHING_RULE_CATEGORY_LABELS, type CoachingRuleCategory } from "@pt/shared";
  import { api } from "$lib/api";
  import { fmtDate } from "$lib/format";
  import type { ClientDto, CoachingRuleDto } from "$lib/api/types";
  import LearnedRule from "$lib/components/LearnedRule.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import InputNote from "$lib/ui/InputNote.svelte";
  import SelectCombobox from "$lib/ui/SelectCombobox.svelte";
  import SelectField from "$lib/ui/SelectField.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import SkeletonRows from "$lib/ui/SkeletonRows.svelte";
  import LeaveGuard from "$lib/ui/LeaveGuard.svelte";
  import { createLibraryGuard } from "$lib/libraryGuard.svelte";
  import { editChanged, hasDraft } from "$lib/libraryDraft";
  import { revealRow } from "$lib/revealRow";

  let rules = $state<CoachingRuleDto[]>([]);
  let clients = $state<ClientDto[]>([]);
  let loaded = $state(false);
  let listError = $state<string | null>(null);

  let newText = $state("");
  let newClientId = $state("");
  const scopeOptions = $derived([{ value: "", label: "All members" }, ...clients.map((c) => ({ value: c.id, label: c.name }))]);
  const CATEGORY_OPTIONS = COACHING_RULE_CATEGORIES.map((c) => ({ value: c, label: COACHING_RULE_CATEGORY_LABELS[c] }));
  let newCategory = $state<CoachingRuleCategory>("style");
  let creating = $state(false);
  let createError = $state<string | null>(null);

  let editingId = $state<string | null>(null);
  let editText = $state("");
  let busyId = $state<string | null>(null);

  const proposed = $derived(rules.filter((r) => r.status === "proposed"));
  const active = $derived(rules.filter((r) => r.status === "active"));
  const retired = $derived(rules.filter((r) => r.status === "retired"));
  const clientName = (id: string | null) => (id ? (clients.find((c) => c.id === id)?.name ?? "Member") : null);

  /** Active rules grouped: all clients first, then one group per client (by name). */
  const groups = $derived.by(() => {
    const general = active.filter((r) => r.clientId === null);
    const byClient = new Map<string, CoachingRuleDto[]>();
    for (const r of active) if (r.clientId) byClient.set(r.clientId, [...(byClient.get(r.clientId) ?? []), r]);
    return [
      ...(general.length ? [{ key: "all", label: "All members", rules: general }] : []),
      ...[...byClient.entries()]
        .map(([id, list]) => ({ key: id, label: list[0].clientName ?? clientName(id) ?? "Member", rules: list }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
  });

  async function load() {
    rules = await api.coachingRules();
    loaded = true;
  }

  async function act(id: string, fn: () => Promise<unknown>) {
    busyId = id;
    listError = null;
    try {
      await fn();
      await load();
    } catch (e) {
      listError = (e as Error).message;
    } finally {
      busyId = null;
    }
  }

  async function create() {
    if (newText.trim().length < 3) return;
    creating = true;
    createError = null;
    try {
      const made = await api.createCoachingRule({ text: newText.trim(), category: newCategory, clientId: newClientId || null });
      newText = "";
      await load();
      added = `Added to ${made.clientId ? (made.clientName ?? clientName(made.clientId) ?? "the member's rules") : "All members"}.`;
      void revealRow(made.id);
    } catch (e) {
      createError = (e as Error).message;
    } finally {
      creating = false;
    }
  }

  /** Set after a create, cleared when the form is typed in again. */
  let added = $state<string | null>(null);
  $effect(() => {
    if (newText) added = null;
  });

  const drafting = $derived(hasDraft(newText));
  const editDirty = $derived(editChanged({ text: editText }, editingId ? rules.find((r) => r.id === editingId) : null));
  const guard = createLibraryGuard({
    dirty: () => drafting || editDirty,
    what: () => (editDirty ? "Your edit to a rule" : "Your new rule"),
  });
  /** Dropping an open edit (Cancel, or Edit on another rule) asks first when it changed. */
  async function closeEdit() {
    if (!editDirty || (await guard.discard())) editingId = null;
    return editingId === null;
  }

  async function startEdit(r: CoachingRuleDto) {
    if (!(await closeEdit())) return;
    editingId = r.id;
    editText = r.text;
  }

  const saveEdit = (r: CoachingRuleDto) =>
    act(r.id, async () => {
      await api.updateCoachingRule(r.id, { text: editText.trim() });
      editingId = null;
    });

  onMount(async () => {
    const [, cs] = await Promise.all([load(), api.clients()]);
    clients = cs;
  });
</script>

<svelte:head><title>Coaching rules · Program Tracker</title></svelte:head>

<PageHead
  title="Coaching rules"
  sub="Rules every AI draft and chat reply must follow. They come from your notes on drafts and replies, or you write them here. A learned rule does nothing until you keep it."
/>

<div class="cols">
  <Panel title="New rule">
    <form
      class="panel-body stack"
      onsubmit={(e) => {
        e.preventDefault();
        void create();
      }}
    >
      <InputNote
        label="Rule"
        rows={3}
        maxlength={400}
        placeholder="Never program barbell back squats for this member. Use belt squats."
        bind:value={newText}
      />
      <div class="two">
        <div class="f">
          <span class="lbl" aria-hidden="true">Applies to</span>
          <SelectCombobox label="Applies to" placeholder="Choose a member…" options={scopeOptions} bind:value={newClientId} emptyText="No members match" />
        </div>
        <SelectField label="Kind" maxWidth="none" options={CATEGORY_OPTIONS} bind:value={newCategory} />
      </div>
      {#if createError}<p class="err" role="alert">{createError}</p>{/if}
      <div class="form-foot">
        <Button variant="primary" type="submit" disabled={creating || newText.trim().length < 3}>{creating ? "Saving…" : "Add rule"}</Button>
        <p class="added" role="status">{added ?? ""}</p>
      </div>
    </form>
  </Panel>

  <div class="stack">
    {#if proposed.length > 0}
      <Panel title="Waiting for you" count={proposed.length}>
        <div class="list">
          {#each proposed as r (r.id)}
            <div class="item">
              {@render origin(r)}
              <LearnedRule rule={r} clientId={r.clientId} clientName={r.clientName} onchange={() => void load()} />
            </div>
          {/each}
        </div>
      </Panel>
    {/if}

    <Panel title="Active" count={active.length}>
      {#if !loaded}
        <SkeletonRows rows={3} />
      {:else if active.length === 0}
        <EmptyState>
          No rules yet. Add a note on a draft or a reply and choose “This member” or “All members”. The AI suggests a rule,
          and you keep it.
        </EmptyState>
      {:else}
        {#if listError}<div class="list-err"><Note tone="bad">{listError}</Note></div>{/if}
        {#each groups as g (g.key)}
          <section class="group" aria-label={g.label}>
            <h3 class="group-head">{g.label} <span class="subtle">{g.rules.length}</span></h3>
            <div class="list">
              {#each g.rules as r (r.id)}
                <div class="item" data-row={r.id}>
                  {#if editingId === r.id}
                    <form
                      class="stack"
                      onsubmit={(e) => {
                        e.preventDefault();
                        void saveEdit(r);
                      }}
                    >
                      <InputNote label="Rule text" hideLabel rows={2} maxlength={400} bind:value={editText} />
                      <div class="row-actions">
                        <Button small variant="primary" type="submit" disabled={busyId === r.id || editText.trim().length < 3}>Save</Button>
                        <Button small variant="ghost" type="button" onclick={closeEdit}>Cancel</Button>
                      </div>
                    </form>
                  {:else}
                    <p class="text">{r.text}</p>
                    <div class="meta">
                      <Pill>{COACHING_RULE_CATEGORY_LABELS[r.category]}</Pill>
                      <span class="mono" title="Prompts that carried this rule">used {r.appliedCount}×</span>
                      {#if r.violatedCount > 0}
                        <span class="mono broken" title="Notes that said this rule was broken">broken {r.violatedCount}×</span>
                      {/if}
                      <span class="subtle">{r.source === "manual" ? "written by you" : r.source === "chat" ? "from chat" : "from a note"} · {fmtDate(r.createdAt)}</span>
                    </div>
                    {@render origin(r)}
                    <div class="row-actions">
                      <Button small onclick={() => startEdit(r)}>Edit</Button>
                      <div class="scope">
                        <SelectCombobox
                          label="Applies to"
                          options={scopeOptions}
                          value={r.clientId ?? ""}
                          disabled={busyId === r.id}
                          emptyText="No members match"
                          onchange={(v) => void act(r.id, () => api.updateCoachingRule(r.id, { clientId: v || null }))}
                        />
                      </div>
                      <Button small variant="ghost" disabled={busyId === r.id} onclick={() => act(r.id, () => api.updateCoachingRule(r.id, { status: "retired" }))}>Retire</Button>
                      <ConfirmButton label="Delete" confirmLabel="Really delete?" onconfirm={() => act(r.id, () => api.deleteCoachingRule(r.id))} small variant="ghost" class="danger" />
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </Panel>

    {#if retired.length > 0}
      <details class="retired panel">
        <summary class="panel-head"><h2>Retired</h2> <span class="subtle">{retired.length} · never sent to the AI</span></summary>
        <div class="list">
          {#each retired as r (r.id)}
            <div class="item">
              <p class="text dim">{r.text}</p>
              <div class="row-actions">
                <span class="subtle">{r.clientName ?? "All members"}</span>
                <Button small disabled={busyId === r.id} onclick={() => act(r.id, () => api.updateCoachingRule(r.id, { status: "active" }))}>Use again</Button>
                <ConfirmButton label="Delete" confirmLabel="Really delete?" onconfirm={() => act(r.id, () => api.deleteCoachingRule(r.id))} small variant="ghost" class="danger" />
              </div>
            </div>
          {/each}
        </div>
      </details>
    {/if}
  </div>
</div>

{#snippet origin(r: CoachingRuleDto)}
  {#if r.sources?.length}
    <details class="origin">
      <summary>{r.sources.length === 1 ? "Learned from 1 note" : `Learned from ${r.sources.length} notes`}</summary>
      <ul>
        {#each r.sources as s (s.id)}
          <li>
            <span class="on">{s.anchorText}</span>
            {#if s.comment}<span>“{s.comment}”</span>{/if}
            {#if s.correction}<span class="instead">→ {s.correction}</span>{/if}
          </li>
        {/each}
      </ul>
    </details>
  {/if}
{/snippet}

<LeaveGuard guard={guard.asker} />

<style>
  .cols { display: grid; grid-template-columns: minmax(300px, 5fr) 7fr; gap: 18px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-foot { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
  .added { margin: 0; font-size: 13px; font-weight: 500; color: var(--good); }
  .err { margin: 0; font-size: 13px; font-weight: 500; color: var(--bad); }

  .list { display: flex; flex-direction: column; }
  .list-err { padding: 12px 16px 0; }
  .item { display: grid; gap: 8px; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); }
  .item:last-child { border-bottom: none; }
  .group + .group { border-top: 1px solid var(--line); }
  .group-head { margin: 0; padding: 12px 16px 0; font-size: 13px; }
  .group-head .subtle { font-weight: 400; margin-left: 4px; }

  .text { margin: 0; font-size: 14px; line-height: 1.5; overflow-wrap: anywhere; }
  .text.dim { color: var(--muted); }
  .meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; font-size: 12px; color: var(--muted); }
  .mono { font: 500 12px/1 var(--font-mono); font-variant-numeric: tabular-nums; }
  .broken { color: var(--bad); }
  .row-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .scope { width: 200px; max-width: 100%; }
  .f { display: grid; grid-template-columns: minmax(0, 1fr); gap: 4px; min-width: 0; }
  .lbl { font: 500 12px var(--font-ui); color: var(--ink); }

  .origin { font-size: 12px; color: var(--muted); }
  .origin summary { cursor: pointer; width: fit-content; }
  .origin ul { margin: 6px 0 0; padding-left: 16px; display: grid; gap: 4px; }
  .origin li span + span { margin-left: 6px; }
  .on { color: var(--ink); }
  .instead { color: var(--good); font-weight: 500; }

  .retired { margin: 0; }
  .retired summary { cursor: pointer; list-style: none; display: flex; gap: 8px; align-items: baseline; }
  .retired summary::-webkit-details-marker { display: none; }
  .retired:not([open]) summary { border-bottom: none; }

  @media (max-width: 980px) { .cols { grid-template-columns: minmax(0, 1fr); } }
</style>
