<script lang="ts">
  import BlockHead from "$lib/components/BlockHead.svelte";

  /**
   * Movement prep on a log: a tick per item, no kg, reps or RPE — prep is
   * never counted. Shared by the trainer's log page (`sheet`) and the member
   * portal (`touch`, 44px rows). `done` holds the ticked program-exercise ids.
   */
  let {
    items,
    done = $bindable([]),
    variant = "sheet",
    title,
    tag = "tick when done",
    disabled = false,
  }: {
    items: { id: string; name: string; rx?: string; lang?: string }[];
    done?: string[];
    variant?: "sheet" | "touch";
    /** The block's name (localized in the portal). */
    title?: string;
    tag?: string | null;
    disabled?: boolean;
  } = $props();

  const ticked = $derived(items.filter((it) => done.includes(it.id)).length);

  function toggle(id: string, on: boolean) {
    done = on ? [...done.filter((x) => x !== id), id] : done.filter((x) => x !== id);
  }
</script>

<section class="prep" class:touch={variant === "touch"} aria-label={title ?? "Movement prep"}>
  <BlockHead block="prep" label={title} {tag}><span class="tnum" aria-label="{ticked} of {items.length} done">{ticked}/{items.length}</span></BlockHead>
  <ul>
    {#each items as it (it.id)}
      <li>
        <label class="item">
          <input type="checkbox" checked={done.includes(it.id)} {disabled} onchange={(e) => toggle(it.id, e.currentTarget.checked)} />
          <span class="name" lang={it.lang}>{it.name}</span>
          {#if it.rx}<span class="rx tnum">{it.rx}</span>{/if}
        </label>
      </li>
    {/each}
  </ul>
</section>

<style>
  .prep {
    display: grid;
    gap: 4px;
    padding: 8px 12px;
    border-radius: var(--radius);
    background: var(--well);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li + li {
    border-top: 1px solid var(--line-soft);
  }
  .item {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 32px;
    font-size: 14px;
    cursor: pointer;
  }
  .item input {
    flex: none;
    width: 16px;
    height: 16px;
    margin: 0;
    accent-color: var(--green-btn);
  }
  .name {
    min-width: 0;
    overflow-wrap: break-word;
  }
  .rx {
    margin-left: auto;
    font: 12px/1.3 var(--font-mono);
    color: var(--muted);
    text-align: right;
  }
  .touch .item {
    min-height: 44px;
    font-size: 16px;
  }
  .touch .item input {
    width: 20px;
    height: 20px;
  }
  .touch .rx {
    font-size: 13px;
  }
</style>
