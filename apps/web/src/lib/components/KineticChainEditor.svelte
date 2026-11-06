<script lang="ts">
  import { CHAIN_MUSCLE_GROUPS } from "@pt/shared";
  import type { KineticChainDto } from "$lib/api/types";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Button from "$lib/ui/Button.svelte";

  let {
    chain,
    onSave,
    ondirty,
  }: {
    chain: KineticChainDto;
    onSave: (groups: string[]) => Promise<void>;
    /** Reports unsaved edits so the page can guard navigation. */
    ondirty?: (dirty: boolean) => void;
  } = $props();

  let selected = $state<string[]>([]);
  let saving = $state(false);
  let error = $state<string | null>(null);
  let saved = $state(false);

  $effect(() => {
    selected = [...chain.muscleGroups];
  });

  const dirty = $derived(
    selected.length !== chain.muscleGroups.length || selected.some((g) => !chain.muscleGroups.includes(g))
  );
  const empty = $derived(selected.length === 0);

  $effect(() => {
    ondirty?.(dirty);
  });

  function toggle(group: string) {
    error = null;
    saved = false;
    selected = selected.includes(group) ? selected.filter((g) => g !== group) : [...selected, group];
  }

  function reset() {
    selected = [...chain.muscleGroups];
    error = null;
  }

  async function save() {
    if (saving || empty || !dirty) return;
    saving = true;
    error = null;
    try {
      await onSave(selected);
      saved = true;
    } catch (err) {
      error = (err as Error).message || "the server didn't answer";
    } finally {
      saving = false;
    }
  }
</script>

<div class="chain" class:dirty>
  <div class="chain-row">
    <div class="who">
      <h3 class="name">{chain.name}</h3>
      <span class="count">{selected.length} {selected.length === 1 ? "group" : "groups"}</span>
    </div>

    <div class="chips" role="group" aria-label={`Muscle groups for ${chain.name}`}>
      {#each CHAIN_MUSCLE_GROUPS as group (group)}
        <ToggleChip on={selected.includes(group)} onclick={() => toggle(group)}>{group}</ToggleChip>
      {/each}
    </div>

    <div class="act">
      {#if dirty}
        <Button variant="ghost" small onclick={reset} disabled={saving}>Reset</Button>
        <Button variant="primary" small onclick={save} disabled={saving || empty}>{saving ? "Saving…" : "Save"}</Button>
      {:else if saved}
        <span class="msg ok" role="status">Saved</span>
      {/if}
    </div>

    {#if dirty && empty}
      <p class="msg err full">Pick at least one muscle group to save.</p>
    {:else if error}
      <p class="msg err full" role="alert">Couldn't save {chain.name} — {error}. Your picks are kept; try again.</p>
    {/if}
  </div>
</div>

<style>
  /* Sized by the panel, not the viewport: a wide panel puts name | chips |
     actions on one line (the action slot keeps its width so rows don't
     reflow when Save appears); a narrower one moves the chips under the name. */
  .chain {
    container-type: inline-size;
    border-bottom: 1px solid var(--line-soft);
  }
  .chain:last-child { border-bottom: none; }
  .chain.dirty { background: var(--hover-soft); }
  .chain-row {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr) 150px;
    gap: 8px 16px;
    align-items: center;
    padding: 12px 16px;
  }
  .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name { margin: 0; font: 600 14px/1.3 var(--font-ui); color: var(--ink); }
  .count { font-size: 12px; color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .act { display: flex; justify-content: flex-end; align-items: center; gap: 6px; min-height: 24px; }
  .msg { font-size: 12px; white-space: nowrap; }
  .msg.ok { color: var(--good); }
  .msg.err { color: var(--bad); }
  .msg.full { grid-column: 2 / -1; margin: 0; white-space: normal; }
  @container (max-width: 1240px) {
    .chain-row { grid-template-columns: minmax(0, 1fr) auto; }
    .chips { grid-column: 1 / -1; grid-row: 2; }
    .act { grid-column: 2; grid-row: 1; }
    .msg.full { grid-column: 1 / -1; }
  }
</style>
