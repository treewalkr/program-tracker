<script lang="ts">
  import { tick, untrack } from "svelte";
  import { page } from "$app/state";
  import { feedbackMode } from "./mode.svelte";
  import { buildContext, chainOf, isFeedbackUi, shortPath, sourceLabel } from "./capture";
  import { feedbackApi } from "./client";
  import TicketPins from "./TicketPins.svelte";
  import { feedbackHandle, type FeedbackItem } from "@pt/shared";

  /**
   * Feedback mode overlay, mounted once in the root layout. While picking,
   * every click in the app is intercepted (capture phase, before the app's own
   * handlers) and pins a comment form to the clicked element.
   */

  const FORM_W = 340;
  /** Server rejects images over 4 MB; stay under it after base64 overhead. */
  const MAX_DATA_URL = 5_000_000;

  let hovered = $state<Element | null>(null);
  let selected = $state<Element | null>(null);
  let hoverRect = $state<DOMRect | null>(null);
  let selRect = $state<DOMRect | null>(null);
  let comment = $state("");
  let includePage = $state(true);
  let sending = $state(false);
  let error = $state<string | null>(null);
  let toast = $state<string | null>(null);
  let textarea = $state<HTMLTextAreaElement>();
  /** Existing-item pins: which popover is open, which items could not be placed. */
  let pinOpen = $state<string | null>(null);
  let unplaced = $state<FeedbackItem[]>([]);
  let showUnplaced = $state(false);

  /** The review page is where feedback gets triaged — never pick there. */
  const onReviewPage = $derived(page.url.pathname.startsWith("/feedback"));
  const picking = $derived(feedbackMode.picking && !onReviewPage);

  const hoverLabel = $derived(hovered ? sourceLabel(hovered) : "");
  const selLabel = $derived(selected ? sourceLabel(selected) : "");
  const selVia = $derived(
    selected ? chainOf(selected, 3).map((e) => `${shortPath(e.file)}:${e.line}`) : [],
  );

  const formPos = $derived.by(() => {
    if (!selRect) return null;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const below = vh - selRect.bottom > 280 || selRect.top < 280;
    const left = Math.min(Math.max(8, selRect.left), vw - FORM_W - 8);
    return below
      ? `left:${left}px; top:${Math.min(selRect.bottom + 8, vh - 280)}px`
      : `left:${left}px; bottom:${vh - selRect.top + 8}px`;
  });

  function measure() {
    hoverRect = hovered?.isConnected ? hovered.getBoundingClientRect() : null;
    selRect = selected?.isConnected ? selected.getBoundingClientRect() : null;
  }

  async function select(el: Element) {
    selected = el;
    hovered = null;
    error = null;
    measure();
    await tick();
    textarea?.focus();
  }

  function widen() {
    const parent = selected?.parentElement;
    if (parent && parent !== document.body) select(parent);
  }

  function close() {
    selected = null;
    comment = "";
    error = null;
    measure();
  }

  function exit() {
    close();
    hovered = null;
    feedbackMode.set(false);
  }

  // Picker: capture-phase listeners run before any app handler.
  $effect(() => {
    if (!picking) {
      hovered = null;
      return;
    }
    const block = (e: Event) => {
      if (isFeedbackUi(e.target as Node)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onMove = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || isFeedbackUi(t) || t === document.documentElement || t === document.body) {
        hovered = null;
      } else if (t !== hovered) {
        hovered = t;
      }
      measure();
    };
    const onClick = (e: MouseEvent) => {
      if (isFeedbackUi(e.target as Node)) return;
      block(e);
      const t = e.target as Element | null;
      if (t && t !== document.documentElement && t !== document.body) select(t);
    };
    const blocked = ["pointerdown", "mousedown", "pointerup", "mouseup", "dblclick", "auxclick", "submit"];
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("click", onClick, true);
    for (const ev of blocked) document.addEventListener(ev, block, true);
    document.documentElement.classList.add("feedback-picking");
    return () => {
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("click", onClick, true);
      for (const ev of blocked) document.removeEventListener(ev, block, true);
      document.documentElement.classList.remove("feedback-picking");
    };
  });

  // Keep outlines glued to their elements through scroll and resize.
  $effect(() => {
    if (!feedbackMode.on) return;
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  });

  // Esc closes the form, then leaves feedback mode.
  $effect(() => {
    if (!feedbackMode.on) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      if (pinOpen) pinOpen = null;
      else if (showUnplaced) showUnplaced = false;
      else if (selected) close();
      else exit();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  });

  // Navigating away drops a half-written pin on a stale element.
  $effect(() => {
    void page.url.pathname;
    untrack(() => {
      close();
      hovered = null;
    });
  });

  async function shoot(node: HTMLElement, kind: "element" | "page"): Promise<string | undefined> {
    try {
      const { domToPng, domToJpeg } = await import("modern-screenshot");
      const filter = (n: Node) => !isFeedbackUi(n);
      // Capture on the page canvas so dark-theme shots don't get a white backdrop.
      const backgroundColor = getComputedStyle(document.body).backgroundColor;
      const url =
        kind === "element"
          ? await domToPng(node, { scale: Math.min(window.devicePixelRatio, 2), backgroundColor, filter })
          : await domToJpeg(node, { scale: 1, quality: 0.7, backgroundColor, filter });
      return url.length < MAX_DATA_URL ? url : undefined;
    } catch {
      // A failed screenshot never blocks the comment itself.
      return undefined;
    }
  }

  async function send() {
    const el = selected;
    if (!el || !comment.trim() || sending) return;
    sending = true;
    error = null;
    try {
      const context = buildContext(
        el,
        {
          path: page.url.pathname + page.url.search,
          routeId: page.route.id,
          params: page.params as Record<string, string>,
          data: page.data,
        },
        __APP_VERSION__,
      );
      const target = el as HTMLElement;
      const elementShot = await shoot(target, "element");
      let pageShot: string | undefined;
      if (includePage) {
        // Mark the picked element so the page shot shows what the comment is about.
        const prev = target.style.outline;
        const prevOffset = target.style.outlineOffset;
        target.style.outline = "3px solid var(--bad)";
        target.style.outlineOffset = "2px";
        try {
          pageShot = await shoot(document.body, "page");
        } finally {
          target.style.outline = prev;
          target.style.outlineOffset = prevOffset;
        }
      }
      const res = await feedbackApi.submit({ comment, context, elementShot, pageShot });
      feedbackMode.sent += 1;
      showToast(`${res.handle} saved`);
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not save feedback";
    } finally {
      sending = false;
    }
  }

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function showToast(text: string) {
    toast = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 2600);
  }

  function onFormKey(e: KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      send();
    }
  }

  const box = (r: DOMRect) => `left:${r.left}px; top:${r.top}px; width:${r.width}px; height:${r.height}px`;
