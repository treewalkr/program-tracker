<script lang="ts">
  import type { CardioMetric } from "@pt/shared";
  import type { LogReviewDto, LogReviewInput, SessionLogDto } from "$lib/api/types";
  import { dayLabel, planIntervals, planSource, reviewRows } from "$lib/cardioTab";
  import { SKIP_REASON_LABEL } from "$lib/cardioForm";
  import { MAX_HR_UNTESTED } from "$lib/hrProfile";
  import InputNote from "$lib/ui/InputNote.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Pill from "$lib/ui/Pill.svelte";

  /**
   * One cardio log, plan beside actual. The plan is the copy saved with the
   * log, so later program edits don't change it. The trainer's feedback is
   * what the member sees on the session in the portal; "Mark reviewed" clears
   * it from the to-review list.
   */
  interface Props {
    log: SessionLogDto;
    /** First name, for "Nok's note" (on their own logs) / "Feedback for Nok". */
    member: string;
    /** How pace shows for this log's modality. */
    metric: CardioMetric;
    onreview: (input: LogReviewInput) => Promise<LogReviewDto>;
    /** The HR profile on the log date leans on an untested max HR. */
    zonesApprox?: boolean;
  }

  let { log, member, metric, onreview, zonesApprox = false }: Props = $props();

  const cardio = $derived(log.cardio!);
  const plan = $derived(log.prescription ?? null);
  const rows = $derived(reviewRows(cardio, plan, metric));
  const ivs = $derived(planIntervals(plan?.session.cardio));
  const skipped = $derived(cardio.skipped ?? null);
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

<article class="review" aria-label="Review of {plan?.session.name ?? cardio.modality} on {dayLabel(log.date)}">
  <header class="head">
    <div>
      <h3>{dayLabel(log.date)} · {plan?.session.name ?? cardio.modality}</h3>
      <p class="src">{log.loggedBy === "client" ? `Logged by ${member}` : "Logged by you"} · {planSource(plan)}</p>
    </div>
    {#if skipped}<Pill>Not done</Pill>{:else if reviewed}<Pill tone="good">Reviewed</Pill>{:else}<Pill tone="warn">To review</Pill>{/if}
  </header>

  {#if skipped}
    <p class="skip">{member} didn't do this one: <b>{SKIP_REASON_LABEL[skipped.reason]}</b>.</p>
  {:else}
    <div class="scroll x-scroll">
      <table class="pva">
        <thead><tr><th></th><th>Plan</th><th>Actual</th></tr></thead>
        <tbody>
          {#each rows as r (r.label)}
            <tr>
              <th scope="row">{r.label}</th>
              <td class="plan">{r.plan}</td>
              <td class="act" class:insufficient={r.insufficient}>{r.actual}{#if r.aside}<span class="aside">{r.aside}</span>{/if}</td>
            </tr>
            {#if r.note}<tr class="note-row"><td></td><td colspan="2">{r.note}</td></tr>{/if}
          {/each}
        </tbody>
      </table>
    </div>
    {#if zonesApprox}<p class="approx">{MAX_HR_UNTESTED}</p>{/if}
    {#if ivs.length}
      <details class="ivs">
        <summary>Planned intervals</summary>
        <ol>{#each ivs as line, i (i)}<li>{line}</li>{/each}</ol>
      </details>
    {/if}
  {/if}

  <dl class="facts">
    <div><dt>{log.loggedBy === "client" ? `${member}'s note` : "Session note"}</dt><dd>{log.notes ? `“${log.notes}”` : "None"}</dd></div>
    {#if !skipped}
      <div><dt>Pain or discomfort</dt><dd class:bad={cardio.pain?.reported}>{cardio.pain?.reported ? (cardio.pain.note ? `Reported: “${cardio.pain.note}”` : "Reported") : "None reported"}</dd></div>
    {/if}
  </dl>

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
</article>

<style>
  .review { display: grid; gap: 14px; min-width: 0; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  h3 { margin: 0; font: 600 14px var(--font-ui); color: var(--ink); }
  .src { margin: 2px 0 0; font-size: 12px; color: var(--muted); }
  .skip { margin: 0; font-size: 13px; }
  .scroll { overflow-x: auto; }
  .pva { width: 100%; border-collapse: collapse; font-size: 13px; }
  .pva thead th { font: 500 12px var(--font-ui); color: var(--muted); text-align: left; padding: 4px 10px; border-bottom: 1px solid var(--line); }
  .pva tbody th { font: 500 13px var(--font-ui); color: var(--muted); text-align: left; padding: 6px 10px; white-space: nowrap; width: 1%; }
  .pva td { padding: 6px 10px; border-bottom: 1px solid var(--line-soft); vertical-align: baseline; }
  .pva tbody th { border-bottom: 1px solid var(--line-soft); }
  .plan { color: var(--muted); font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .act { color: var(--ink); font: 600 13px var(--font-mono); font-variant-numeric: tabular-nums; }
  .act.insufficient { font: 500 13px var(--font-ui); color: var(--warn); }
  .aside { margin-left: 8px; font: 400 12px var(--font-ui); color: var(--muted); }
  .note-row td { padding-top: 0; font-size: 12px; color: var(--muted); }
  .pva tr:has(+ .note-row) td, .pva tr:has(+ .note-row) th { border-bottom: none; }
  .ivs summary { cursor: pointer; font-size: 13px; color: var(--muted); }
  .ivs ol { margin: 6px 0 0; padding-left: 20px; font: 400 12px var(--font-mono); color: var(--ink); }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px 20px; margin: 0; }
  .facts dt { font: 500 12px var(--font-ui); color: var(--muted); }
  .facts dd { margin: 2px 0 0; font-size: 13px; color: var(--ink); }
  .facts dd.bad { color: var(--bad); font-weight: 500; }
  .acts { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
  .acts .err { margin: 0 auto 0 0; color: var(--bad); font-size: 12px; }
  .approx {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--warn);
  }
</style>
