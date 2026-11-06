<script lang="ts">
  import { onMount } from "svelte";
  import { api } from "$lib/api";
  import type { ExerciseDto } from "$lib/api/types";
  import {
    formatPatternBalance,
    FUNCTIONAL_MOVEMENT_INFO,
    FUNCTIONAL_MOVEMENTS,
    MOVEMENT_PATTERN_INFO,
    MOVEMENT_PATTERNS,
    patternBalance,
  } from "@pt/shared";
  import { groupExercises, type CatalogAxis } from "$lib/catalog";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";

  let all = $state<ExerciseDto[]>([]);
  let q = $state("");
  let groupBy = $state<CatalogAxis>("muscle");
  let group = $state("all");

  const searchFiltered = $derived(
    all.filter((e) => !q || e.name.toLowerCase().includes(q.toLowerCase()))
  );

  const axisGroups = $derived(groupExercises(all, groupBy));
  const chips = $derived([
    { key: "all", label: "all" },
    ...axisGroups.map((g) => ({ key: g.key, label: g.label })),
  ]);

  const activeGroups = $derived(groupExercises(searchFiltered, groupBy));

  const filtered = $derived(
    group === "all"
      ? searchFiltered
      : (activeGroups.find((g) => g.key === group)?.exercises ?? [])
  );

  async function updatePattern(id: string, val: string) {
    const ex = all.find((x) => x.id === id);
    if (!ex) return;
    const prev = ex.movementPattern;
    const next = val === "" ? null : val;
    if (prev === next) return;
    ex.movementPattern = next;
    all = [...all];
    try {
      await api.patchExercise(id, { movementPattern: next });
    } catch (err) {
      ex.movementPattern = prev;
      all = [...all];
      console.error("failed to patch exercise movement pattern:", err);
    }
  }

  async function updateFunctional(id: string, val: string) {
    const ex = all.find((x) => x.id === id);
    if (!ex) return;
    const prev = ex.functionalMovement;
    const next = val === "" ? null : val;
    if (prev === next) return;
    ex.functionalMovement = next;
    all = [...all];
    try {
      await api.patchExercise(id, { functionalMovement: next });
    } catch (err) {
      ex.functionalMovement = prev;
      all = [...all];
      console.error("failed to patch exercise functional movement:", err);
    }
  }

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
    <label class="group-by-label">
      Group by
      <select class="select" bind:value={groupBy} onchange={() => (group = "all")}>
        <option value="muscle">Muscle group</option>
        <option value="pattern">Movement pattern</option>
        <option value="functional">Functional movement</option>
      </select>
    </label>
    <input class="input search" placeholder="Search…" bind:value={q} />
  {/snippet}
</PageHead>

<div class="groups">
  {#each chips as c (c.key)}
    <ToggleChip on={group === c.key} onclick={() => (group = c.key)}>{c.label}</ToggleChip>
  {/each}
</div>

<p class="hint balance-strip">{formatPatternBalance(patternBalance(filtered))}</p>

{#snippet exerciseTable(exerciseList: ExerciseDto[])}
  <div class="table-wrap">
  <table class="sheet">
    <thead>
      <tr>
        <th>Exercise</th>
        <th>Primary</th>
        <th>Secondary</th>
        <th>Pattern</th>
        <th>Functional</th>
        <th>Equipment</th>
      </tr>
    </thead>
    <tbody>
      {#each exerciseList as e (e.id)}
        <tr>
          <td><strong>{e.name}</strong></td>
          <td><span class="pill neutral">{e.primaryMuscleGroup}</span></td>
          <td class="subtle">{e.secondaryMuscleGroups.join(", ") || "—"}</td>
          <td>
            <select
              class="select compact"
              value={e.movementPattern ?? ""}
              onchange={(ev) => updatePattern(e.id, (ev.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">—</option>
              {#each MOVEMENT_PATTERNS as p (p)}
                <option value={p}>{MOVEMENT_PATTERN_INFO[p].label}</option>
              {/each}
            </select>
          </td>
          <td>
            <select
              class="select compact"
              value={e.functionalMovement ?? ""}
              onchange={(ev) => updateFunctional(e.id, (ev.currentTarget as HTMLSelectElement).value)}
            >
              <option value="">—</option>
              {#each FUNCTIONAL_MOVEMENTS as f (f)}
                <option value={f}>{FUNCTIONAL_MOVEMENT_INFO[f].label}</option>
              {/each}
            </select>
          </td>
          <td>{e.equipment}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  </div>
{/snippet}

{#if group === "all"}
  {#each activeGroups as g (g.key)}
    <section class="panel table-panel">
      <header class="group-header">
        <h3 class="group-title">{g.label} · {g.exercises.length}</h3>
      </header>
      {@render exerciseTable(g.exercises)}
    </section>
  {/each}
  {#if activeGroups.length === 0}
    <section class="panel table-panel">
      <EmptyState>No exercise matches.</EmptyState>
    </section>
  {/if}
{:else}
  <section class="panel table-panel">
    {@render exerciseTable(filtered)}
    {#if filtered.length === 0}
      <EmptyState>No exercise matches.</EmptyState>
    {/if}
  </section>
{/if}

<style>
  .search { max-width: 260px; }
  .group-by-label { display: flex; align-items: center; gap: 8px; font-size: 0.9rem; }
  .groups { display: flex; flex-wrap: wrap; gap: 6px; }
  .balance-strip { margin: 12px 0 6px; }
  .table-panel { margin-top: 14px; }
  .table-wrap { overflow-x: auto; }
  .group-header { padding: 12px 16px 8px; }
  .group-title { margin: 0; font-size: 1rem; font-weight: 600; }
  select.compact { padding: 2px 6px; font-size: 0.85rem; }
</style>
