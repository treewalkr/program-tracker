<script lang="ts">
  import { onMount } from "svelte";
  import { api, type ClientDto, type ProviderInfo } from "$lib/api";

  let clients = $state<ClientDto[] | null>(null);
  let providers = $state<ProviderInfo[] | null>(null);
  let apiUp = $state<boolean | null>(null);
  let error = $state<string | null>(null);

  const providerCount = $derived(providers?.filter((p) => p.configured).length ?? 0);

  onMount(async () => {
    try {
      const [health, p, c] = await Promise.all([api.health(), api.providers(), api.clients()]);
      apiUp = health.ok;
      providers = p.providers;
      clients = c;
    } catch (err) {
      apiUp = false;
      error = (err as Error).message;
    }
  });
</script>

<svelte:head>
  <title>Program Tracker</title>
</svelte:head>

<main class="shell">
  <h1>Program Tracker</h1>

  {#if error}
    <p class="banner error">API error: {error}</p>
  {/if}

  <section class="status">
    <div class="card">
      <h2>Backend</h2>
      {#if apiUp === null}
        <p>checking…</p>
      {:else if apiUp}
        <p class="ok">● online</p>
      {:else}
        <p class="bad">● offline — run <code>bun run dev:api</code></p>
      {/if}
    </div>

    <div class="card">
      <h2>AI providers</h2>
      {#if providers === null}
        <p>checking…</p>
      {:else}
        <p>{providerCount} of {providers.length} configured</p>
        <ul>
          {#each providers as p (p.id)}
            <li class:p.ok-badge={p.configured}>
              {p.label} · <code>{p.model}</code>
              {p.configured ? "✓" : "— set " + p.id.toUpperCase() + "_API_KEY"}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="card">
      <h2>Clients</h2>
      {#if clients === null}
        <p>loading…</p>
      {:else if clients.length === 0}
        <p>no clients yet — create one via <code>POST /v1/clients</code></p>
      {:else}
        <ul>
          {#each clients as c (c.id)}
            <li>{c.name} <span class="muted">· {c.status}{c.daysPerWeek ? ` · ${c.daysPerWeek}×/week` : ""}</span></li>
          {/each}
        </ul>
      {/if}
    </div>
  </section>
</main>

<style>
  .shell {
    max-width: 60rem;
    margin: 2rem auto;
    padding: 0 1rem;
    font-family: system-ui, sans-serif;
  }
  .status {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
    gap: 1rem;
  }
  .card {
    border: 1px solid #ddd;
    border-radius: 0.5rem;
    padding: 1rem;
  }
  .ok { color: #167f3f; }
  .bad { color: #b3261e; }
  .ok-badge { color: #167f3f; }
  .muted { color: #666; }
  .banner.error {
    border: 1px solid #b3261e;
    color: #b3261e;
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
  }
  code {
    background: #f4f4f4;
    padding: 0.1rem 0.3rem;
    border-radius: 0.25rem;
    font-size: 0.85em;
  }
</style>
