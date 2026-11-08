<script lang="ts">
  import type { SlotChange } from "@pt/shared";
  import type { VersionStamp } from "$lib/chatRefine";
  import Pill from "$lib/ui/Pill.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Evidence line under every chat turn that produced a draft version: the
   * version tag, how many things changed (exercise slots, sessions, cardio
   * and the block plan, read from the drafts, not the AI's reply) and, for
   * versions built from a proposal, whether anything changed that the
   * proposal did not ask for. Opens to the change list;
   * opens by itself when there are unrequested changes.
   */
  interface Props {
    stamp: VersionStamp;
    /** Click on a change row — the page shows that version and points at the row. */
    onpick?: (change: SlotChange) => void;
  }

  let { stamp, onpick }: Props = $props();

  const n = $derived(stamp.changes.length);
  const extra = $derived(stamp.unproposed ?? []);
  const isExtra = (c: SlotChange) => extra.includes(c);
  const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;
</script>

<details class="stamp" open={extra.length > 0}>
  <summary>
    <span class="vtag">v{stamp.version}</span>
    <strong>{plural(n, "change")}</strong>
    <span class="muted">from v{stamp.version - 1}</span>
    {#if stamp.unproposed !== null}
      {#if extra.length > 0}
        <Pill tone="warn">{plural(extra.length, "change")} not in the proposal</Pill>
      {:else}
        <Pill tone="good">Built as proposed</Pill>
      {/if}
    {/if}
    <span class="chev"><Icon name="chevron" /></span>
  </summary>
  {#if n === 0}
    <p class="none">No changes.</p>
  {:else}
    <ul class="changes">
      {#each stamp.changes as c, i (i)}
        <li>
          <button type="button" class="row" class:unasked={isExtra(c)} onclick={() => onpick?.(c)}>
            <span class="sign" aria-hidden="true">{c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~"}</span>
            <span class="what">
              <span class="where">{c.kind === "plan" ? "Block plan" : `Day ${c.day}`} ·</span>
              {#if c.kind === "swap"}
                <s class="from">{c.from}</s> → {c.to}
              {:else if c.kind === "rx"}
                {c.exercise} <span class="rx"><s class="from">{c.from}</s> → {c.to}</span>
              {:else if c.kind === "added"}
                {c.exercise} <span class="rx">{c.to}</span>
              {:else if c.kind === "session" || c.kind === "cardio" || c.kind === "plan"}
                {c.kind === "cardio" ? `${c.exercise} cardio` : c.kind === "plan" ? c.exercise : "Session"}
                <span class="rx">{#if c.from}<s class="from">{c.from}</s> → {/if}{c.to}</span>
              {:else}
                <s class="from">{c.exercise}</s> removed
              {/if}
              {#if isExtra(c)}<span class="tag-unasked">not in proposal</span>{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</details>

<style>
  .stamp {
    margin-top: 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 13px;
  }
  .stamp > summary {
    list-style: none;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    cursor: pointer;
    flex-wrap: wrap;
    border-radius: 6px;
  }
  .stamp > summary::-webkit-details-marker {
    display: none;
  }
  .stamp > summary:hover {
    background: var(--well);
  }
  .stamp[open] > summary {
    border-bottom: 1px solid var(--line-soft);
    background: var(--well);
    border-radius: 6px 6px 0 0;
  }
  .chev {
    margin-left: auto;
    display: inline-flex;
    color: var(--muted);
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .chev :global(svg) {
    width: 13px;
    height: 13px;
  }
  .stamp[open] .chev {
    transform: rotate(180deg);
  }
  .vtag {
    font: 600 12px/1 var(--font-mono);
    padding: 3px 7px;
    border-radius: 99px;
    background: var(--good-bg);
    color: var(--good);
    border: 1px solid var(--good-line);
  }
  .muted,
  .where {
    color: var(--muted);
  }
  .none {
    margin: 0;
    padding: 8px 10px;
    color: var(--muted);
  }
  .changes {
    list-style: none;
    margin: 0;
    padding: 4px 4px 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 6px;
    width: 100%;
    text-align: left;
    padding: 3px 6px;
    border: 0;
    border-radius: 6px;
    background: none;
    font: inherit;
    color: var(--ink);
    cursor: pointer;
  }
  .row:hover {
    background: var(--well);
  }
  .sign {
    font: 700 13px/1.45 var(--font-mono);
    color: var(--blue);
  }
  .row.unasked .sign {
    color: var(--warn);
  }
  .from {
    color: var(--muted);
    text-decoration-color: var(--line-strong);
  }
  .rx {
    font: 500 12px/1 var(--font-mono);
    white-space: nowrap;
  }
  .tag-unasked {
    font: 500 11px/1 var(--font-ui);
    color: var(--warn);
    margin-left: 4px;
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    .chev {
      transition: none;
    }
  }
</style>
