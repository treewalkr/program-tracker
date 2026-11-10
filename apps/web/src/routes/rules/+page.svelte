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
  import Field from "$lib/ui/Field.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import SkeletonRows from "$lib/ui/SkeletonRows.svelte";

  let rules = $state<CoachingRuleDto[]>([]);
  let clients = $state<ClientDto[]>([]);
  let loaded = $state(false);
  let listError = $state<string | null>(null);

  let newText = $state("");
  let newClientId = $state("");
  let newCategory = $state<CoachingRuleCategory>("style");
  let creating = $state(false);
  let createError = $state<string | null>(null);

  let editingId = $state<string | null>(null);
  let editText = $state("");
  let busyId = $state<string | null>(null);

  const proposed = $derived(rules.filter((r) => r.status === "proposed"));
  const active = $derived(rules.filter((r) => r.status === "active"));
  const retired = $derived(rules.filter((r) => r.status === "retired"));
  const clientName = (id: string | null) => (id ? (clients.find((c) => c.id === id)?.name ?? "Client") : null);

  /** Active rules grouped: all clients first, then one group per client (by name). */
  const groups = $derived.by(() => {
    const general = active.filter((r) => r.clientId === null);
    const byClient = new Map<string, CoachingRuleDto[]>();
    for (const r of active) if (r.clientId) byClient.set(r.clientId, [...(byClient.get(r.clientId) ?? []), r]);
    return [
      ...(general.length ? [{ key: "all", label: "All clients", rules: general }] : []),
      ...[...byClient.entries()]
        .map(([id, list]) => ({ key: id, label: list[0].clientName ?? clientName(id) ?? "Client", rules: list }))
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
      await api.createCoachingRule({ text: newText.trim(), category: newCategory, clientId: newClientId || null });
      newText = "";
      await load();
    } catch (e) {
      createError = (e as Error).message;
    } finally {
      creating = false;
    }
  }

  function startEdit(r: CoachingRuleDto) {
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
      <Field label="Rule" htmlFor="r-text">
        <textarea
          class="textarea"
          id="r-text"
          rows="3"
          maxlength="400"
          placeholder="Never program barbell back squats for this client. Use belt squats."
          bind:value={newText}
        ></textarea>
      </Field>
      <div class="two">
        <Field label="Applies to" htmlFor="r-client">
          <select class="select" id="r-client" bind:value={newClientId}>
            <option value="">All clients</option>
            {#each clients as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
          </select>
        </Field>
        <Field label="Kind" htmlFor="r-cat">
          <select class="select" id="r-cat" bind:value={newCategory}>
            {#each COACHING_RULE_CATEGORIES as c (c)}<option value={c}>{COACHING_RULE_CATEGORY_LABELS[c]}</option>{/each}
          </select>
        </Field>
      </div>
      {#if createError}<p class="err" role="alert">{createError}</p>{/if}
      <div class="form-foot">
        <Button variant="primary" type="submit" disabled={creating || newText.trim().length < 3}>{creating ? "Saving…" : "Add rule"}</Button>
        <span class="subtle mono">{newText.length}/400</span>
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
          No rules yet. Add a note on a draft or a reply and choose “This client” or “All clients”. The AI suggests a rule,
          and you keep it.
        </EmptyState>
      {:else}
        {#if listError}<div class="list-err"><Note tone="bad">{listError}</Note></div>{/if}
        {#each groups as g (g.key)}
          <section class="group" aria-label={g.label}>
            <h3 class="group-head">{g.label} <span class="subtle">{g.rules.length}</span></h3>
            <div class="list">
              {#each g.rules as r (r.id)}
                <div class="item">
                  {#if editingId === r.id}
                    <form
                      class="stack"
                      onsubmit={(e) => {
                        e.preventDefault();
                        void saveEdit(r);
                      }}
                    >
                      <textarea class="textarea" rows="2" maxlength="400" aria-label="Rule text" bind:value={editText}></textarea>
                      <div class="row-actions">
                        <Button small variant="primary" type="submit" disabled={busyId === r.id || editText.trim().length < 3}>Save</Button>
                        <Button small variant="ghost" type="button" onclick={() => (editingId = null)}>Cancel</Button>
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
                      <select
                        class="select scope"
                        aria-label="Applies to"
                        disabled={busyId === r.id}
                        onchange={(e) => {
                          const v = e.currentTarget.value;
                          void act(r.id, () => api.updateCoachingRule(r.id, { clientId: v || null }));
                        }}
                      >
                        <option value="" selected={r.clientId === null}>All clients</option>
                        {#each clients as c (c.id)}<option value={c.id} selected={r.clientId === c.id}>{c.name}</option>{/each}
                      </select>
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
                <span class="subtle">{r.clientName ?? "All clients"}</span>
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

<style>
  .cols { display: grid; grid-template-columns: minmax(300px, 5fr) 7fr; gap: 18px; align-items: start; }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .form-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
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
  .scope { width: auto; max-width: 200px; font-size: 12px; padding-block: 3px; }

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

  @media (max-width: 980px) { .cols { grid-template-columns: 1fr; } }
</style>
