<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import type { KineticChainDto } from "$lib/api/types";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import KineticChainEditor from "$lib/components/KineticChainEditor.svelte";

  let chains = $state<KineticChainDto[] | null>(null);
  let error = $state<string | null>(null);

  async function load() {
    try {
      chains = await api.chains();
    } catch (err) {
      error = (err as Error).message || "Failed to load kinetic chains";
    }
  }

  async function handleSave(id: string, groups: string[]) {
    const updated = await api.updateChain(id, { muscleGroups: groups });
    if (chains) {
      chains = chains.map((c) => (c.id === id ? updated : c));
    }
  }

  onMount(() => {
    load();
  });
</script>

<svelte:head><title>Settings · Program Tracker</title></svelte:head>

<PageHead title="Settings" sub="Trainer preferences and domain configuration" />

<div class="settings-wrap">
  {#if error}
    <Note tone="bad">{error}</Note>
  {/if}
  <Panel title="Kinetic chains" count={chains ? `${chains.length} chains` : undefined}>
    {#if chains === null}
      <div class="loading-pad">
        <Skeleton h="200px" />
      </div>
    {:else}
      {#each chains as chain (chain.id)}
        <KineticChainEditor
          {chain}
          onSave={(groups) => handleSave(chain.id, groups)}
        />
      {/each}
    {/if}
  </Panel>
</div>

<style>
  .settings-wrap {
    max-width: var(--measure-form);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .loading-pad {
    padding: 16px;
  }
</style>
