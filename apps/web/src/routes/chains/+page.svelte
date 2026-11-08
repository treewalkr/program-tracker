<script lang="ts">
  import { onMount } from "svelte";
  import { beforeNavigate } from "$app/navigation";
  import { api } from "$lib/api";
  import type { KineticChainDto } from "$lib/api/types";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Button from "$lib/ui/Button.svelte";
  import KineticChainEditor from "$lib/components/KineticChainEditor.svelte";

  let chains = $state<KineticChainDto[] | null>(null);
  let loadError = $state<string | null>(null);
  /** Chain ids with unsaved picks. */
  let dirty = $state<Set<string>>(new Set());

  async function load() {
    loadError = null;
    try {
      chains = await api.chains();
    } catch (err) {
      loadError = (err as Error).message || "the server didn't answer";
    }
  }

  async function handleSave(id: string, groups: string[]) {
    const updated = await api.updateChain(id, { muscleGroups: groups });
    if (chains) chains = chains.map((c) => (c.id === id ? updated : c));
  }

  function markDirty(id: string, isDirty: boolean) {
    if (dirty.has(id) === isDirty) return;
    const next = new Set(dirty);
    if (isDirty) next.add(id);
    else next.delete(id);
    dirty = next;
  }

  beforeNavigate((nav) => {
    if (dirty.size === 0) return;
    if (nav.type === "leave") nav.cancel();
    else if (!confirm(`Leave without saving ${dirty.size === 1 ? "a chain" : `${dirty.size} chains`}?`)) nav.cancel();
  });

  onMount(load);
</script>

<svelte:head><title>Kinetic chains · Program Tracker</title></svelte:head>

<PageHead title="Kinetic chains" sub="Which muscle groups make up each chain — shared across every client" />

{#if loadError}
  <Note tone="bad">
    Couldn't load the kinetic chains — {loadError}.
    <Button small onclick={load}>Try again</Button>
  </Note>
{:else}
  <Panel title="Kinetic chains" count={chains ? (dirty.size ? `${dirty.size} unsaved` : `${chains.length} chains`) : undefined}>
    <p class="lede">
      Sets on these muscle groups count toward the chain in each client's
      <em>Sets touching each chain</em> panel. A group can belong to more than one chain.
      The counts describe where the work lands; they are not a balance score.
    </p>
    {#if chains === null}
      <div class="pad"><Skeleton h="200px" /></div>
    {:else}
      {#each chains as chain (chain.id)}
        <KineticChainEditor
          {chain}
          onSave={(groups) => handleSave(chain.id, groups)}
          ondirty={(d) => markDirty(chain.id, d)}
        />
      {/each}
    {/if}
  </Panel>
{/if}

<style>
  .lede {
    margin: 0;
    padding: 12px 16px;
    border-bottom: 1px solid var(--line-soft);
    font-size: 12px;
    color: var(--muted);
    max-width: none;
  }
  .lede em { font-style: normal; color: var(--ink); }
  .pad { padding: 16px; }
</style>
