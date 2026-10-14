<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import Note from "$lib/ui/Note.svelte";

  let { children } = $props();

  let clientCount = $state<number | null>(null);

  const groups = [
    {
      label: "Workspace",
      items: [
        { href: "/", label: "Overview", icon: "grid" },
        { href: "/clients", label: "Clients", icon: "users" },
      ],
    },
    {
      label: "Library",
      items: [
        { href: "/exercises", label: "Exercise library", icon: "dumbbell" },
        { href: "/templates", label: "Templates", icon: "layers" },
      ],
    },
  ];

  const isActive = (href: string) =>
    href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(href);

  onMount(async () => {
    try {
      clientCount = (await api.clients()).length;
    } catch {
      clientCount = null;
    }
  });
</script>

<div class="shell">
  <aside class="side">
    <a class="brand" href="/">
      <span class="mark" aria-hidden="true">PT</span>
      <span class="name">
        Program Tracker
        <small>Trainer · {apiMode === "live" ? "live data" : "demo"}</small>
      </span>
    </a>

    <nav aria-label="Primary">
      {#each groups as group (group.label)}
        <div class="nav-label">{group.label}</div>
        {#each group.items as item (item.href)}
          <a
            class="nav-item"
            class:active={isActive(item.href)}
            aria-current={isActive(item.href) ? "page" : undefined}
            href={item.href}
            title={item.label}
          >
            {#if item.icon === "grid"}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" /></svg>
            {:else if item.icon === "users"}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            {:else if item.icon === "dumbbell"}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
            {:else}
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 3 7l9 4 9-4zM3 12l9 4 9-4M3 17l9 4 9-4" /></svg>
            {/if}
            <span class="nav-text">{item.label}</span>
            {#if item.href === "/clients" && clientCount !== null}
              <span class="count">{clientCount}</span>
            {/if}
          </a>
        {/each}
      {/each}
    </nav>

    <div class="side-foot">
      <span class="dot" aria-hidden="true"></span>Trainer
    </div>
  </aside>

  <main class="main">
    {#if apiMode === "mock"}
      <Note tone="warn" role="note" class="demo-banner">
        Demo mode — every number on screen is mock data. Nothing is saved.
      </Note>
    {/if}
    {@render children()}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 236px 1fr;
    min-height: 100vh;
  }

  .side {
    background: var(--well);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 20px;
    padding: 20px 12px 16px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow-y: auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px;
    text-decoration: none;
  }
  .mark {
    width: 26px;
    height: 26px;
    border-radius: 99px;
    background: #24292f;
    color: #fff;
    display: grid;
    place-items: center;
    font: 600 11px/1 var(--font-ui);
    flex: none;
  }
  .name {
    font: 600 14px/1.2 var(--font-ui);
    color: var(--ink);
  }
  .name small {
    display: block;
    font: 400 11px/1.7 var(--font-ui);
    color: var(--muted);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
  }
  .nav-label {
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0 8px;
    margin: 4px 0 7px;
    white-space: nowrap;
  }
  .nav-item + .nav-label { margin-top: 12px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 6px 8px;
    border-radius: 6px;
    text-decoration: none;
    font: 400 14px/1.4 var(--font-ui);
    color: var(--ink);
    white-space: nowrap;
  }
  .nav-item svg {
    width: 16px;
    height: 16px;
    stroke: #59636e;
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: none;
  }
  .nav-item:hover { background: var(--well-2); text-decoration: none; }
  .nav-item.active { background: var(--active); font-weight: 600; }
  .nav-item.active svg { stroke: var(--ink); }
  .count {
    margin-left: auto;
    font: 400 12px/1 var(--font-ui);
    color: #59636e;
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 0 7px;
    min-width: 20px;
    text-align: center;
  }

  .side-foot {
    margin-top: auto;
    border-top: 1px solid var(--line);
    padding: 14px 8px 0;
    font: 400 12px/1.6 var(--font-ui);
    color: var(--muted);
    white-space: nowrap;
  }
  .side-foot .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 99px;
    background: var(--green-btn);
    margin-right: 6px;
  }

  .main {
    padding: 28px 32px 64px;
    max-width: 1080px;
    width: 100%;
    margin: 0 auto;
    min-width: 0; /* grid child: let content shrink instead of forcing min-content width */
  }

  /* layout placement for the global note component */
  .main :global(.demo-banner) {
    padding: 8px 16px;
    margin-bottom: 22px;
    max-width: 100%;
  }

  @media (max-width: 860px) {
    .shell { grid-template-columns: 56px 1fr; }
    .side { padding: 16px 8px; gap: 14px; }
    .brand { padding: 0; justify-content: center; }
    .name { display: none; }
    .nav-label { visibility: hidden; height: 8px; margin: 0; padding: 0; }
    .nav-text, .count, .side-foot { display: none; }
    .nav-item { justify-content: center; padding: 8px 0; }
    .main { padding: 20px 16px 56px; }
  }
</style>
