<script lang="ts" module>
  export interface LightboxImage {
    src: string;
    alt: string;
    /** Shown under the image. */
    caption?: string;
  }
</script>

<script lang="ts">
  /**
   * Full-screen image viewer on a native modal `<dialog>` (focus trap, Esc,
   * top layer for free). Takes a list: with more than one image, arrow keys
   * and the prev/next buttons step through them.
   */
  let {
    images,
    open = $bindable(false),
    index = $bindable(0),
    label = "Screenshot",
  }: {
    images: LightboxImage[];
    open?: boolean;
    index?: number;
    /** Accessible name of the dialog. */
    label?: string;
  } = $props();

  let dialog = $state<HTMLDialogElement>();
  const current = $derived(images[Math.min(index, images.length - 1)] ?? null);
  const many = $derived(images.length > 1);

  $effect(() => {
    if (!dialog) return;
    if (open && current && !dialog.open) dialog.showModal();
    else if ((!open || !current) && dialog.open) dialog.close();
  });

  const step = (by: number) => (index = (index + by + images.length) % images.length);

  function onkeydown(e: KeyboardEvent) {
    if (!many) return;
    if (e.key === "ArrowRight") step(1);
    else if (e.key === "ArrowLeft") step(-1);
    else return;
    e.preventDefault();
  }
</script>

<dialog
  bind:this={dialog}
  class="lightbox"
  aria-label={label}
  onclose={() => (open = false)}
  {onkeydown}
  onclick={(e) => {
    // A click on the backdrop (the dialog box itself, not its content) closes.
    if (e.target === dialog) open = false;
  }}
>
  {#if current}
    <figure>
      <img src={current.src} alt={current.alt} />
      <figcaption>
        <span>{current.caption ?? ""}</span>
        {#if many}<span class="count">{index + 1} / {images.length}</span>{/if}
        <a href={current.src} target="_blank" rel="noreferrer">Open in new tab</a>
      </figcaption>
    </figure>
    {#if many}
      <button type="button" class="nav prev" aria-label="Previous image" onclick={() => step(-1)}>‹</button>
      <button type="button" class="nav next" aria-label="Next image" onclick={() => step(1)}>›</button>
    {/if}
    <button type="button" class="close" aria-label="Close" onclick={() => (open = false)}>×</button>
  {/if}
</dialog>

<style>
  .lightbox {
    width: 100vw;
    height: 100vh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 48px 64px;
    border: 0;
    background: transparent;
    box-sizing: border-box;
  }
  .lightbox[open] {
    display: grid;
    place-items: center;
  }
  .lightbox::backdrop {
    background: rgba(13, 17, 23, 0.82);
  }
  figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    max-width: 100%;
    max-height: 100%;
    min-height: 0;
  }
  img {
    display: block;
    max-width: 100%;
    max-height: calc(100vh - 140px);
    object-fit: contain;
    border-radius: 6px;
    box-shadow: var(--shadow-overlay);
    background: var(--surface);
  }
  figcaption {
    display: flex;
    gap: 14px;
    align-items: baseline;
    color: #e6edf3;
    font: 500 13px/1.4 var(--font-ui);
  }
  figcaption a {
    color: #9ecbff;
  }
  .count {
    font-family: var(--font-mono);
    opacity: 0.8;
  }
  button {
    position: fixed;
    border: 0;
    border-radius: 99px;
    background: rgba(240, 246, 252, 0.12);
    color: #f0f6fc;
    font: 400 26px/1 var(--font-ui);
    width: 40px;
    height: 40px;
    cursor: pointer;
  }
  button:hover {
    background: rgba(240, 246, 252, 0.24);
  }
  button:focus-visible {
    outline: 2px solid #9ecbff;
    outline-offset: 2px;
  }
  .close {
    top: 14px;
    right: 14px;
  }
  .nav {
    top: 50%;
    transform: translateY(-50%);
  }
  .prev {
    left: 14px;
  }
  .next {
    right: 14px;
  }
</style>
