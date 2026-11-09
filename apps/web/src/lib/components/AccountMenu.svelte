<script lang="ts">
  /**
   * The sidebar foot's account row (shadcn NavUser): the trainer, data mode and
   * build in one trigger that opens a small menu — What's new, theme, sign out.
   * The menu is `position: fixed` off the trigger's rect because the sidebar
   * clips overflow: it opens upward from the full sidebar, to the right of the rail.
   */
  import { tick, untrack } from "svelte";
  import { page } from "$app/state";
  import type { SessionTrainer } from "$lib/api/auth";
  import Icon, { type IconName } from "$lib/ui/Icon.svelte";
  import Tooltip from "$lib/ui/Tooltip.svelte";
  import { theme, type ThemePref } from "$lib/theme.svelte";
  import { whatsNew } from "$lib/whatsNew.svelte";

  interface Props {
    trainer: SessionTrainer;
    /** Live backend (green dot) or demo data (amber dot). */
    live: boolean;
    /** The sidebar is the icon rail: show only the avatar, open the menu to the right. */
    rail?: boolean;
    onSignOut: () => void;
    /** Build id, e.g. "0.1.9+42a93f5". */
    build?: string;
    /** Override the What's-new unread state (stories). */
    fresh?: boolean;
  }

  let { trainer, live, rail = false, onSignOut, build = __APP_VERSION__, fresh }: Props = $props();

  const id = $props.id();
  const menuId = `account-menu-${id}`;
  const unseen = $derived(fresh ?? whatsNew.unseen);
  const modeLabel = $derived(live ? "Live data" : "Demo data");
  const version = $derived(build.split("+")[0]);
  const initial = $derived(trainer.name.trim().charAt(0).toUpperCase() || "?");

  const themes: { value: ThemePref; label: string; icon: IconName }[] = [
    { value: "system", label: "System", icon: "monitor" },
    { value: "light", label: "Light", icon: "sun" },
    { value: "dark", label: "Dark", icon: "moon" },
  ];

  let trigger = $state<HTMLButtonElement>();
  let menu = $state<HTMLDivElement>();
  let open = $state(false);
  let pos = $state({ left: 0, bottom: 0 });

  function place() {
    if (!trigger) return;
    const r = trigger.getBoundingClientRect();
    pos = rail
      ? { left: (trigger.closest("aside") ?? trigger).getBoundingClientRect().right + 8, bottom: Math.max(8, window.innerHeight - r.bottom) }
      : { left: r.left, bottom: window.innerHeight - r.top + 4 };
  }

  const items = () => [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];

  async function show() {
    place();
    open = true;
    await tick();
    items()[0]?.focus();
  }

  function close(refocus = true) {
    if (!open) return;
    open = false;
    if (refocus) trigger?.focus();
  }

  function onMenuKey(e: KeyboardEvent) {
    const list = items();
    const at = list.indexOf(document.activeElement as HTMLElement);
    const radio = (document.activeElement as HTMLElement | null)?.getAttribute("role") === "menuitemradio";
    let next: number | null = null;
    if (e.key === "ArrowDown") next = (at + 1) % list.length;
    else if (e.key === "ArrowUp") next = (at - 1 + list.length) % list.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = list.length - 1;
    else if (radio && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      const radios = list.filter((el) => el.getAttribute("role") === "menuitemradio");
      const i = radios.indexOf(document.activeElement as HTMLElement);
      const step = e.key === "ArrowRight" ? 1 : -1;
      next = list.indexOf(radios[(i + step + radios.length) % radios.length]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // the drawer listens for Escape on window; close only the menu
      close();
      return;
    } else if (e.key === "Tab") {
      e.preventDefault();
      close();
      return;
    }
    if (next !== null) {
      e.preventDefault();
      list[next]?.focus();
    }
  }

  // Outside press and resize close it; scrolling the page under it does too.
  $effect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu?.contains(t) && !trigger?.contains(t)) close(false);
    };
    const onResize = () => close(false);
    const onScroll = (e: Event) => {
      if (!menu?.contains(e.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, { capture: true });
    };
  });

  // Navigating (What's new, or anywhere) closes it.
  $effect(() => {
    void page.url.pathname;
    untrack(() => close(false));
  });
</script>

