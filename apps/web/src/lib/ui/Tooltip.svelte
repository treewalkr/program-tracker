<script lang="ts">
  import type { Snippet } from "svelte";

  /**
   * Small ink tooltip for extra detail on hover or keyboard focus (the native
   * `title` waits a second and never shows on focus). The child gets the
   * bubble's id so it can point `aria-describedby` at it.
   */
  let { text, children }: { text: string; children: Snippet<[string]> } = $props();

  const id = $props.id();
  const tipId = `tip-${id}`;
  let anchor = $state<HTMLSpanElement>();
  let open = $state(false);
  let pos = $state({ x: 0, y: 0, below: false });
  let timer: ReturnType<typeof setTimeout> | undefined;

  function place() {
    if (!anchor) return;
    const r = anchor.getBoundingClientRect();
    const below = r.top < 40;
    pos = { x: r.left + r.width / 2, y: below ? r.bottom + 6 : r.top - 6, below };
  }

  function show(delay: number) {
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

  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, { capture: true });
    };
  });

  $effect(() => () => clearTimeout(timer));
</script>

<span
  class="anchor"
  bind:this={anchor}
  role="presentation"
  onpointerenter={(e) => e.pointerType === "mouse" && show(300)}
  onpointerleave={hide}
  onfocusin={() => show(0)}
  onfocusout={hide}
>
  {@render children(tipId)}
</span>
{#if open}
  <span
    class="bubble"
    class:below={pos.below}
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
</style>
