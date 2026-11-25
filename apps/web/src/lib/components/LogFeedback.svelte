<script lang="ts">
  import type { LogReviewDto, LogReviewInput, SessionLogDto } from "$lib/api/types";
  import InputNote from "$lib/ui/InputNote.svelte";
  import Button from "$lib/ui/Button.svelte";

  /**
   * The coach's review of one session log, for any kind (cardio or strength):
   * a feedback note the member sees on the session in the portal, and "Mark
   * reviewed", which clears it from the to-review list. `CardioReview` puts it
   * under plan against actual; the History tab puts it under a strength session.
   */
  interface Props {
    log: Pick<SessionLogDto, "reviewedAt" | "trainerFeedback">;
    /** First name, for "Feedback for Nok". */
    member: string;
    onreview: (input: LogReviewInput) => Promise<LogReviewDto>;
  }

  let { log, member, onreview }: Props = $props();

  const reviewed = $derived(!!log.reviewedAt);

  // svelte-ignore state_referenced_locally
  let feedback = $state(log.trainerFeedback ?? "");
  let busy = $state(false);
  let error = $state<string | null>(null);
  const dirty = $derived(feedback.trim() !== (log.trainerFeedback ?? ""));

  async function send(input: LogReviewInput) {
    busy = true;
    error = null;
    try {
      const out = await onreview(input);
      feedback = out.trainerFeedback ?? "";
    } catch (e) {
      error = (e as Error).message || "Could not save";
    } finally {
      busy = false;
    }
  }
</script>

<div class="fb">
  <InputNote label="Feedback for {member}" placeholder="What went well, and what to change next time" optional maxlength={2000} rows={2} bind:value={feedback} disabled={busy} hint="{member} sees this on the session in the portal." />

  <div class="acts">
    {#if error}<p class="err" role="alert">{error}</p>{/if}
    {#if reviewed}
      {#if dirty}<Button small variant="primary" type="button" disabled={busy} onclick={() => send({ reviewed: true, feedback: feedback.trim() || null })}>Save feedback</Button>{/if}
      <Button small variant="ghost" type="button" disabled={busy} onclick={() => send({ reviewed: false })}>Mark not reviewed</Button>
    {:else}
      {#if dirty}<Button small variant="ghost" type="button" disabled={busy} onclick={() => send({ reviewed: false, feedback: feedback.trim() || null })}>Save feedback only</Button>{/if}
      <Button small variant="primary" type="button" disabled={busy} onclick={() => send({ reviewed: true, feedback: feedback.trim() || null })}>{busy ? "Saving…" : "Mark reviewed"}</Button>
    {/if}
  </div>
</div>

<style>
  .fb { display: grid; gap: 14px; min-width: 0; }
  .acts { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
  .acts .err { margin: 0 auto 0 0; color: var(--bad); font-size: 12px; }
</style>
