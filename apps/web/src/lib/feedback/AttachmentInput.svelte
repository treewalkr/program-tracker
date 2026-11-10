<script lang="ts">
  import { tick } from "svelte";
  import { FEEDBACK_IMAGE_MIMES } from "@pt/shared";
  import Icon from "$lib/ui/Icon.svelte";
  import type { ImageTray } from "./tray.svelte";

  /**
   * The image row of a feedback composer: an "Image" picker, the count, and
   * thumbnails that can be removed and reordered — drag them, or focus one
   * and use Alt+←/→ to move it and Delete to remove it. Paste and drop are
   * caught by the composer itself through `tray.zone`, which should show a
 * drop state while `tray.dragging` (a dashed blue outline, as elsewhere).
   */
  interface Props {
    tray: ImageTray;
    disabled?: boolean;
    /** What the images are for, e.g. "the reply". Names the picker for screen readers. */
    label?: string;
  }
  let { tray, disabled = false, label = "this ticket" }: Props = $props();

  let input = $state<HTMLInputElement>();
  let list = $state<HTMLUListElement>();
  let dragId = $state<number | null>(null);
  const hintId = $props.id();

  const count = $derived(tray.images.length);
  /** Toward the limit: captured screenshots (when editing a ticket) don't count. */
  const counted = $derived(tray.counted);
  /** Captured screenshots in the tray: shown, but outside the upload limit. */
  const shots = $derived(count - counted);
  const isShot = (img: (typeof tray.images)[number]) => img.stored !== undefined && img.stored.kind !== "upload";

  function pick(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    tray.add([...(el.files ?? [])]);
    el.value = "";
  }

  async function focusAt(index: number) {
    await tick();
    const items = list?.querySelectorAll<HTMLElement>("[data-thumb]");
    if (!items?.length) return input?.focus();
    items[Math.min(index, items.length - 1)]?.focus();
  }

  function onkeydown(e: KeyboardEvent, id: number, index: number) {
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      focusAt(tray.move(id, e.key === "ArrowLeft" ? -1 : 1));
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      focusAt(Math.max(0, index + (e.key === "ArrowLeft" ? -1 : 1)));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      tray.remove(id);
      focusAt(index);
    }
  }

  function ondrop(e: DragEvent, index: number) {
    if (dragId === null) return;
    e.preventDefault();
    e.stopPropagation();
    const from = tray.images.findIndex((i) => i.id === dragId);
    tray.move(dragId, index - from);
    dragId = null;
  }
</script>

