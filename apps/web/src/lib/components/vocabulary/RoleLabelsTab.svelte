<script lang="ts">
  import { onMount, tick } from "svelte";
  import { ROLE_LABEL_CHIP_MAX, ROLE_LABEL_DESCRIPTION_MAX, ROLE_LABEL_NAME_MAX, type RoleLabel } from "@pt/shared";
  import { roleLabels } from "$lib/roleLabelStore.svelte";
  import { labelBefore, labelsInOrder, rankToMove } from "$lib/vocabulary";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";

  /**
   * Role labels: the six built-ins and the trainer's own, in rank order (the
   * order sessions are sorted in). Built-ins keep their name; their chip,
   * meaning and position can change. Own labels are archived, never deleted —
   * programs still show them — and come back with Restore.
   */
  const ordered = $derived(labelsInOrder(roleLabels.all));
  let error = $state<string | null>(null);
  let showArchived = $state(false);

  /** `after`: null = last, "" = first, else a label's key. */
  let draft = $state<{ name: string; chip: string; description: string; after: string | null }>({ name: "", chip: "", description: "", after: null });
  const lastKey = $derived(ordered.active.at(-1)?.key ?? "");
  let adding = $state(false);

  type Edit = { name: string; chip: string; description: string; after: string };
  let editingKey = $state<string | null>(null);
  let edit = $state<Edit>({ name: "", chip: "", description: "", after: "" });
  let firstField = $state<HTMLInputElement>();

  async function run(fn: () => Promise<void>) {
    error = null;
    try {
      await fn();
    } catch (e) {
      error = (e as Error).message;
    }
  }

  async function add(e: SubmitEvent) {
    e.preventDefault();
    if (!draft.name.trim() || !draft.description.trim() || adding) return;
    adding = true;
    await run(async () => {
      const created = await roleLabels.create({
        name: draft.name,
        chip: draft.chip.trim() || undefined,
        description: draft.description,
        after: draft.after || undefined,
      });
      // the API sorts a new label after another; "first" is a move once it exists
      const first = draft.after === "" ? rankToMove(roleLabels.all, created.key, "") : null;
      if (first !== null) await roleLabels.update(created.id!, { rank: first });
      draft = { name: "", chip: "", description: "", after: null };
    });
    adding = false;
  }

  async function startEdit(l: RoleLabel) {
    editingKey = l.key;
    edit = { name: l.name, chip: l.chip === l.name ? "" : l.chip, description: l.description, after: labelBefore(roleLabels.all, l.key) };
    await tick();
    firstField?.focus();
  }

  const save = (l: RoleLabel) =>
    run(async () => {
      const own = !l.builtinKey;
      if (own && !edit.description.trim()) throw new Error("Say in a line what the label means.");
      const rank = rankToMove(roleLabels.all, l.key, edit.after);
      await roleLabels.update(l.builtinKey ?? l.id!, {
        ...(own ? { name: edit.name } : {}),
        chip: edit.chip.trim(),
        description: edit.description,
        ...(rank !== null ? { rank } : {}),
      });
      editingKey = null;
    });

  const archive = (l: RoleLabel) => run(async () => void (await roleLabels.archive(l.id!)));
  /** Re-creating an archived label's name brings it back (last in the order). */
  const restore = (l: RoleLabel) =>
    run(async () => void (await roleLabels.create({ name: l.name, chip: l.chip === l.name ? undefined : l.chip, description: l.description })));

  onMount(() => void roleLabels.load());
</script>

