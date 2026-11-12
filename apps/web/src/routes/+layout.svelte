<script lang="ts">
  import "@fontsource-variable/noto-sans-thai";
  import "../app.css";
  import { page } from "$app/state";
  import { onMount, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { afterNavigate, goto } from "$app/navigation";
  import { api, apiMode } from "$lib/api";
  import { authApi } from "$lib/api/auth";
  import { clearAllNewClientDrafts } from "$lib/newClientDraft";
  import Note from "$lib/ui/Note.svelte";
  import Tooltip from "$lib/ui/Tooltip.svelte";
  import Icon, { type IconName } from "$lib/ui/Icon.svelte";
  import FeedbackLayer from "$lib/feedback/FeedbackLayer.svelte";
  import { feedbackUnread } from "$lib/feedback/unread.svelte";
  import { syncThemeAttribute } from "$lib/theme.svelte";
  import { roleLabels } from "$lib/roleLabelStore.svelte";
  import { whatsNew } from "$lib/whatsNew.svelte";
  import VersionLink from "$lib/components/VersionLink.svelte";
  import AccountMenu from "$lib/components/AccountMenu.svelte";

  let { children, data } = $props();

  const bare = $derived(page.url.pathname === "/login");
  const trainer = $derived(data.session.kind === "signedIn" ? data.session.trainer : null);
  /** AUTH_DISABLED ("open") runs as admin server-side too. */
  const isAdmin = $derived(trainer?.isAdmin || data.session.kind === "open");

  async function signOut() {
    clearAllNewClientDrafts();
    await authApi.signOut();
    await goto("/login", { invalidateAll: true });
  }

  let clientCount = $state<number | null>(null);

  syncThemeAttribute();

  type NavGroup = { label: string; items: { href: string; label: string; icon: IconName }[] };
  const baseGroups: NavGroup[] = [
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
        { href: "/session-types", label: "Session types", icon: "layers" },
        { href: "/schemes", label: "Progression schemes", icon: "trending" },
        { href: "/vocabulary", label: "Vocabulary", icon: "pencil" },
        { href: "/chains", label: "Kinetic chains", icon: "link" },
        { href: "/templates", label: "Templates", icon: "file" },
        { href: "/examples", label: "Examples", icon: "star" },
        { href: "/rules", label: "Coaching rules", icon: "list-check" },
      ],
    },
  ];
  const groups = $derived<NavGroup[]>(
    isAdmin
      ? [
          ...baseGroups,
          {
            label: "Platform",
            items: [
              { href: "/admin", label: "Trainers", icon: "lock" },
              { href: "/admin/clients", label: "All clients", icon: "users" },
              { href: "/admin/login-theme", label: "Login page", icon: "monitor" },
            ],
          },
          {
            label: "Email",
            items: [
              { href: "/admin/emails/templates", label: "Email templates", icon: "mail" },
              { href: "/admin/emails/outbox", label: "Outbox", icon: "send" },
            ],
          },
        ]
      : baseGroups,
  );

  /** Utility destinations sit at the foot of the sidebar, apart from the daily work. */
  const utility: NavGroup["items"] = [
    { href: "/feedback", label: "Feedback", icon: "comment" },
    { href: "/settings", label: "Settings", icon: "gear" },
  ];
  const live = apiMode === "live";
  const modeLabel = live ? "Live data" : "Demo data";

  /** Exact for "/" and "/admin", whose sub-pages have their own nav items. */
  const isActive = (href: string) =>
    ["/", "/admin"].includes(href) ? page.url.pathname === href : page.url.pathname.startsWith(href);

  /* Sidebar: wide screens collapse it to an icon rail by choice (remembered);
     narrow screens start as the rail (hidden on phones) and open the full menu
     over the page. */
  const RAIL_KEY = "pt.sidebar.rail";
  const narrowQuery = window.matchMedia("(max-width: 860px)");
  let narrow = $state(narrowQuery.matches);
  /* Phones hide the rail unless the trainer pins it (remembered). */
  const PHONE_RAIL_KEY = "pt.sidebar.phoneRail";
  const phoneQuery = window.matchMedia("(max-width: 640px)");
  let phone = $state(phoneQuery.matches);
  let keepRail = $state(localStorage.getItem(PHONE_RAIL_KEY) === "1");
  let collapsed = $state(localStorage.getItem(RAIL_KEY) === "1");
  let drawerOpen = $state(false);
  /* Holds the drawer layout while it retracts into the rail; cleared on animationend. */
  let drawerClosing = $state(false);
  const drawerShown = $derived(narrow && (drawerOpen || drawerClosing));
  /* Wide-screen collapse: the column shrinks first with the full menu still laid
     out (labels clipped by the narrowing edge), then the rail layout takes over. */
  let railSettling = $state(false);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  const rail = $derived(narrow ? !drawerShown : collapsed && !railSettling);
  /* Grid column width, separate from the layout so the column can animate first. */
  const slim = $derived(narrow || collapsed);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function settleRail() {
    clearTimeout(settleTimer);
    railSettling = false;
  }
  /* Gym-floor routes swap the top-bar toggle for a larger corner menu button
     on phones (≤640px), where the rail is hidden on every page. */
  const focusRoute = $derived(/^\/clients\/[^/]+\/log\/?$/.test(page.url.pathname));
  const sideOpen = $derived(!rail);

  function toggleKeepRail() {
    keepRail = !keepRail;
    localStorage.setItem(PHONE_RAIL_KEY, keepRail ? "1" : "0");
  }

  function closeDrawer() {
    if (!drawerOpen) return;
    drawerOpen = false;
    drawerClosing = true;
  }

  /* ⌘B on a Mac, Ctrl+B elsewhere (either works); text fields keep their own bold. */
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
  const shortcut = isMac ? "⌘B" : "Ctrl+B";
  const toggleLabel = $derived(`${sideOpen ? "Collapse" : "Expand"} menu (${shortcut})`);

  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") closeDrawer();
    if (bare || e.key.toLowerCase() !== "b" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const t = e.target as HTMLElement | null;
    if (t?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])")) return;
    e.preventDefault();
    toggleSide();
  }

  function toggleSide() {
    if (narrow) {
      if (drawerOpen) closeDrawer();
      else {
        drawerClosing = false;
        drawerOpen = true;
      }
    }
    else {
      collapsed = !collapsed;
      localStorage.setItem(RAIL_KEY, collapsed ? "1" : "0");
      settleRail();
      if (collapsed && !reducedMotion.matches) {
        railSettling = true;
        settleTimer = setTimeout(settleRail, 400); // in case transitionend never fires
      }
    }
  }

  $effect(() => {
    const onChange = (e: MediaQueryListEvent) => {
      narrow = e.matches;
      settleRail();
      drawerOpen = false;
      drawerClosing = false;
    };
    narrowQuery.addEventListener("change", onChange);
    return () => narrowQuery.removeEventListener("change", onChange);
  });

  $effect(() => {
    const onChange = (e: MediaQueryListEvent) => (phone = e.matches);
    phoneQuery.addEventListener("change", onChange);
    return () => phoneQuery.removeEventListener("change", onChange);
  });

  // Close the narrow-screen drawer after navigating.
  $effect(() => {
    void page.url.pathname;
    untrack(closeDrawer);
  });

  // Unread feedback badge: cheap count, refreshed on every navigation (no polling).
  afterNavigate(() => {
    if (!bare) feedbackUnread.refresh();
  });

  // The trainer's role labels, once — every picker and chip reads the shared store.
  $effect(() => {
    if (!bare) roleLabels.load();
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

{#snippet navItem(item: NavGroup["items"][number])}
  <Tooltip
    side="right"
    disabled={!rail}
    text={item.href === "/feedback" && feedbackUnread.count
      ? `${item.label} · ${feedbackUnread.count} unread`
      : item.label}
  >
    {#snippet children()}
  <a
    class="nav-item"
    class:active={isActive(item.href)}
    aria-current={isActive(item.href) ? "page" : undefined}
    href={item.href}
  >
    <Icon name={item.icon} />
    <span class="nav-text">{item.label}</span>
    {#if item.href === "/clients" && clientCount !== null}
      <span class="count">{clientCount}</span>
    {/if}
    {#if item.href === "/feedback" && feedbackUnread.count > 0}
      <span class="unread" aria-label="{feedbackUnread.count} unread">{feedbackUnread.count}</span>
    {/if}
  </a>
    {/snippet}
  </Tooltip>
{/snippet}

<svelte:window onkeydown={onKey} />

{#if bare}
  {@render children()}
{:else}
<div
  class="shell"
  class:rail
  class:slim
  ontransitionend={(e) => {
    if (e.target === e.currentTarget && e.propertyName === "grid-template-columns") settleRail();
  }}
  class:focus={focusRoute} class:drawer={drawerShown} class:closing={drawerClosing}
  class:keep-rail={keepRail && !focusRoute}>
  <aside
    class="side"
    id="sidebar"
    onanimationend={(e) => {
      if (e.target === e.currentTarget && drawerClosing) drawerClosing = false;
    }}
  >
    <div class="brand-row">
      <Tooltip side="right" disabled={!rail} text="Program Tracker">
        {#snippet children()}
          <a class="brand" href="/">
            <span class="mark" aria-hidden="true">PT</span>
            <span class="name">
              Program Tracker
              <small>Trainer workspace</small>
            </span>
          </a>
        {/snippet}
      </Tooltip>
      {#if phone && drawerShown && !focusRoute}
        <button
          type="button"
          class="pin"
          aria-pressed={keepRail}
          aria-label="Keep icon rail on phones"
          title={keepRail ? "Hide the icon rail when the menu closes" : "Keep the icon rail when the menu closes"}
          onclick={toggleKeepRail}
        >
          <Icon name="pin" />
        </button>
      {/if}
    </div>

    <nav class="nav primary" aria-label="Primary">
      {#each groups as group (group.label)}
        <div class="group" role="group" aria-label={group.label}>
          <div class="nav-label" aria-hidden="true">{group.label}</div>
          {#each group.items as item (item.href)}
            {@render navItem(item)}
          {/each}
        </div>
      {/each}
    </nav>

    <div class="foot">
      <nav class="nav" aria-label="Help and settings">
        <div class="group">
          {#each utility as item (item.href)}
            {@render navItem(item)}
          {/each}
        </div>
      </nav>

      {#if trainer}
        <AccountMenu {trainer} {live} {rail} onSignOut={signOut} />
      {:else}
        <div class="account" class:demo={!live}>
          <span class="mode-dot" title="{modeLabel} · v{__APP_VERSION__}" aria-hidden="true"></span>
          <span class="account-meta">{modeLabel} · <VersionLink build={__APP_VERSION__} fresh={whatsNew.unseen} /></span>
        </div>
      {/if}
    </div>
  </aside>

  <!-- A thin grab edge on the sidebar's border (wide screens). Mouse only:
       the toggle button and ⌘/Ctrl+B are the keyboard paths. -->
  {#if !narrow}
    <button
      type="button"
      class="edge"
      tabindex="-1"
      aria-label={sideOpen ? "Collapse menu" : "Expand menu"}
      title={toggleLabel}
      onclick={toggleSide}
    ></button>
  {/if}

  {#if narrow && drawerOpen}
    <button
      type="button"
      class="scrim"
      aria-label="Close menu"
      onclick={closeDrawer}
      in:fade={{ duration: 200 }}
      out:fade={{ duration: 160 }}
    ></button>
  {/if}

  <main class="main">
    <!-- The toggle shares the page's first line (shadcn's SidebarInset header). -->
    <div class="topbar">
      <button
        type="button"
        class="side-toggle"
        aria-controls="sidebar"
        aria-expanded={sideOpen}
        aria-label={sideOpen ? "Collapse menu" : "Expand menu"}
        aria-keyshortcuts={isMac ? "Meta+B" : "Control+B"}
        title={toggleLabel}
        onclick={toggleSide}
      >
        <Icon name="sidebar" />
      </button>
    </div>
    {#if focusRoute && !drawerOpen}
      <button
        type="button"
        class="focus-menu"
        aria-controls="sidebar"
        aria-expanded="false"
        aria-label="Open menu"
        onclick={toggleSide}
      >
        <Icon name="sidebar" />
      </button>
    {/if}
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
  /* Wide screens: the column eases between menu and rail and the page rides
     along. Expanding decelerates out; collapsing is quicker. */
  @media (min-width: 861px) and (prefers-reduced-motion: no-preference) {
    .shell { transition: grid-template-columns 260ms cubic-bezier(0.16, 1, 0.3, 1); }
    .shell.slim { transition-duration: 200ms; }
  }

  .side {
    grid-column: 1;
    grid-row: 1;
    background: var(--well);
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px;
    position: sticky;
    top: 0;
    height: 100vh;
    overflow: hidden; /* labels clip at the edge while the column animates; only the nav scrolls */
  }

  /* Edge rail: rides the column's right border (and its animation), 6px each
     side of the hairline; hover draws the line stronger. */
  .edge {
    grid-column: 1;
    grid-row: 1;
    justify-self: end;
    align-self: start;
    position: sticky;
    top: 0;
    z-index: 5;
    width: 12px;
    height: 100vh;
    margin-right: -6px;
    padding: 0;
    border: 0;
    background: none;
    cursor: ew-resize;
  }
  .edge::after {
    content: "";
    position: absolute;
    inset: 0 5px;
    background: var(--line-strong);
    opacity: 0;
    transition: opacity 120ms ease-out;
  }
  .edge:hover::after { opacity: 1; }
  @media (max-width: 860px) {
    .edge { display: none; }
  }

  /* Phone-only pin beside the brand: keeps the icon rail once the menu closes. */
  .pin {
    position: relative;
    display: grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    cursor: pointer;
    transition: background-color 120ms ease-out, color 120ms ease-out;
  }
  .pin::before { content: ""; position: absolute; inset: -6px; } /* 44px touch target */
  .pin :global(svg) { width: 16px; height: 16px; stroke-width: 1.6; }
  .pin:hover { background: var(--well-2); color: var(--ink); }
  .pin[aria-pressed="true"] { background: var(--active); color: var(--blue); }
  .pin:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }

  /* Header: a switcher-style brand row. */
  .brand-row {
    flex: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }
  /* Brand and page title share one line (y=40): the main column's 28px top
     padding sets the title lower than the sidebar's 8px. Narrow screens pad
     the page 20px, which already lines up. */
  @media (min-width: 861px) {
    .brand-row { margin-top: 8px; }
  }
  /* The toggle shares the page's first line, set inline before the title (or
     crumbs) behind a hairline divider, as in shadcn's inset header. */
  .topbar {
    float: left;
    display: flex;
    align-items: center;
    gap: 12px;
    height: 28px;
    margin: -2px 12px 0 -6px;
  }
  .topbar::after {
    content: "";
    width: 1px;
    height: 16px;
    background: var(--line);
  }
  /* Crumbs are shorter than the toggle: the title block below them clears it
     instead of shifting right beside it. */
  .main :global(.crumbs + *) { clear: left; }
  /* Crumbs ride the toggle's 28px line (centre y=40, like the brand); the
     title below keeps its place. */
  .main > :global(.crumbs) { line-height: 28px; margin: -2px 0 0; }
  .side-toggle {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    flex: none;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--muted);
    cursor: pointer;
    transition: background-color 120ms ease-out, color 120ms ease-out;
  }
  .side-toggle :global(svg) { width: 16px; height: 16px; stroke-width: 1.6; }
  .side-toggle:hover { background: var(--well-2); color: var(--ink); }
  .side-toggle:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }

  /* 4px inline padding centres the 32px mark on the nav icon column (x=28). */
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 0;
    height: 48px;
    padding: 8px 4px;
    text-decoration: none;
    border-radius: 8px;
    transition: background-color 120ms ease-out;
  }
  .brand:hover { background: var(--well-2); text-decoration: none; }
  .brand:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
  .mark {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--hover-ink);
    color: var(--on-ink);
    display: grid;
    place-items: center;
    font: 600 12px/1 var(--font-ui);
    letter-spacing: 0.02em;
    flex: none;
  }
  .name {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    white-space: nowrap; /* no rewrapping while the column animates */
    font: 600 14px/1.2 var(--font-ui);
    color: var(--ink);
  }
  .name small {
    font: 400 12px/1.2 var(--font-ui);
    color: var(--muted);
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  /* Header and foot stay put; a long admin nav scrolls between them. The
     scroll box reaches into the side padding so focus rings aren't clipped. */
  .nav.primary {
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    margin: -4px -8px;
    padding: 4px 8px;
    scrollbar-width: thin;
    /* Thumb stays invisible until the nav is in use; the gutter keeps its
       width so nothing shifts when it appears. */
    scrollbar-color: transparent transparent;
    transition: scrollbar-color 160ms;
  }
  .nav.primary:hover,
  .nav.primary:focus-within {
    scrollbar-color: var(--line-strong) transparent;
  }
  .group {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  /* Sentence-case group label, quiet: it names the group, it doesn't shout. */
  .nav-label {
    display: flex;
    align-items: center;
    height: 32px;
    padding: 0 12px;
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    position: relative;
    transition: color 150ms ease-out;
  }
  /* Rows sit 8px in from the edge; 12px inner padding puts icons at x=20,
     where the rail centres them, so the drawer unfolds around still icons. */
  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px;
    border-radius: 6px;
    text-decoration: none;
    font: 400 14px/1.4 var(--font-ui);
    color: var(--ink);
    white-space: nowrap;
    transition: background-color 120ms ease-out;
  }
  /* Icons share the label's ink, as in shadcn; grey icons read as disabled. */
  .nav-item :global(svg) {
    width: 16px;
    height: 16px;
    color: var(--ink);
    stroke-width: 1.75;
    flex: none;
    transition: color 120ms ease-out;
  }
  .nav-item:hover { background: var(--well-2); text-decoration: none; }
  .nav-item:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
  .nav-item.active { background: var(--active); font-weight: 500; }
  .nav-text { overflow: hidden; text-overflow: ellipsis; }
  .unread {
    margin-left: auto;
    font: 600 11px/18px var(--font-ui);
    font-variant-numeric: tabular-nums;
    color: var(--on-ink);
    background: var(--blue);
    border-radius: 99px;
    padding: 0 6px;
    min-width: 18px;
    text-align: center;
  }
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

  /* Foot: utility links, then the account menu (or, with auth off, the data mode and build). */
  .foot {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .account {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 48px;
    padding: 8px 4px;
  }
  .mode-dot {
    border-radius: 99px;
    background: var(--green-btn);
    flex: none;
  }
  /* Open mode has no avatar: the dot stands in the icon column (centre x=28). */
  .mode-dot { width: 8px; height: 8px; margin: 0 8px 0 12px; }
  .account.demo .mode-dot { background: var(--warn); }
  .account-meta {
    font: 400 12px/1.3 var(--font-ui);
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .nav-item, .nav-item :global(svg), .side-toggle, .brand, .edge::after, .nav-label { transition: none; }
  }

  .main {
    grid-column: 2; /* stays put when the narrow-screen menu floats out of the grid */
    /* Anchored to the sidebar: centering left a dead strip between nav and
       content on wide screens. Extra width falls to the right edge. */
    padding: 28px 40px 64px;
    max-width: calc(var(--page-max) + 80px);
    width: 100%;
    min-width: 0; /* grid child: let content shrink instead of forcing min-content width */
    /* Pages size their columns to the room left beside the sidebar (wide,
       rail or drawer), not to the viewport. */
    container: main / inline-size;
  }

  /* layout placement for the global note component */
  .main :global(.demo-banner) {
    padding: 8px 16px;
    margin-bottom: 22px;
    max-width: 100%;
  }

  /* Icon rail: chosen on wide screens, the default on narrow ones. The 39px
     content box centres 32px buttons at x=11.5, so 16px icons land on x=20. */
  .shell.slim { grid-template-columns: 56px 1fr; }
  .rail .nav.primary { scrollbar-width: none; } /* a scrollbar would eat the 56px rail */
  .rail .nav.primary::-webkit-scrollbar { display: none; }
  /* Rows keep their open-menu heights on the rail, so icons hold the same y
     both ways and the toggle only moves things sideways. */
  .rail .brand { flex: none; width: 32px; height: 48px; padding: 8px 0; }
  /* Rail tooltip anchors span the column and reach into the side padding, so
     bubbles clear the border while the 32px buttons stay centred on x=20. */
  .rail .side :global(.anchor) {
    align-self: stretch;
    justify-content: center;
    padding-right: 8px;
    margin-right: -8px;
  }
  /* The group label keeps its 32px slot: the text fades and a short divider
     on the icon column marks the group. */
  /* The brand row is a flex row, so its anchor doesn't stretch across like the
     nav's: fill the row so the mark centres on the icon column with the rest. */
  .rail .brand-row :global(.anchor) { flex: 1; }
  .rail .nav-label { color: transparent; }
  .rail .nav-label::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 16px;
    height: 1px;
    background: var(--line-strong);
    transform: translate(-50%, -50%);
  }
  .rail .nav-item { justify-content: center; width: 32px; padding: 0; margin-inline: auto; }
  /* Labels leave the layout but keep naming the link for assistive tech. */
  .rail .name,
  .rail .nav-text {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  .rail .count, .rail .account-meta { display: none; }
  .rail .account { flex-direction: column; gap: 8px; padding: 8px 0; }
  .rail .mode-dot { margin: 0; }
  /* On the icon rail the unread count shrinks to a dot on the icon. */
  .rail .nav-item { position: relative; }
  .rail .unread {
    position: absolute;
    top: 5px;
    right: 6px;
    width: 8px;
    height: 8px;
    min-width: 0;
    padding: 0;
    font-size: 0;
    box-shadow: 0 0 0 2px var(--well);
  }

  /* Narrow screens: the open menu floats over the page instead of squeezing it. */
  .drawer .side {
    position: fixed;
    left: 0;
    width: 236px;
    z-index: 40;
    box-shadow: var(--shadow-overlay);
    /* The rail unfolds: the clip edge starts at the rail's 56px and pulls out to
       full width. Icons sit at x=20 in both layouts, so they hold still while
       the labels are uncovered. The end inset goes negative to let the shadow out. */
    --rail-w: 56px;
    animation: drawer-unfold 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .drawer.closing .side {
    animation: drawer-retract 180ms cubic-bezier(0.4, 0, 1, 1) forwards;
  }
  @keyframes drawer-unfold {
    from { clip-path: inset(0 calc(100% - var(--rail-w)) 0 0); }
    to { clip-path: inset(0 -32px 0 0); }
  }
  @keyframes drawer-retract {
    from { clip-path: inset(0 -32px 0 0); }
    to { clip-path: inset(0 calc(100% - var(--rail-w)) 0 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    /* No travel: the open menu crossfades in and out over the rail. */
    .drawer .side { animation: drawer-fade-in 120ms ease-out; }
    .drawer.closing .side { animation: drawer-fade-out 100ms ease-in forwards; }
    @keyframes drawer-fade-in { from { opacity: 0; } }
    @keyframes drawer-fade-out { to { opacity: 0; } }
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 39;
    border: 0;
    padding: 0;
    background: var(--scrim);
    cursor: default;
  }

  @media (max-width: 860px) {
    .main { padding: 20px 16px 56px; }
  }

  .focus-menu { display: none; }
  /* Phones give every page the full width: the rail hides and the menu
     button (top bar, or the corner on gym-floor routes) opens the drawer. */
  @media (max-width: 640px) {
    .shell:not(.keep-rail).slim { grid-template-columns: 0 1fr; }
    .shell:not(.keep-rail).rail .side { display: none; }
    .shell:not(.keep-rail).drawer .side { --rail-w: 0px; } /* no rail here: unfold from the screen edge */
    /* 44px touch target around the 28px toggle, without moving the title line. */
    .side-toggle { position: relative; }
    .side-toggle::before { content: ""; position: absolute; inset: -8px; }
    .shell.focus .main { padding: 12px 12px 56px; }
    .shell.focus .topbar { display: none; } /* the corner menu button covers it here */
    .focus-menu {
      display: grid;
      place-items: center;
      float: right;
      width: 44px;
      height: 44px;
      margin: -4px -4px 0 8px;
      color: var(--muted);
      background: var(--well);
      border: 1px solid var(--line);
      border-radius: 6px;
      cursor: pointer;
    }
    .focus-menu :global(svg) { width: 18px; height: 18px; }
  }
</style>
