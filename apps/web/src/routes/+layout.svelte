<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { api, apiMode } from "$lib/api";
  import Note from "$lib/ui/Note.svelte";
  import Icon, { type IconName } from "$lib/ui/Icon.svelte";
  import FeedbackLayer from "$lib/feedback/FeedbackLayer.svelte";

  let { children } = $props();

  let clientCount = $state<number | null>(null);

  const groups: { label: string; items: { href: string; label: string; icon: IconName }[] }[] = [
    {
      label: "Workspace",
      items: [
        { href: "/", label: "Overview", icon: "grid" },
        { href: "/clients", label: "Clients", icon: "users" },
        { href: "/settings", label: "Settings", icon: "gear" },
        { href: "/feedback", label: "Feedback", icon: "comment" },
      ],
    },
    {
      label: "Library",
      items: [
        { href: "/exercises", label: "Exercise library", icon: "dumbbell" },
        { href: "/templates", label: "Templates", icon: "file" },
        { href: "/examples", label: "Examples", icon: "star" },
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
        <small>Trainer workspace</small>
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
            <Icon name={item.icon} />
            <span class="nav-text">{item.label}</span>
            {#if item.href === "/clients" && clientCount !== null}
              <span class="count">{clientCount}</span>
            {/if}
          </a>
        {/each}
      {/each}
    </nav>

    <div class="side-foot" class:demo={apiMode !== "live"}>
      <span class="dot" aria-hidden="true"></span>{apiMode === "live" ? "Live data" : "Demo data"}
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

<FeedbackLayer />

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
    padding: 0 8px 4px;
    text-decoration: none;
    border-radius: var(--radius);
  }
  .brand:hover { text-decoration: none; }
  .mark {
    width: 28px;
    height: 28px;
    border-radius: 99px;
    background: var(--hover-ink);
    color: #fff;
    display: grid;
    place-items: center;
    font: 600 11px/1 var(--font-ui);
    letter-spacing: 0.02em;
    flex: none;
  }
  .name {
    font: 600 14px/1.2 var(--font-ui);
    color: var(--ink);
  }
  .name small {
    display: block;
    font: 400 12px/1.5 var(--font-ui);
    color: var(--muted);
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  .nav-label {
    font: 600 11px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: 0 8px;
    margin: 0 0 6px;
    white-space: nowrap;
  }
  .nav-item + .nav-label { margin-top: 18px; }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border-radius: var(--radius);
    text-decoration: none;
    font: 400 14px/1.4 var(--font-ui);
    color: var(--ink);
    white-space: nowrap;
    transition: background-color 120ms ease-out;
  }
  .nav-item :global(svg) {
    width: 16px;
    height: 16px;
    color: var(--muted);
    stroke-width: 1.6;
    flex: none;
  }
  .nav-item:hover { background: var(--well-2); text-decoration: none; }
  .nav-item:hover :global(svg) { color: var(--ink); }
  .nav-item.active { background: var(--active); font-weight: 600; }
  .nav-item.active :global(svg) { color: var(--ink); }
  .count {
    margin-left: auto;
    font: 500 12px/18px var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    background: var(--chip-bg);
    border-radius: 99px;
    padding: 0 7px;
    min-width: 20px;
    text-align: center;
  }

  .side-foot {
    margin-top: auto;
    border-top: 1px solid var(--line);
    padding: 12px 8px 0;
    display: flex;
    align-items: center;
    gap: 7px;
    font: 400 12px/1.5 var(--font-ui);
    color: var(--muted);
    white-space: nowrap;
  }
  .side-foot .dot {
    width: 7px;
    height: 7px;
    border-radius: 99px;
    background: var(--green-btn);
    flex: none;
  }
  .side-foot.demo .dot { background: var(--warn); }

  @media (prefers-reduced-motion: reduce) {
    .nav-item { transition: none; }
  }

  .main {
    /* Anchored to the sidebar: centering left a dead strip between nav and
       content on wide screens. Extra width falls to the right edge. */
    padding: 28px 40px 64px;
    max-width: calc(var(--page-max) + 80px);
    width: 100%;
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