{#snippet avatar()}
  <span class="avatar" class:demo={!live}>
    {#if trainer.avatarUrl}
      <img src={trainer.avatarUrl} alt="" referrerpolicy="no-referrer" />
    {:else}
      <span class="initial" aria-hidden="true">{initial}</span>
    {/if}
    <span class="status" aria-hidden="true"></span>
  </span>
{/snippet}

<Tooltip side="right" disabled={!rail || open} text="{trainer.name} · {modeLabel}">
  {#snippet children()}
<button
  type="button"
  class="trigger"
  class:rail
  class:open
  bind:this={trigger}
  aria-haspopup="menu"
  aria-expanded={open}
  aria-controls={open ? menuId : undefined}
  aria-label="{trainer.name}, {modeLabel}, v{version}{unseen ? ', new release' : ''} — account menu"
  onclick={() => (open ? close() : show())}
>
  {@render avatar()}
  <span class="text">
    <span class="name">{trainer.name}</span>
    <span class="meta">{modeLabel} · v{version}{#if unseen}<span class="new" aria-hidden="true"></span>{/if}</span>
  </span>
  <Icon name="chevrons-up-down" />
</button>
  {/snippet}
</Tooltip>

{#if open}
  <div
    class="menu"
    id={menuId}
    role="menu"
    tabindex="-1"
    aria-label="Account"
    bind:this={menu}
    style:left="{pos.left}px"
    style:bottom="{pos.bottom}px"
    onkeydown={onMenuKey}
  >
    <div class="who">
      {@render avatar()}
      <span class="text">
        <span class="name">{trainer.name}</span>
        <span class="meta">{trainer.email}</span>
      </span>
    </div>
    <div class="sep" role="separator"></div>
    <a class="item" role="menuitem" tabindex="-1" href="/whats-new">
      <Icon name="sparkle" />
      <span>What's new</span>
      <span class="aside">v{build}{#if unseen}<span class="new" aria-label="unread"></span>{/if}</span>
    </a>
    <div class="theme" role="group" aria-label="Theme">
      <span class="theme-label" aria-hidden="true">Theme</span>
      <span class="seg">
        {#each themes as t (t.value)}
          <button
            type="button"
            class="seg-btn"
            role="menuitemradio"
            tabindex="-1"
            aria-checked={theme.pref === t.value}
            aria-label="{t.label} theme"
            title={t.label}
            onclick={() => theme.set(t.value)}
          >
            <Icon name={t.icon} />
          </button>
        {/each}
      </span>
    </div>
    <div class="sep" role="separator"></div>
    <button
      type="button"
      class="item"
      role="menuitem"
      tabindex="-1"
      onclick={() => {
        close(false);
        onSignOut();
      }}
    >
      <Icon name="signout" />
      <span>Sign out</span>
    </button>
  </div>
{/if}

<style>
  /* Trigger: one 48px row; 4px inline padding puts the 32px avatar on the nav icon column. */
  .trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
    height: 48px;
    padding: 8px 4px;
    border: 0;
    border-radius: 6px;
    background: none;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: background-color 120ms ease-out;
  }
  .trigger:hover,
  .trigger.open { background: var(--well-2); }
  .trigger:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--focus); }
  .trigger > :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
    margin-right: 4px;
    color: var(--muted);
    stroke-width: 1.6;
  }
  .trigger.rail {
    width: 32px;
    height: 32px;
    padding: 0;
    margin-inline: auto;
    justify-content: center;
  }
  .trigger.rail .text,
  .trigger.rail > :global(svg) { display: none; }

  .avatar {
    position: relative;
    flex: none;
    width: 32px;
    height: 32px;
  }
  .avatar img,
  .initial {
    display: block;
    width: 32px;
    height: 32px;
    border-radius: 8px;
  }
  .initial {
    display: grid;
    place-items: center;
    background: var(--muted);
    color: var(--on-ink);
    font: 600 13px/1 var(--font-ui);
  }
  /* Data mode rides on the avatar so it survives the collapsed rail. */
  .status {
    position: absolute;
    right: -2px;
    bottom: -2px;
    width: 9px;
    height: 9px;
    border-radius: 99px;
    background: var(--green-btn);
    box-shadow: 0 0 0 2px var(--well);
    transition: box-shadow 120ms ease-out;
  }
  .avatar.demo .status { background: var(--warn); }
  .trigger:hover .status,
  .trigger.open .status { box-shadow: 0 0 0 2px var(--well-2); }
  .menu .status { box-shadow: 0 0 0 2px var(--bg); }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .name,
  .meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .name { font: 500 13px/1.3 var(--font-ui); color: var(--ink); }
  .meta { font: 400 12px/1.3 var(--font-ui); color: var(--muted); }
  .new {
    display: inline-block;
    width: 6px;
    height: 6px;
    margin-left: 5px;
    border-radius: 99px;
    background: var(--blue);
    vertical-align: 1px;
  }

  .menu {
    position: fixed;
    z-index: 50;
    width: 240px;
    padding: 4px;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: var(--shadow-overlay);
    animation: menu-in 140ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .menu:focus { outline: none; }
  @keyframes menu-in {
    from { opacity: 0; transform: translateY(4px); }
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
  }
  .sep {
    height: 1px;
    margin: 4px -4px;
    background: var(--line);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 32px;
    padding: 0 8px;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--ink);
    font: 400 14px/1 var(--font-ui);
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }
  .item :global(svg) {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--muted);
    stroke-width: 1.6;
  }
  .item:hover,
  .item:focus-visible,
  .item:focus { background: var(--well-2); text-decoration: none; outline: none; }
  .item:hover :global(svg),
  .item:focus :global(svg) { color: var(--ink); }
  .aside {
    margin-left: auto;
    font: 400 12px/1 var(--font-mono);
    color: var(--muted);
    white-space: nowrap;
  }

  .theme {
    display: flex;
    align-items: center;
    height: 36px;
    padding: 0 4px 0 8px;
  }
  .theme-label { font: 400 14px/1 var(--font-ui); color: var(--ink); }
  .seg {
    margin-left: auto;
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .seg-btn {
    display: grid;
    place-items: center;
    width: 26px;
    height: 24px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .seg-btn :global(svg) { width: 14px; height: 14px; stroke-width: 1.7; }
  .seg-btn:hover { color: var(--ink); }
  .seg-btn:focus { outline: none; box-shadow: 0 0 0 2px var(--focus); }
  .seg-btn[aria-checked="true"] {
    background: var(--bg);
    color: var(--ink);
    box-shadow: 0 0 0 1px var(--line);
  }
  .seg-btn[aria-checked="true"]:focus { box-shadow: 0 0 0 2px var(--focus); }

  @media (prefers-reduced-motion: reduce) {
    .trigger, .status { transition: none; }
    .menu { animation: none; }
  }
</style>