</script>

<div class="fb" data-feedback-ui>
  <TicketPins
    active={feedbackMode.on && !onReviewPage}
    bind:openId={pinOpen}
    bind:unplaced
    reload={feedbackMode.sent}
    onopen={() => {
      close();
      showUnplaced = false;
    }}
  />

  {#if picking && hovered && hoverRect && hovered !== selected}
    <div class="outline hover" style={box(hoverRect)} aria-hidden="true">
      <span class="tag" class:below={hoverRect.top < 24}>{hoverLabel}</span>
    </div>
  {/if}

  {#if selected && selRect}
    <div class="outline picked" style={box(selRect)} aria-hidden="true"></div>
  {/if}

  {#if selected && formPos}
    <form
      class="pin"
      style={formPos}
      aria-label="Leave feedback on this element"
      onsubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div class="pin-head">
        <code class="src" title="Source of the selected element">{selLabel}</code>
        <button type="button" class="link" onclick={widen} title="Select the enclosing element">
          Select parent
        </button>
      </div>
      {#if selVia.length}
        <p class="via">in {selVia.join(" ← ")}</p>
      {/if}
      <textarea
        bind:this={textarea}
        bind:value={comment}
        onkeydown={onFormKey}
        rows="4"
        maxlength="5000"
        placeholder="What should change here?"
        aria-label="Your feedback"
      ></textarea>
      <label class="check">
        <input type="checkbox" bind:checked={includePage} />
        Attach a screenshot of the whole page
      </label>
      {#if error}
        <p class="err" role="alert">{error}</p>
      {/if}
      <div class="pin-actions">
        <span class="hint">⌘↵ to send · Esc to cancel</span>
        <button type="button" class="btn small" onclick={close}>Cancel</button>
        <button type="submit" class="btn small primary" disabled={!comment.trim() || sending}>
          {sending ? "Saving…" : "Send"}
        </button>
      </div>
    </form>
  {/if}

  <div class="bar" class:on={feedbackMode.on} role="toolbar" aria-label="Feedback mode">
    {#if feedbackMode.on}
      <span class="live" aria-hidden="true"></span>
      <span class="title">Feedback</span>
      <div class="seg" role="group" aria-label="Click behaviour">
        <button type="button" aria-pressed={!feedbackMode.browsing} onclick={() => (feedbackMode.browsing = false)}>
          Pick
        </button>
        <button type="button" aria-pressed={feedbackMode.browsing} onclick={() => { feedbackMode.browsing = true; close(); }}>
          Use app
        </button>
      </div>
      <span class="status" role="status">
        {#if toast}
          <strong>{toast}</strong>
        {:else if feedbackMode.browsing || onReviewPage}
          Clicks work normally
        {:else}
          Click anything to comment
        {/if}
      </span>
      {#if feedbackMode.sent}
        <a class="count" href="/feedback" title="Review feedback">{feedbackMode.sent} sent</a>
      {/if}
      {#if unplaced.length && !onReviewPage}
        <button
          type="button"
          class="count unplaced-btn"
          aria-expanded={showUnplaced}
          title="Open feedback on this page whose element could not be found"
          onclick={() => (showUnplaced = !showUnplaced)}
        >
          {unplaced.length} not placed
        </button>
        {#if showUnplaced}
          <ul class="unplaced">
            {#each unplaced as u (u.id)}
              <li>
                <a href="/feedback#{feedbackHandle(u.number)}">
                  <code>{feedbackHandle(u.number)}</code>
                  <span>{u.comment}</span>
                </a>
              </li>
            {/each}
          </ul>
        {/if}
      {/if}
      <button type="button" class="x" onclick={exit} aria-label="Leave feedback mode">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>
    {:else}
      <button type="button" class="start" onclick={() => feedbackMode.set(true)}>
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /></svg>
        Feedback
      </button>
    {/if}
  </div>
</div>

<style>
  :global(html.feedback-picking body *) {
    cursor: crosshair !important;
  }
  :global(html.feedback-picking [data-feedback-ui] *) {
    cursor: auto !important;
  }
  :global(html.feedback-picking [data-feedback-ui] button),
  :global(html.feedback-picking [data-feedback-ui] a) {
    cursor: pointer !important;
  }

  .outline {
    position: fixed;
    pointer-events: none;
    z-index: 9998;
    border-radius: 3px;
  }
  .outline.hover {
    outline: 2px solid var(--blue);
    background: color-mix(in srgb, var(--blue) 6%, transparent);
  }
  .outline.picked {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
    background: color-mix(in srgb, var(--blue) 10%, transparent);
  }
  .tag {
    position: absolute;
    left: -2px;
    bottom: 100%;
    margin-bottom: 4px;
    background: var(--hover-ink);
    color: var(--on-ink);
    font: 500 11px/1 var(--font-mono);
    padding: 4px 6px;
    border-radius: 4px;
    white-space: nowrap;
  }
  .tag.below {
    bottom: auto;
    top: 100%;
    margin: 4px 0 0;
  }

  .pin {
    position: fixed;
    z-index: 9999;
    width: 340px;
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow-overlay);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font: 400 14px/1.5 var(--font-ui);
    color: var(--ink);
  }
  .pin-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .src {
    font: 500 12px/1.4 var(--font-mono);
    background: var(--chip-bg);
    border-radius: var(--radius);
    padding: 2px 6px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--blue);
    font: 500 12px/1.4 var(--font-ui);
    flex: none;
  }
  .link:hover {
    text-decoration: underline;
  }
  .via {
    margin: -4px 0 0;
    font: 400 12px/1.4 var(--font-mono);
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 84px;
    font: inherit;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--ink);
  }
  textarea:focus {
    outline: none;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--muted);
  }
  .err {
    margin: 0;
    font-size: 12px;
    color: var(--bad);
  }
  .pin-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hint {
    margin-right: auto;
    font-size: 11px;
    color: var(--faint);
  }

  .bar {
    position: fixed;
    right: 16px;
    /* A page with a sticky bottom bar (the log sheet's Save) sets the lift. */
    bottom: calc(16px + var(--feedback-lift, 0px));
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    font: 400 13px/1 var(--font-ui);
  }
  .bar.on {
    background: var(--hover-ink);
    color: var(--on-ink);
    border-radius: 99px;
    padding: 6px 6px 6px 14px;
    box-shadow: var(--shadow-overlay);
  }
  .start {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--surface);
    color: var(--muted);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 6px 12px;
    font: 500 12px/1 var(--font-ui);
    box-shadow: var(--shadow-overlay);
  }
  .start:hover {
    color: var(--ink);
    border-color: var(--line-strong);
  }
  svg {
    width: 14px;
    height: 14px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .live {
    width: 8px;
    height: 8px;
    border-radius: 99px;
    background: var(--done-2);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--done-2) 25%, transparent);
  }
  .title {
    font-weight: 600;
  }
  .seg {
    display: inline-flex;
    background: color-mix(in srgb, var(--on-ink) 12%, transparent);
    border-radius: 99px;
    padding: 2px;
  }
  .seg button {
    background: none;
    border: 0;
    color: color-mix(in srgb, var(--on-ink) 75%, transparent);
    font: 500 12px/1 var(--font-ui);
    padding: 5px 10px;
    border-radius: 99px;
  }
  .seg button[aria-pressed="true"] {
    background: var(--on-ink);
    color: var(--hover-ink);
  }
  .status {
    color: color-mix(in srgb, var(--on-ink) 75%, transparent);
    min-width: 150px;
  }
  .status strong {
    color: var(--on-ink);
    font-weight: 600;
  }
  .count {
    color: var(--on-ink);
    font-weight: 600;
    font-size: 12px;
    text-decoration: underline;
    text-underline-offset: 2px;
  }
  .unplaced-btn {
    background: none;
    border: 0;
    padding: 0;
    font: inherit;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
  }
  .unplaced {
    position: absolute;
    right: 0;
    bottom: calc(100% + 8px);
    width: 320px;
    max-height: 50vh;
    overflow: auto;
    margin: 0;
    padding: 6px;
    list-style: none;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--line);
    border-radius: 12px;
    box-shadow: var(--shadow-overlay);
  }
  .unplaced a {
    display: flex;
    gap: 8px;
    align-items: baseline;
    padding: 6px 8px;
    border-radius: 6px;
    color: var(--ink);
    font: 400 13px/1.4 var(--font-ui);
    text-decoration: none;
  }
  .unplaced a:hover {
    background: var(--well-2);
  }
  .unplaced code {
    font: 600 12px/1 var(--font-mono);
    flex: none;
  }
  .unplaced span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .x {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 99px;
    border: 0;
    background: color-mix(in srgb, var(--on-ink) 12%, transparent);
    color: var(--on-ink);
  }
  .x:hover {
    background: color-mix(in srgb, var(--on-ink) 24%, transparent);
  }
  button:focus-visible,
  a:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 2px;
  }
</style>
