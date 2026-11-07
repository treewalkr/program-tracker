<script lang="ts">
  import type { ChatProposalDto } from "$lib/api/types";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * A proposed draft change from a chat turn. Nothing is rebuilt until the
   * trainer presses Build; Adjust hands the request back to the composer.
   * status: open (can build) · building · built · superseded (a newer
   * version exists, or a newer proposal replaced it).
   */
  interface Props {
    proposal: ChatProposalDto;
    /** Track labels of the draft the proposal targets ("Session 1", "Cardio 1"…),
     *  indexed by draft position; `change.day` is that 1-based position. */
    tags?: string[];
    status: "open" | "building" | "built" | "superseded";
    /** mm:ss while building. */
    elapsed?: string | null;
    onbuild?: () => void;
    onadjust?: () => void;
  }

  let { proposal, tags = [], status, elapsed = null, onbuild, onadjust }: Props = $props();

  const n = $derived(proposal.changes.length);
</script>

<div class="proposal" class:settled={status !== "open"}>
  <div class="head">
    <strong>Proposed change</strong>
    <span class="muted">{n} change{n === 1 ? "" : "s"}</span>
  </div>
  <ul class="changes">
    {#each proposal.changes as c, i (i)}
      <li>
        <span class="sign" aria-hidden="true">{c.kind === "add" ? "+" : c.kind === "remove" ? "−" : "~"}</span>
        <span>
          <span class="where">{tags[c.day - 1] ?? `Session ${c.day}`}{c.slot != null ? ` · slot ${c.slot}` : ""} ·</span>
          {#if c.kind === "swap"}
            <s class="from">{c.from}</s> → {c.to}
          {:else if c.kind === "add"}
            add {c.to}
          {:else if c.kind === "remove"}
            remove <s class="from">{c.from}</s>
          {:else}
            {c.to ?? c.from}
          {/if}
          <span class="detail">— {c.detail}</span>
        </span>
      </li>
    {/each}
  </ul>
  <p class="keep">Everything else stays as it is.</p>
  <div class="foot">
    {#if status === "open"}
      <Button variant="primary" small onclick={() => onbuild?.()}>Build</Button>
      <Button small onclick={() => onadjust?.()}>Adjust</Button>
      <span class="hint"><Icon name="lock" />2–4 min · the current version stays until the new one lands</span>
    {:else if status === "building"}
      <span class="spinner" aria-hidden="true"></span>
      <span>Building</span>
      {#if elapsed}<span class="elapsed">{elapsed}</span>{/if}
    {:else if status === "built"}
      <span class="muted">Built</span>
    {:else}
      <span class="muted">Not built</span>
    {/if}
  </div>
</div>

<style>
  .proposal {
    margin-top: 10px;
    border: 1px solid var(--line);
    border-radius: 6px;
    font-size: 13px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--well);
    border-bottom: 1px solid var(--line-soft);
    border-radius: 6px 6px 0 0;
  }
  .muted,
  .where {
    color: var(--muted);
  }
  .changes {
    list-style: none;
    margin: 0;
    padding: 8px 12px 4px;
  }
  .changes li {
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 6px;
    padding: 3px 0;
  }
  .sign {
    font: 700 13px/1.45 var(--font-mono);
    color: var(--blue);
  }
  .from {
    color: var(--muted);
    text-decoration-color: var(--line-strong);
  }
  .detail {
    color: var(--muted);
  }
  .keep {
    margin: 0;
    padding: 0 12px 10px 32px;
    color: var(--muted);
    font-size: 12px;
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid var(--line-soft);
    flex-wrap: wrap;
  }
  .hint {
    margin-left: auto;
    font-size: 12px;
    color: var(--muted);
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .hint :global(svg) {
    width: 13px;
    height: 13px;
  }
  .settled .foot {
    color: var(--muted);
  }
  .elapsed {
    font: 500 12px/1 var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .spinner {
    width: 13px;
    height: 13px;
    border-radius: 99px;
    border: 2px solid var(--blue-line);
    border-top-color: var(--blue);
    animation: spin 0.9s linear infinite;
    flex: none;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 3s;
    }
  }
  @media (max-width: 560px) {
    .hint {
      margin-left: 0;
      width: 100%;
    }
    .foot :global(.btn) {
      min-height: 32px;
    }
  }
</style>
