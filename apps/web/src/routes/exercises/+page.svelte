<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import type { ExerciseDto } from "$lib/api/types";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";

  let all = $state<ExerciseDto[]>([]);
  let q = $state("");
  let group = $state("all");

  const groups = $derived(["all", ...new Set(all.map((e) => e.primaryMuscleGroup).sort())]);
  const filtered = $derived(
    all.filter(
      (e) =>
        (group === "all" || e.primaryMuscleGroup === group) &&
        (!q || e.name.toLowerCase().includes(q.toLowerCase()))
    )
  );

  onMount(async () => {
    all = await api.exercises();
  });
</script>

<svelte:head><title>Exercises · Program Tracker</title></svelte:head>

<PageHead
  title="Exercise library"
  sub={all.length ? `${all.length} in the demo catalog — the real seed holds 719 from WGER` : "loading…"}
>
  {#snippet actions()}
    <input class="input search" placeholder="Search…" bind:value={q} />
  {/snippet}
</PageHead>

<div class="groups">
  {#each groups as g (g)}
    <ToggleChip on={group === g} onclick={() => (group = g)}>{g}</ToggleChip>
  {/each}
</div>

<section class="panel table-panel">
  <table class="sheet">
    <thead><tr><th>Exercise</th><th>Primary</th><th>Secondary</th><th>Equipment</th></tr></thead>
    <tbody>
      {#each filtered as e (e.id)}
        <tr>
          <td><strong>{e.name}</strong></td>
          <td><span class="pill neutral">{e.primaryMuscleGroup}</span></td>
          <td class="subtle">{e.secondaryMuscleGroups.join(", ") || "—"}</td>
          <td>{e.equipment}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if filtered.length === 0}<EmptyState>No exercise matches.</EmptyState>{/if}
</section>

<style>
  .search { max-width: 260px; }
  .groups { display: flex; flex-wrap: wrap; gap: 6px; }
  .table-panel { margin-top: 14px; }
</style>
