<script lang="ts">
  import { tick, untrack } from "svelte";
  import { page } from "$app/state";
  import { replaceState } from "$app/navigation";
  import { feedbackHandle, type FeedbackItem } from "@pt/shared";
  import Pill from "$lib/ui/Pill.svelte";
  import Author from "./Author.svelte";
  import Thread from "./Thread.svelte";
  import { feedbackApi } from "./client";
  import { locateTarget } from "./locate";
  import { feedbackMode } from "./mode.svelte";
  import { STATUS_LABEL, STATUS_TONE } from "./status";

  /**
   * Existing feedback on the current page. In feedback mode, open items show
   * as handle pins on their elements so nobody files the same thing twice;
   * `?fbshow=<id>` (the "Show me" link) points at one item's element once.
   * Rendered inside the feedback layer, so the picker and screenshots skip it.
   */
  let {
    active,
    openId = $bindable<string | null>(null),
    unplaced = $bindable<FeedbackItem[]>([]),
    reload = 0,
    onopen,
  }: {
    /** Pins show only while feedback mode is on and off the review page. */
    active: boolean;
    /** Item whose popover is open. */
    openId?: string | null;
    /** Items for this page whose element could not be found. */
    unplaced?: FeedbackItem[];
    /** Bump to refetch (e.g. after a new item is sent). */
    reload?: number;
    onopen?: () => void;
  } = $props();

  /** Rough pin width — collided pins step left by this much. */
  const PIN_W = 60;

  let items = $state<FeedbackItem[]>([]);
  let placed = $state<{ item: FeedbackItem; el: Element }[]>([]);
  /** Bumped on scroll/resize so pin positions re-read their element rects. */
  let frame = $state(0);

  const routeId = $derived(page.route.id);
  const open = $derived(placed.find((p) => p.item.id === openId) ?? null);

  // Load open items for this route whenever pins turn on or the route changes.
  $effect(() => {
    if (!active) {
      items = [];
      placed = [];
      unplaced = [];
      openId = null;
      return;
    }
    const id = routeId;
    void reload;
    let cancelled = false;
    feedbackApi
      .list(["new", "accepted"])
      .then((all) => {
        if (!cancelled) items = all.filter((i) => i.context.route.id === id);
      })
      .catch(() => {
        if (!cancelled) items = [];
      });
    return () => {
      cancelled = true;
    };
  });

  function place() {
    const found: typeof placed = [];
    const missing: FeedbackItem[] = [];
    for (const item of items) {
      const el = locateTarget(item.context.target);
      if (el && !el.closest("[data-feedback-ui]")) found.push({ item, el });
      // Items filed on another client's copy of this page only pin when they match.
      else if (item.context.route.path === page.url.pathname + page.url.search) missing.push(item);
    }
    placed = found;
    unplaced = missing;
  }

  // Pages render data after navigation: place now, then again as the DOM settles.
  $effect(() => {
    if (!active || items.length === 0) {
      placed = [];
      unplaced = [];
      return;
    }
    void items;
    untrack(place);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const mo = new MutationObserver((records) => {
      if (records.every((r) => (r.target as Element).closest?.("[data-feedback-ui]"))) return;
      clearTimeout(timer);
      timer = setTimeout(place, 250);
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => {
      mo.disconnect();
      clearTimeout(timer);
    };
  });

  $effect(() => {
    if (!active && !showing) return;
    const bump = () => (frame += 1);
    window.addEventListener("scroll", bump, { capture: true, passive: true });
    window.addEventListener("resize", bump);
    return () => {
      window.removeEventListener("scroll", bump, { capture: true });
      window.removeEventListener("resize", bump);
    };
  });

  /** Pin anchors at each element's top-right corner, nudged left when they collide. */
  const pins = $derived.by(() => {
    void frame;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const out: { item: FeedbackItem; x: number; y: number }[] = [];
    for (const { item, el } of placed) {
      const r = el.getBoundingClientRect();
      if (!el.isConnected || r.width === 0 || r.bottom < 0 || r.top > vh) continue;
      let x = Math.min(r.right, vw - 8);
      const y = Math.max(r.top, 8);
      while (out.some((p) => Math.abs(p.x - x) < 12 && Math.abs(p.y - y) < 12)) x -= PIN_W;
      out.push({ item, x, y });
    }
    return out;
  });

  const popPos = $derived.by(() => {
    void frame;
    const pin = pins.find((p) => p.item.id === openId);
    if (!pin) return null;
    const W = 360;
    const left = Math.min(Math.max(8, pin.x - W + 24), window.innerWidth - W - 8);
    const below = pin.y < window.innerHeight / 2;
    return below
      ? `left:${left}px; top:${pin.y + 18}px; max-height:${window.innerHeight - pin.y - 34}px`
      : `left:${left}px; bottom:${window.innerHeight - pin.y + 18}px; max-height:${pin.y - 26}px`;
  });

  function toggle(id: string) {
    openId = openId === id ? null : id;
    if (openId) onopen?.();
  }

  // Close the popover on an outside click.
  $effect(() => {
    if (!openId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t?.closest?.(".tpop, .tpin")) openId = null;
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  });

  // ---- "Show me": /some/page?fbshow=<id> ----------------------------------

  let showing = $state<{ el: Element; handle: string } | null>(null);
  let missMsg = $state<string | null>(null);
  const showRect = $derived.by(() => {
    void frame;
    return showing?.el.isConnected ? showing.el.getBoundingClientRect() : null;
  });

  $effect(() => {
    const id = page.url.searchParams.get("fbshow");
    if (!id) return;
    let cancelled = false;
    untrack(() => jump(id, () => cancelled));
    return () => {
      cancelled = true;
    };
  });

  async function jump(id: string, cancelled: () => boolean) {
    const url = new URL(page.url);
    url.searchParams.delete("fbshow");
    let item: FeedbackItem;
    try {
      item = await feedbackApi.get(id);
    } catch {
      miss("That feedback item is gone or not yours to see.");
      return;
    }
    const handle = feedbackHandle(item.number);
    // The page may still be loading its data: retry for ~3s.
    let el: Element | null = null;
    for (let i = 0; i < 20 && !cancelled(); i++) {
      await tick();
      el = locateTarget(item.context.target, { loose: item.context.route.path === url.pathname + url.search });
      if (el) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (cancelled()) return;
    replaceState(url, page.state);
    if (!el) {
      miss(`Couldn't find ${handle} here — the page has changed since.`);
      return;
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    showing = { el, handle };
    setTimeout(() => {
      if (showing?.el === el) showing = null;
    }, 3200);
  }

  function miss(text: string) {
    missMsg = text;
    setTimeout(() => (missMsg = null), 4500);
  }
</script>

{#each pins as pin (pin.item.id)}
  <button
    type="button"
    class="tpin"
    class:on={pin.item.id === openId}
    class:unread={pin.item.unread}
    style="left:{pin.x}px; top:{pin.y}px"
    aria-label="{feedbackHandle(pin.item.number)}: {pin.item.comment.slice(0, 40)}"
    aria-expanded={pin.item.id === openId}
    onclick={() => toggle(pin.item.id)}
  >
    {feedbackHandle(pin.item.number)}
  </button>
{/each}

{#if open && popPos}
  {@const item = open.item}
  <div class="tpop" style={popPos} role="dialog" aria-label="Feedback {feedbackHandle(item.number)}">
    <div class="head">
      <span class="handle">{feedbackHandle(item.number)}</span>
      <Pill tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Pill>
      <Author author={item.author} />
      <a class="more" href="/feedback#{feedbackHandle(item.number)}">Open in Feedback</a>
    </div>
    <blockquote>{item.comment}</blockquote>
    {#key item.id}
      <Thread {item} />
    {/key}
  </div>
{/if}

{#if showing && showRect}
  <div
    class="ring"
    style="left:{showRect.left - 4}px; top:{showRect.top - 4}px; width:{showRect.width + 8}px; height:{showRect.height + 8}px"
    aria-hidden="true"
  >
    <span class="ring-tag">{showing.handle}</span>
  </div>
{/if}

{#if missMsg}
  <p class="miss" role="status">{missMsg}</p>
{/if}

<style>
  .tpin {
    position: fixed;
    z-index: 9997;
    transform: translate(-100%, -50%);
    font: 600 11px/1 var(--font-mono);
    padding: 4px 6px;
    border-radius: 99px 99px 99px 4px;
    border: 1px solid var(--surface);
    background: var(--hover-ink);
    color: var(--on-ink);
    box-shadow: var(--shadow-overlay);
    cursor: pointer;
  }
  .tpin.unread::after {
    content: "";
    position: absolute;
    top: -3px;
    right: -3px;
    width: 8px;
    height: 8px;
    border-radius: 99px;
    background: var(--blue);
    box-shadow: 0 0 0 2px var(--surface);
  }
  .tpin:hover,
  .tpin.on {
    background: var(--blue);
  }
  .tpin:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
  .tpop {
    position: fixed;
    z-index: 9999;
    width: 360px;
    max-width: calc(100vw - 16px);
    overflow: auto;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow-overlay);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    font: 400 14px/1.5 var(--font-ui);
    color: var(--ink);
  }
  .head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 8px;
  }
  .handle {
    font: 600 13px/1 var(--font-mono);
  }
  .more {
    margin-left: auto;
    font-size: 12px;
  }
  blockquote {
    margin: 0;
    padding: 2px 0 2px 10px;
    border-left: 3px solid var(--line-strong);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .ring {
    position: fixed;
    z-index: 9998;
    pointer-events: none;
    border-radius: 6px;
    outline: 3px solid var(--blue);
    animation: pulse 1s ease-out 3;
  }
  .ring-tag {
    position: absolute;
    left: -3px;
    bottom: 100%;
    margin-bottom: 6px;
    background: var(--blue);
    color: var(--on-ink);
    font: 600 11px/1 var(--font-mono);
    padding: 4px 6px;
    border-radius: 4px;
  }
  @keyframes pulse {
    from {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--blue) 45%, transparent);
    }
    to {
      box-shadow: 0 0 0 14px color-mix(in srgb, var(--blue) 0%, transparent);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring {
      animation: none;
    }
  }
  .miss {
    position: fixed;
    z-index: 9999;
    left: 50%;
    bottom: 64px;
    transform: translateX(-50%);
    margin: 0;
    background: var(--hover-ink);
    color: var(--on-ink);
    font: 500 13px/1.4 var(--font-ui);
    padding: 8px 12px;
    border-radius: 8px;
    box-shadow: var(--shadow-overlay);
  }
</style>
