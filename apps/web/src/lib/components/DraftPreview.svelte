<script lang="ts">
  import type { DraftPreviewModel } from "$lib/chatRefine";
  import Panel from "$lib/ui/Panel.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import SessionCard from "$lib/components/SessionCard.svelte";

  /**
   * Live AI-draft preview beside the chat. While a refinement turn runs the
   * session cards render as skeletons under the next version counter; after
   * it lands, sessions changed since the previous version carry an
   * "updated in vN" chip. Approve lives only on the review page — this pane
   * never publishes.
   */
  interface Props {
    model: DraftPreviewModel;
    /** Where "Open review to approve" lands (the generate/review page). */
    reviewHref: string;
  }

  let { model, reviewHref }: Props = $props();
</script>

{#if model.target}
  <Panel
    title={`Draft v${model.version}`}
    count={model.generating ? `generating v${model.nextVersion}…` : `${model.sessions.length} days`}
    aria-busy={model.generating}
  >
    <div class="preview-body">
      {#each model.sessions as s (s.index)}
        {#if s.state === "skeleton"}
          <Skeleton h="96px" w="100%" />
        {:else}
          <div class="session-slot">
            {#if s.state === "updated"}
              <span class="chip-updated">updated in v{model.version}</span>
            {/if}
            <SessionCard name={s.card.name} kind={s.card.kind} cardio={s.card.cardio} exercises={s.card.exercises} />
          </div>
        {/if}
      {/each}
      <div class="preview-foot">
        <a class="act" href={reviewHref}>Open review to approve →</a>
      </div>
    </div>
  </Panel>
{/if}

<style>
  .preview-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .session-slot {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .session-slot :global(.session) {
    width: 100%;
  }
  .chip-updated {
    font: 500 11px/1 var(--font-ui);
    padding: 2px 6px;
    border-radius: 99px;
    color: var(--good);
    border: 1px solid var(--good-line);
    background: var(--good-bg);
    white-space: nowrap;
  }
  .preview-foot {
    margin-top: 4px;
  }
  .preview-foot a {
    font: 500 13px/1 var(--font-ui);
    color: var(--blue);
    text-decoration: underline;
  }
</style>
