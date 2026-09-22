<script lang="ts">
  import "../app.css";
  import { page } from "$app/state";

  let { children } = $props();

  const nav = [
    { href: "/", label: "Overview" },
    { href: "/clients", label: "Clients" },
    { href: "/exercises", label: "Exercise library" },
    { href: "/templates", label: "Templates" },
  ];
</script>

<div class="shell">
  <aside class="side">
    <a class="brand" href="/">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-name">Program&nbsp;Tracker</span>
    </a>

    <nav>
      {#each nav as item (item.href)}
        <a
          class="nav-item"
          class:active={
            item.href === "/" ? page.url.pathname === "/" : page.url.pathname.startsWith(item.href)
          }
          href={item.href}
          title={item.label}
        >
          <span class="nav-label">{item.label}</span>
          {#if item.href === "/clients"}
            <span class="nav-count">3</span>
          {/if}
        </a>
      {/each}
    </nav>

    <div class="side-foot">
      <p class="coach">Coach Dara</p>
      <p class="subtle">trainer account</p>
    </div>
  </aside>

  <main class="main">
    <div class="demo-banner" role="note">
      Demo mode — every number on screen is mock data. Nothing is saved.
    </div>
    {@render children()}
  </main>
</div>

<style>
  .shell {
    display: grid;
    grid-template-columns: 216px 1fr;
    min-height: 100vh;
  }

  .side {
    background: var(--surface);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    padding: 18px 12px;
    position: sticky;
    top: 0;
    height: 100vh;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 2px 8px 16px;
  }
  .brand-mark {
    width: 22px;
    height: 22px;
    border-radius: 5px;
    background:
      linear-gradient(var(--surface), var(--surface)) padding-box,
      var(--ink);
    border: 6px solid var(--ink);
    box-sizing: content-box;
  }
  .brand-name {
    font: 700 16px var(--font-cond);
    letter-spacing: 0.01em;
  }

  nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
  }
  .nav-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font: 600 14px var(--font-ui);
    color: var(--muted);
    padding: 8px 10px;
    border-radius: var(--radius);
  }
  .nav-item:hover { background: #f0f2ed; color: var(--ink); }
  .nav-item.active { background: var(--ink); color: #fff; }
  .nav-count {
    font: 500 12px var(--font-mono);
    color: inherit;
    opacity: 0.6;
  }

  .side-foot {
    border-top: 1px solid var(--line);
    padding: 12px 8px 0;
  }
  .coach { margin: 0; font-weight: 600; font-size: 14px; }
  .subtle { margin: 0; }

  .main {
    padding: 26px 34px 60px;
    max-width: 1080px;
    width: 100%;
    margin: 0 auto;
    min-width: 0; /* grid child: let content shrink instead of forcing min-content width */
  }

  .demo-banner {
    font: 500 12.5px var(--font-ui);
    color: var(--warn);
    background: var(--warn-bg);
    border: 1px solid #ecd9a8;
    border-radius: var(--radius);
    padding: 5px 12px;
    margin-bottom: 22px;
    display: inline-block;
    max-width: 100%;
    box-sizing: border-box;
  }

  @media (max-width: 860px) {
    .shell { grid-template-columns: 56px 1fr; }
    .brand { padding: 2px 0 16px; justify-content: center; }
    .brand-name { display: none; }
    .nav-label, .nav-count, .side-foot { display: none; }
    .nav-item { justify-content: center; padding: 8px 0; }
    .main { padding: 20px 16px 60px; }
  }
</style>
