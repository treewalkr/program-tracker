<script lang="ts">
  import { CHAIN_MUSCLE_GROUPS } from "@pt/shared";
  import type { KineticChainDto } from "$lib/api/types";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Note from "$lib/ui/Note.svelte";

  let { chain, onSave }: { chain: KineticChainDto; onSave: (groups: string[]) => Promise<void> } = $props();

  let selected = $state<string[]>([]);
  let saving = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    selected = [...chain.muscleGroups];
  });

  const hasChanges = $derived(
    selected.length !== chain.muscleGroups.length ||
      selected.some((g) => !chain.muscleGroups.includes(g))
  );

  function toggle(group: string) {
    error = null;
    if (selected.includes(group)) {
      selected = selected.filter((g) => g !== group);
    } else {
      selected = [...selected, group];
    }
  }

  async function handleSave() {
    if (saving || selected.length === 0 || !hasChanges) return;
    saving = true;
    error = null;
    try {
      await onSave(selected);
    } catch (err) {
      error = (err as Error).message || "Failed to update chain";
    } finally {
      saving = false;
    }
  }
</script>

<div class="chain-row">
  <div class="chain-header">
    <div class="chain-title-block">
      <h3 class="chain-name">{chain.name}</h3>
      <span class="chain-count">{selected.length} {selected.length === 1 ? "muscle group" : "muscle groups"}</span>
    </div>
    <Button
      variant="primary"
      small
      disabled={saving || selected.length === 0 || !hasChanges}
      onclick={handleSave}
    >
      {saving ? "Saving…" : "Save"}
    </Button>
  </div>

  <div class="chips-grid" role="group" aria-label={`Muscle groups for ${chain.name}`}>
    {#each CHAIN_MUSCLE_GROUPS as group (group)}
      <ToggleChip on={selected.includes(group)} onclick={() => toggle(group)}>
        {group}
      </ToggleChip>
    {/each}
  </div>

  {#if error}
    <Note tone="bad">{error}</Note>
  {/if}
</div>

<style>
  .chain-row {
    padding: 16px;
    border-bottom: 1px solid var(--line-soft);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .chain-row:last-child {
    border-bottom: none;
  }
  .chain-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .chain-title-block {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .chain-name {
    margin: 0;
    font: 600 14px/1.2 var(--font-ui);
    color: var(--ink);
  }
  .chain-count {
    font-size: 12px;
    color: var(--muted);
  }
  .chips-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
</style>
