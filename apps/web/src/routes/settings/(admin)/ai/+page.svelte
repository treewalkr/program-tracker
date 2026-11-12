<script lang="ts">
  import { onMount } from "svelte";
  import { apiMode } from "$lib/api";
  import { accountApi } from "$lib/account";
  import { adminApi, type LlmDatasetStats } from "$lib/api/admin";
  import type { FeedbackAiMode } from "@pt/shared";
  import { AI_MODE_OPTIONS } from "$lib/feedback/ai";
  import LlmDatasetPanel from "$lib/components/LlmDatasetPanel.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";

  const live = apiMode === "live";

  /** AI answers on feedback: undefined while loading, null if the API didn't answer. */
  let aiMode = $state<FeedbackAiMode | null | undefined>(undefined);
  let aiSaving = $state(false);
  let aiError = $state<string | null>(null);

  let llmStats = $state<LlmDatasetStats | null>(null);
  let llmStatsError = $state<string | null>(null);

  /** Optimistic: show the pick now, keep the server's answer, revert on error. */
  async function saveAiMode(mode: FeedbackAiMode) {
    const prev = aiMode;
    aiMode = mode;
    aiSaving = true;
    aiError = null;
    try {
      aiMode = await accountApi.setFeedbackAiMode(mode);
    } catch (err) {
      aiMode = prev;
      aiError = (err as Error).message || "Could not save";
    } finally {
      aiSaving = false;
    }
  }

  onMount(() => {
    if (live) {
      accountApi.feedbackAiMode().then(
        (m) => (aiMode = m),
        () => (aiMode = null),
      );
      adminApi
        .llmStats()
        .then((s) => (llmStats = s))
        .catch((err) => (llmStatsError = (err as Error).message));
    }
  });
</script>

<Panel title="Answers to feedback">
  <div class="ai-answers">
    <p class="muted help">
      A scheduled agent reads new tickets against the code and replies. Every answer is badged as AI and comes with a
      private note for you.
    </p>
    {#if !live}
      <p class="muted">This setting lives on the server — switch to the live API to change it.</p>
    {:else if aiMode === undefined}
      <Skeleton shape="line" w="min(220px, 100%)" h="12px" />
    {:else if aiMode === null}
      <p class="muted">This setting isn't available right now.</p>
    {:else}
      <div class="modes" role="radiogroup" aria-label="AI answers to feedback">
        {#each AI_MODE_OPTIONS as opt (opt.value)}
          <label class="check">
            <input
              type="radio"
              name="feedback-ai-mode"
              value={opt.value}
              checked={aiMode === opt.value}
              disabled={aiSaving}
              onchange={() => saveAiMode(opt.value)}
            />
            <span>{opt.label} <span class="muted">— {opt.help}</span></span>
          </label>
        {/each}
      </div>
    {/if}
    {#if aiError}<p class="err" role="alert">{aiError}</p>{/if}
  </div>
</Panel>

{#if !live}
  <Note tone="warn">The AI dataset is counted on the server — switch to the live API to see it.</Note>
{:else if llmStatsError}
  <Note tone="bad">Couldn't load AI dataset counts — {llmStatsError}.</Note>
{:else if llmStats}
  <LlmDatasetPanel stats={llmStats} />
{:else}
  <SkeletonPanel title="AI dataset" count height={120} />
{/if}

<style>
  .ai-answers { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; font-size: 13px; }
  .muted { color: var(--muted); margin: 0; }
  .help { max-width: 64ch; line-height: 1.5; }
  .modes { display: flex; flex-direction: column; gap: 6px; }
  .check { display: flex; align-items: flex-start; gap: 8px; cursor: pointer; color: var(--ink); }
  .check input { margin: 2px 0 0; width: 14px; height: 14px; accent-color: var(--blue); flex: none; }
  .check .muted { display: inline; }
  .err { color: var(--bad); font-size: 12px; }
</style>
