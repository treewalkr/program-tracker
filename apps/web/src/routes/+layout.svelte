<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { api, apiMode } from "$lib/api";
  import { authApi } from "$lib/api/auth";
  import Note from "$lib/ui/Note.svelte";
  import Icon, { type IconName } from "$lib/ui/Icon.svelte";
  import FeedbackLayer from "$lib/feedback/FeedbackLayer.svelte";

  let { children, data } = $props();

  const bare = $derived(page.url.pathname === "/login");
  const trainer = $derived(data.session.kind === "signedIn" ? data.session.trainer : null);
  /** AUTH_DISABLED ("open") runs as admin server-side too. */
  const isAdmin = $derived(trainer?.isAdmin || data.session.kind === "open");

  async function signOut() {
    await authApi.signOut();
    await goto("/login", { invalidateAll: true });
  }

  let clientCount = $state<number | null>(null);

  type NavGroup = { label: string; items: { href: string; label: string; icon: IconName }[] };
  const baseGroups: NavGroup[] = [
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
        { href: "/session-types", label: "Session types", icon: "layers" },
        { href: "/templates", label: "Templates", icon: "file" },
        { href: "/examples", label: "Examples", icon: "star" },
      ],
    },
  ];
  const groups = $derived<NavGroup[]>(
    isAdmin ? [...baseGroups, { label: "Platform", items: [{ href: "/admin", label: "Trainers", icon: "lock" }] }] : baseGroups,
  );

  const isActive = (href: string) =>
    href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(href);

  /* Sidebar: wide screens collapse it to an icon rail by choice (remembered);
     narrow screens start as the rail and open the full menu over the page. */
  const RAIL_KEY = "pt.sidebar.rail";
  const narrowQuery = window.matchMedia("(max-width: 860px)");
  let narrow = $state(narrowQuery.matches);
  let collapsed = $state(localStorage.getItem(RAIL_KEY) === "1");
  let drawerOpen = $state(false);
  const rail = $derived(narrow ? !drawerOpen : collapsed);
  const sideOpen = $derived(!rail);

  function toggleSide() {
    if (narrow) drawerOpen = !drawerOpen;
    else {
      collapsed = !collapsed;
      localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0");
    }
  }

  $effect(() => {
    const onChange = (e: MediaQueryListEvent) => {
      narrow = e.matches;
      drawerOpen = false;
    };
    narrowQuery.addEventListener("change", onChange);
    return () => narrowQuery.removeEventListener("change", onChange);
  });

  // Close the narrow-screen drawer after navigating.
  $effect(() => {
    void page.url.pathname;
    drawerOpen = false;
  });

  onMount(async () => {
    if (bare) return;
    try {
      clientCount = (await api.clients()).length;
    } catch {
      clientCount = null;
    }
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === "Escape" && drawerOpen) drawerOpen = false; }} />

{#if bare}
  {@render children()}
{:else}
<div class="shell" class:rail class:drawer={narrow && drawerOpen}>
  <aside class="side" id="sidebar">
    <div class="brand-row">
      <a class="brand" href="/">
        <span class="mark" aria-hidden="true">PT</span>
        <span class="name">
          Program Tracker
          <small>Trainer workspace</small>
        </span>
      </a>
      <button
        type="button"
        class="side-toggle"
        aria-controls="sidebar"
        aria-expanded={sideOpen}
        aria-label={sideOpen ? "Collapse menu" : "Expand menu"}
        title={sideOpen ? "Collapse menu" : "Expand menu"}
        onclick={toggleSide}
      >
        <Icon name="sidebar" />
      </button>
    </div>

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

    {#if trainer}
      <div class="who">
        {#if trainer.avatarUrl}
          <img src={trainer.avatarUrl} alt="" referrerpolicy="no-referrer" />
        {/if}
        <span class="who-text">
          <span class="who-name">{trainer.name}</span>
          <button type="button" class="sign-out" onclick={signOut}>Sign out</button>
        </span>
      </div>
    {/if}

    <div class="side-foot" class:demo={apiMode !== "live"}>
      <span class="dot" aria-hidden="true"></span>{apiMode === "live" ? "Live data" : "Demo data"}
      <span class="build" title="Build {__APP_VERSION__}">v{__APP_VERSION__}</span>
    </div>
  </aside>

  {#if narrow && drawerOpen}
    <button type="button" class="scrim" aria-label="Close menu" onclick={() => (drawerOpen = false)}></button>
  {/if}

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
{/if}

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
    overflow-x: hidden; /* overflow-y alone makes x auto too; hidden nowrap labels must not add a sideways bar */
    overflow-y: auto;
  }

  .brand-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .side-toggle {
    margin-left: auto;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--muted);
    cursor: pointer;
    transition: background-color 120ms ease-out;
  }
  .side-toggle :global(svg) { width: 16px; height: 16px; stroke-width: 1.6; }
  .side-toggle:hover { background: var(--well-2); color: var(--ink); }
  .side-toggle:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }

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
  .side-foot .build {
    margin-left: auto;
    font: 400 11px/1.5 var(--font-mono);
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .who {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 8px;
    min-width: 0;
  }
  .who img {
    width: 24px;
    height: 24px;
    border-radius: 99px;
    flex: none;
  }
  .who-text { display: flex; flex-direction: column; min-width: 0; }
  .who-name {
    font: 500 13px/1.3 var(--font-ui);
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sign-out {
    all: unset;
    font: 400 12px/1.4 var(--font-ui);
    color: var(--muted);
    cursor: pointer;
    width: fit-content;
  }
  .sign-out:hover { color: var(--blue); text-decoration: underline; }
  .sign-out:focus-visible { border-radius: 3px; box-shadow: 0 0 0 3px var(--focus); }
  .who + .side-foot { margin-top: 0; }

  @media (prefers-reduced-motion: reduce) {
    .nav-item, .side-toggle { transition: none; }
  }

  .main {
    grid-column: 2; /* stays put when the narrow-screen menu floats out of the grid */
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

  /* Icon rail: chosen on wide screens, the default on narrow ones. */
  .shell.rail { grid-template-columns: 56px 1fr; }
  .rail .side { padding: 16px 8px; gap: 14px; scrollbar-width: none; } /* a scrollbar would eat the 56px rail */
  .rail .side::-webkit-scrollbar { display: none; }
  .rail .brand-row { flex-direction: column; gap: 10px; }
  .rail .side-toggle { margin-left: 0; }
  .rail .brand { padding: 0; justify-content: center; }
  .rail .name { display: none; }
  .rail .nav-label { visibility: hidden; height: 8px; margin: 0; padding: 0; }
  .rail .nav-text, .rail .count, .rail .side-foot, .rail .who-text { display: none; }
  .rail .who { justify-content: center; padding: 0; }
  .rail .nav-item { justify-content: center; padding: 8px 0; }

  /* Narrow screens: the open menu floats over the page instead of squeezing it. */
  .shell.drawer { grid-template-columns: 56px 1fr; }
  .drawer .side {
    position: fixed;
    left: 0;
    width: 236px;
    z-index: 40;
    box-shadow: 0 8px 24px rgba(31, 35, 40, 0.18);
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 39;
    border: 0;
    padding: 0;
    background: rgba(31, 35, 40, 0.25);
    cursor: default;
  }

  @media (max-width: 860px) {
    .main { padding: 20px 16px 56px; }
  }
</style>
