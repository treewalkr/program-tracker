<script lang="ts">
  import Lightbox, { type LightboxImage } from "$lib/ui/Lightbox.svelte";

  /**
   * One ticket's or reply's images as a row of thumbnails. A click opens the
   * Lightbox on that image; arrow keys step through the rest of the entry's.
   * `skip` hides thumbnails the caller already shows larger (they stay in the
   * Lightbox); call `show(i)` to open one of those.
   */
  interface Props {
    images: LightboxImage[];
    /** Accessible name of the row and the viewer, e.g. "Images on FB-012". */
    label: string;
    skip?: number[];
  }
  let { images, label, skip = [] }: Props = $props();

  let open = $state(false);
  let index = $state(0);

  export function show(i: number) {
    index = i;
    open = true;
  }
</script>

{#if images.length > skip.length}
  <ul class="strip" aria-label={label}>
    {#each images as img, i (img.src)}
      {#if !skip.includes(i)}
        <li>
          <button type="button" onclick={() => show(i)} aria-label="Open {img.alt}" title={img.caption}>
            <img src={img.src} alt="" loading="lazy" />
          </button>
        </li>
      {/if}
    {/each}
  </ul>
{/if}
<Lightbox {images} bind:open bind:index {label} />

<style>
  .strip {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  button {
    display: block;
    padding: 0;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--well);
    overflow: hidden;
    cursor: zoom-in;
  }
  button:hover {
    border-color: var(--line-strong);
  }
  button:focus-visible {
    outline: 2px solid var(--blue);
    outline-offset: 1px;
  }
  img {
    display: block;
    height: 72px;
    max-width: 160px;
    min-width: 40px;
    object-fit: cover;
  }
</style>