{#snippet afterSelect(value: string, onchange: (v: string) => void, except: string | null, label: string)}
  <select class="select after" {value} aria-label={label} onchange={(e) => onchange(e.currentTarget.value)}>
    <option value="">First</option>
    {#each ordered.active.filter((o) => o.key !== except) as o (o.key)}<option value={o.key}>After {o.name}</option>{/each}
  </select>
{/snippet}

{#if error}<div class="err"><Note tone="bad">{error}</Note></div>{/if}

<Panel title="Role labels" count={ordered.active.length}>
  <p class="hint">
    The role on each exercise — what it's for in the session. Sessions are ordered by this list, and the AI reads each meaning.
  </p>

  <form class="panel-body add" onsubmit={add} aria-label="Add a role label">
    <input class="input name" placeholder="New label, e.g. Speed" bind:value={draft.name} maxlength={ROLE_LABEL_NAME_MAX} aria-label="Label name" />
    <input class="input chip" placeholder={draft.name.trim() || "Chip"} bind:value={draft.chip} maxlength={ROLE_LABEL_CHIP_MAX} aria-label="Chip (optional)" />
    <input
      class="input meaning"
      placeholder="What it means, in one line"
      bind:value={draft.description}
      maxlength={ROLE_LABEL_DESCRIPTION_MAX}
      aria-label="What it means"
    />
    {@render afterSelect(draft.after ?? lastKey, (v) => (draft.after = v), null, "Position")}
    <Button variant="primary" type="submit" disabled={adding || !draft.name.trim() || !draft.description.trim()}>
      {adding ? "Adding…" : "Add label"}
    </Button>
  </form>

  <ol class="rows">
    {#each ordered.active as l (l.key)}
      <li class="row">
        {#if editingKey === l.key}
          <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
          <form class="edit" onsubmit={(e) => { e.preventDefault(); save(l); }} aria-label="Edit {l.name}" onkeydown={(e) => { if (e.key === "Escape") editingKey = null; }}>
            {#if l.builtinKey}
              <span class="name-text">{l.name}</span>
              <input bind:this={firstField} bind:value={edit.chip} class="input chip" maxlength={ROLE_LABEL_CHIP_MAX} placeholder={l.name} aria-label="Chip" />
            {:else}
              <input bind:this={firstField} bind:value={edit.name} class="input name" maxlength={ROLE_LABEL_NAME_MAX} aria-label="Name" required />
              <input bind:value={edit.chip} class="input chip" maxlength={ROLE_LABEL_CHIP_MAX} placeholder={edit.name.trim() || "Same as name"} aria-label="Chip" />
            {/if}
            <input
              bind:value={edit.description}
              class="input meaning"
              maxlength={ROLE_LABEL_DESCRIPTION_MAX}
              placeholder={l.builtinKey ? "Empty = the default meaning" : "What it means"}
              aria-label="What it means"
            />
            {@render afterSelect(edit.after, (v) => (edit.after = v), l.key, "Position")}
            <Button small variant="primary" type="submit">Save</Button>
            <Button small variant="ghost" type="button" onclick={() => (editingKey = null)}>Cancel</Button>
          </form>
        {:else}
          <span class="chip-text" title="Chip">{l.chip}</span>
          <span class="name-text">{l.name}{#if l.builtinKey} <Pill>built-in</Pill>{/if}</span>
          <span class="meaning-text">{l.description}</span>
          <div class="acts">
            <Button small variant="ghost" onclick={() => startEdit(l)}>Edit</Button>
            {#if !l.builtinKey}
              <ConfirmButton label="Archive" confirmLabel="Archive {l.name}?" onconfirm={() => archive(l)} small variant="ghost" />
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ol>

  {#if ordered.archived.length > 0}
    <div class="archived">
      <button class="toggle" type="button" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)}>
        <Icon name="chevron" />
        Archived <span class="mono">{ordered.archived.length}</span>
      </button>
      {#if showArchived}
        <ul class="rows">
          {#each ordered.archived as l (l.key)}
            <li class="row muted">
              <span class="chip-text">{l.chip}</span>
              <span class="name-text">{l.name}</span>
              <span class="meaning-text">{l.description}</span>
              <div class="acts"><Button small variant="ghost" onclick={() => restore(l)}>Restore</Button></div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
</Panel>

<style>
  .err { margin-bottom: 12px; }
  .mono { font-family: var(--font-mono); }
  .hint { margin: 0; padding: 10px 16px; font-size: 13px; color: var(--muted); border-bottom: 1px solid var(--line-soft); background: var(--well); }

  .add { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--line-soft); }
  .name { flex: 0 1 160px; min-width: 120px; }
  .chip { flex: 0 1 96px; min-width: 72px; }
  .meaning { flex: 1 1 220px; min-width: 180px; }
  .after { width: 170px; font-size: 13px; }

  .rows { list-style: none; margin: 0; padding: 0 0 6px; }
  .row {
    display: grid;
    grid-template-columns: 88px minmax(110px, 180px) minmax(160px, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 4px 16px;
    border-bottom: 1px solid var(--line-soft);
  }
  .row:last-child { border-bottom: none; }
  .chip-text {
    justify-self: start;
    padding: 1px 8px;
    border-radius: 99px;
    background: var(--well);
    border: 1px solid var(--line-soft);
    font: 500 12px var(--font-ui);
    color: var(--muted);
  }
  .name-text { display: flex; align-items: center; gap: 6px; font: 600 14px var(--font-ui); color: var(--ink); }
  .meaning-text { font-size: 13px; color: var(--muted); }
  .acts { display: flex; gap: 4px; justify-content: flex-end; min-width: 150px; }
  .edit { grid-column: 1 / -1; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .row.muted .chip-text, .row.muted .name-text { opacity: 0.6; }

  .archived { border-top: 1px solid var(--line); }
  .toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 10px 16px;
    border: none;
    background: none;
    font: 500 13px var(--font-ui);
    color: var(--muted);
    cursor: pointer;
  }
  .toggle :global(svg) { width: 12px; height: 12px; transform: rotate(-90deg); transition: transform 120ms; }
  .toggle[aria-expanded="true"] :global(svg) { transform: none; }

  @media (max-width: 640px) {
    .row { grid-template-columns: auto 1fr; row-gap: 2px; }
    .meaning-text { grid-column: 1 / -1; grid-row: 2; }
    .acts { grid-column: 1 / -1; grid-row: 3; justify-content: flex-start; min-width: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .toggle :global(svg) { transition: none; }
  }
</style>
