<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import type { ExerciseDto } from "$lib/api/types";

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

<div class="page-head">
  <div>
    <h1>Exercise library</h1>
    <p class="sub">{all.length ? `${all.length} in the demo catalog — the real seed holds 719 from WGER` : "loading…"}</p>
  </div>
  <input class="input search" placeholder="Search…" bind:value={q} />
</div>

<div class="groups">
  {#each groups as g (g)}
    <button class="chip" class:active={group === g} onclick={() => (group = g)}>{g}</button>
  {/each}
</div>

<section class="panel" style="margin-top:14px">
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
  {#if filtered.length === 0}<div class="empty">No exercise matches.</div>{/if}
</section>

<style>
  .search { max-width: 260px; }
  .groups { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    font: 600 12.5px var(--font-ui);
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 3px 11px;
    cursor: pointer;
  }
  .chip:hover { border-color: var(--line-strong); }
  .chip.active { background: var(--ink); color: #fff; border-color: var(--ink); }
</style>
