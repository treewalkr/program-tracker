<script lang="ts">
  import { untrack, type Snippet } from "svelte";

  /**
   * Small ink tooltip for extra detail on hover or keyboard focus (the native
   * `title` waits a second and never shows on focus). Touch screens have
   * neither, so a long press (450ms) shows it and the next tap anywhere hides
   * it; the press doesn't also follow the link or press the button. The child
   * gets the bubble's id so it can point `aria-describedby` at it.
   *
   * `side="right"` floats it beside the anchor (the sidebar rail). `disabled`
   * stands the wrapper down to `display: contents` and never shows — the child
   * keeps its DOM node (and focus) when the tooltip switches on and off.
   */
  let {
    text,
    side = "top",
    disabled = false,
    children,
  }: { text: string; side?: "top" | "right"; disabled?: boolean; children: Snippet<[string]> } = $props();

  const id = $props.id();
  const tipId = `tip-${id}`;
  let anchor = $state<HTMLSpanElement>();
  let open = $state(false);
  let pos = $state({ x: 0, y: 0, below: false, right: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** A long press opened the bubble: swallow the click that may follow it. */
  let pressed = false;
  /** When a finger last came down here: a tap's focus doesn't pop the bubble. */
  let touchedAt = 0;

  function place() {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    if (side === "right") {
      pos = { x: r.right + 8, y: r.top + r.height / 2, below: false, right: true };
      return;
    }
    const below = r.top < 40;
    pos = { x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below, right: false };
  }

  function show(delay: number) {
    if (disabled) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      place();
      open = true;
    }, delay);
  }

  function hide() {
    clearTimeout(timer);
    open = false;
  }

  function onpointerdown(e: PointerEvent) {
    hide();
    pressed = false;
    if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
    touchedAt = Date.now();
    if (disabled) return;
    timer = setTimeout(() => {
      place();
      open = true;
      pressed = true;
    }, 450);
  }

  /** The press ended before the bubble showed (a tap, or a scroll took over). */
  function cancelPress() {
    if (!open) clearTimeout(timer);
  }

  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    // The next tap anywhere (the anchor's own pointerdown hides it too).
    window.addEventListener("pointerdown", hide, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("pointerdown", hide, { capture: true });
    };
  });

  $effect(() => () => clearTimeout(timer));
  $effect(() => {
    if (disabled) untrack(hide);
  });
</script>

<span
  class="anchor"
  class:off={disabled}
  bind:this={anchor}
  role="presentation"
  onpointerenter={(e) => e.pointerType === "mouse" && show(300)}
  onpointerleave={(e) => (e.pointerType === "mouse" ? hide() : cancelPress())}
  onpointerup={cancelPress}
  onpointercancel={cancelPress}
  onfocusin={() => Date.now() - touchedAt > 1000 && show(0)}
  onfocusout={hide}
  {onpointerdown}
  oncontextmenu={(e) => (pressed || open) && e.preventDefault()}
  onclickcapture={(e) => {
    if (!pressed) return;
    pressed = false;
    e.preventDefault();
    e.stopPropagation();
  }}
>
  {@render children(tipId)}
</span>
{#if open}
  <span
    class="bubble"
    class:below={pos.below}
    class:right={pos.right}
    id={tipId}
    role="tooltip"
    style:left="{pos.x}px"
    style:top="{pos.y}px">{text}</span
  >
{/if}

<style>
  .anchor {
    display: inline-flex;
  }
  .anchor.off {
    display: contents;
  }
  /* The long press is ours: no iOS link preview or text selection. */
  @media (hover: none) {
    .anchor:not(.off) {
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
  }
  .bubble {
    position: fixed;
    z-index: 60;
    transform: translate(-50%, -100%);
    background: var(--hover-ink);
    color: var(--on-ink);
    font: 500 12px/1.3 var(--font-ui);
    padding: 5px 8px;
    border-radius: 6px;
    box-shadow: var(--shadow-overlay);
    white-space: nowrap;
    pointer-events: none;
  }
  .bubble.below {
    transform: translate(-50%, 0);
  }
  .bubble.right {
    transform: translate(0, -50%);
  }
</style>
