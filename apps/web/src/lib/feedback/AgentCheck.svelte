<script lang="ts">
  import type { AgentVerdict, FeedbackItem } from "@pt/shared";
  import { feedbackApi } from "$lib/feedback/client";
  import { ago } from "$lib/draftReview";
  import Button from "$lib/ui/Button.svelte";
  import Pill from "$lib/ui/Pill.svelte";

  /**
   * Admin-only: an LLM's read on whether a coding agent could fix this
   * ticket unattended — a plan when ready, open questions when not.
   */
  interface Props {
    item: FeedbackItem;
    onchange: (next: FeedbackItem) => void;
  }
  let { item, onchange }: Props = $props();

  const LABEL: Record<AgentVerdict, string> = {
    ready: "Ready for agent",
    needs_info: "Needs info",
    not_for_agent: "Not for agent",
  };
  const TONE: Record<AgentVerdict, "good" | "warn" | "neutral"> = {
    ready: "good",
    needs_info: "warn",
    not_for_agent: "neutral",
  };

  let checking = $state(false);
  let asking = $state(false);
  let error = $state<string | null>(null);

  const check = $derived(item.agentCheck);

  async function run() {
    checking = true;
    error = null;
    try {
      onchange(await feedbackApi.agentCheck(item.id));
    } catch (err) {
      error = err instanceof Error ? err.message : "The check failed";
    } finally {
      checking = false;
    }
  }

  /** Posts the open questions to the thread, where the reporter gets them by email. */
  async function ask() {
    if (!check?.questions.length) return;
    asking = true;
    error = null;
    try {
      const body = check.questions.length === 1 ? check.questions[0] : check.questions.map((q) => `• ${q}`).join("\n");
      await feedbackApi.reply(item.id, body);
      onchange(await feedbackApi.get(item.id));
    } catch (err) {
      error = err instanceof Error ? err.message : "Could not post the questions";
    } finally {
      asking = false;
    }
  }
</script>

<section class="agent" aria-label="Agent readiness" aria-busy={checking}>
  <div class="head">
    <span class="label">Agent check</span>
    {#if check}
      <Pill tone={check.stale ? "neutral" : TONE[check.verdict]}>{LABEL[check.verdict]}</Pill>
      {#if check.stale}
        <span class="stale">Out of date — the ticket changed</span>
      {:else}
        <span class="muted">{check.risk} risk</span>
      {/if}
      <span class="muted when" title="{check.model} · {new Date(check.checkedAt).toLocaleString()}">{ago(check.checkedAt)}</span>
    {:else}
      <span class="muted">Can a coding agent fix this alone?</span>
    {/if}
    <span class="spacer"></span>
    <Button small variant={check && !check.stale ? "ghost" : "default"} disabled={checking} onclick={run}>
      {checking ? "Checking…" : check ? "Re-check" : "Check readiness"}
    </Button>
  </div>

  {#if error}
    <p class="error" role="alert">{error}</p>
  {/if}

  {#if check}
    <div class="result" class:faded={check.stale}>
      <p class="summary">{check.summary}</p>
      {#if check.plan.length}
        <ol class="steps">
          {#each check.plan as step, i (i)}<li>{step}</li>{/each}
        </ol>
      {/if}
      {#if check.questions.length}
        <ul class="questions">
          {#each check.questions as q, i (i)}<li>{q}</li>{/each}
        </ul>
        {#if !check.stale}
          <div>
            <Button small disabled={asking} onclick={ask}>
              {asking ? "Posting…" : check.questions.length === 1 ? "Ask in thread" : `Ask ${check.questions.length} in thread`}
            </Button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  .agent {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: var(--measure-form);
  }
  .head {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    min-height: 28px;
  }
  .label {
    font: 500 12px/1.2 var(--font-ui);
  }
  .muted {
    font-size: 12px;
    color: var(--muted);
  }
  .when {
    font-variant-numeric: tabular-nums;
  }
  .stale {
    font-size: 12px;
    color: var(--warn);
  }
  .spacer {
    flex: 1;
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font: 400 13px/1.5 var(--font-ui);
  }
  .result.faded {
    opacity: 0.6;
  }
  .summary {
    margin: 0;
  }
  .steps,
  .questions {
    margin: 0;
    padding-left: 20px;
  }
  .questions li::marker {
    content: "? ";
    color: var(--muted);
    font-weight: 600;
  }
  .error {
    margin: 0;
    font-size: 12px;
    color: var(--bad);
  }
</style>