<div class="attach">
  <div class="bar">
    <button
      type="button"
      class="pick"
      onclick={() => input?.click()}
      disabled={disabled || tray.full}
      aria-label="Attach images to {label}"
      title={tray.full ? `Up to ${tray.max} images` : "Attach images — or paste or drop them here"}
    >
      <Icon name="image" />
      <span>Image</span>
    </button>
    {#if counted}
      <span
        class="count"
        class:full={tray.full}
        title={shots ? `Up to ${tray.max} uploads — captured screenshots don't count` : undefined}
        >{counted}/{tray.max}{shots ? " uploads" : ""}</span
      >
    {:else}
      <span class="hint">or paste / drop</span>
    {/if}
    <input
      bind:this={input}
      type="file"
      accept={FEEDBACK_IMAGE_MIMES.join(",")}
      multiple
      hidden
      onchange={pick}
      {disabled}
    />
  </div>

  {#if count}
    <ul class="thumbs" bind:this={list} aria-label="Attached images">
      {#each tray.images as img, i (img.id)}
        <li
          draggable={!disabled}
          class:pending={!img.file && !img.stored}
          class:lifted={dragId === img.id}
          class:shot={isShot(img)}
          title={isShot(img) ? "Captured screenshot — doesn't count toward the upload limit" : undefined}
          ondragstart={(e) => {
            dragId = img.id;
            e.dataTransfer?.setData("text/plain", String(img.id));
            if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
          }}
          ondragend={() => (dragId = null)}
          ondragover={(e) => {
            if (dragId !== null) e.preventDefault();
          }}
          ondrop={(e) => ondrop(e, i)}
        >
          <!-- Focus target for keyboard reordering; the image itself is decorative. -->
          <button
            type="button"
            class="thumb"
            data-thumb
            aria-label="Image {i + 1} of {count}{isShot(img) ? ', captured screenshot' : ''}{img.name ? `, ${img.name}` : ''}{img.file || img.stored ? '' : ', compressing'}"
            aria-describedby={hintId}
            onkeydown={(e) => onkeydown(e, img.id, i)}
          >
            <img src={img.preview} alt="" draggable="false" />
            <span class="pos" aria-hidden="true">{i + 1}</span>
          </button>
          <button
            type="button"
            class="remove"
            tabindex="-1"
            aria-label="Remove image {i + 1}"
            {disabled}
            onclick={() => {
              tray.remove(img.id);
              focusAt(i);
            }}><Icon name="x" /></button
          >
        </li>
      {/each}
    </ul>
  {/if}

  {#if tray.error}<p class="error" role="alert">{tray.error}</p>{/if}
  <span class="vh" id={hintId}>Alt plus left or right arrow moves it. Delete removes it.</span>
  <span class="vh" aria-live="polite">{tray.status}</span>
</div>

<style>
  .attach {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .bar {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .pick {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 8px;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: none;
    color: var(--muted);
    font: 500 12px/1 var(--font-ui);
    cursor: pointer;
  }
  .pick :global(svg) {
    width: 14px;
    height: 14px;
  }
  .pick:hover:not(:disabled) {
    color: var(--ink);
    background: var(--hover-soft);
  }
  .pick:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 1px;
  }
  .pick:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .count,
  .hint {
    font: 500 11px/1 var(--font-mono);
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .hint {
    font-family: var(--font-ui);
    font-weight: 400;
  }
  .count.full {
    color: var(--warn-ink);
  }
  .thumbs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .thumbs li {
    position: relative;
    width: 80px;
    height: 60px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--well);
    overflow: hidden;
    cursor: grab;
  }
  .thumb {
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    cursor: inherit;
  }
  .thumb:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: -2px;
  }
  /* Captured with the ticket, not uploaded: outside the limit, so marked apart. */
  .thumbs li.shot {
    border-style: dashed;
  }
  .thumbs li.lifted {
    opacity: 0.4;
  }
  .thumbs img {
    display: block;
    width: 100%;
    height: 100%;
    /* Whole image, letterboxed on the well: screenshots are wide and the detail is often at an edge. */
    object-fit: contain;
  }
  .pending img {
    opacity: 0.45;
  }
  .pending::after {
    content: "";
    position: absolute;
    inset: auto 6px 6px;
    height: 2px;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent, var(--blue), transparent);
    background-size: 200% 100%;
    animation: sweep 1.1s linear infinite;
  }
  @keyframes sweep {
    from {
      background-position: 100% 0;
    }
    to {
      background-position: -100% 0;
    }
  }
  .pos {
    position: absolute;
    left: 3px;
    bottom: 3px;
    min-width: 14px;
    padding: 1px 3px;
    border-radius: 3px;
    background: var(--bg);
    color: var(--muted);
    font: 500 10px/1.2 var(--font-mono);
    text-align: center;
  }
  .remove {
    position: absolute;
    top: 3px;
    right: 3px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 99px;
    background: var(--bg);
    color: var(--ink);
    box-shadow: 0 0 0 1px var(--line);
    cursor: pointer;
    opacity: 0;
  }
  .remove :global(svg) {
    width: 11px;
    height: 11px;
  }
  .thumbs li:hover .remove,
  .thumbs li:focus-within .remove {
    opacity: 1;
  }
  @media (hover: none) {
    .remove {
      opacity: 1;
    }
  }
  .remove:hover {
    color: var(--bad);
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--bad);
  }
  .vh {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .pending::after {
      animation: none;
      background: var(--blue);
      opacity: 0.5;
    }
  }
</style>
