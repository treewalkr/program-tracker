<script lang="ts">
  import {
    FEEDBACK_KINDS,
    FEEDBACK_KIND_LABELS,
    FEEDBACK_REPEATS,
    FEEDBACK_REPEAT_LABELS,
    FEEDBACK_REPORT_TEXT_MAX,
    hasReportFields,
    type FeedbackKind,
    type FeedbackReport,
  } from "@pt/shared";

  /**
   * What a ticket is (Bug / Wrong behaviour / Idea / Question), and for the
   * first two what the reporter expected, what happened and how often. Used
   * by the pin composer, the New ticket composer and the ticket editor.
   * `nudge` shows the one-time "What did you expect?" ask for a thin bug
   * report, with Send anyway.
   */
  interface Props {
    kind: FeedbackKind | null;
    report: FeedbackReport;
    disabled?: boolean;
    /** Unique per form, for label ids. */
    idPrefix: string;
    nudge?: boolean;
    onsendanyway?: () => void;
  }
  let {
    kind = $bindable(),
    report = $bindable(),
    disabled = false,
    idPrefix,
    nudge = false,
    onsendanyway,
  }: Props = $props();

  const detailed = $derived(hasReportFields(kind));
  let expectedInput = $state<HTMLTextAreaElement>();

  $effect(() => {
    if (nudge) expectedInput?.focus();
  });

  const HINT: Record<FeedbackKind, string> = {
    bug: "Something is broken or shows an error",
    behaviour: "It works, but does the wrong thing",
    idea: "Something new, or a change you'd like",
    question: "How do I…? Where is…?",
  };
</script>

<div class="kind" role="radiogroup" aria-label="What is it?" aria-required="true">
  {#each FEEDBACK_KINDS as k (k)}
    <button
      type="button"
      role="radio"
      class="chip"
      aria-checked={kind === k}
      title={HINT[k]}
      {disabled}
      onclick={() => (kind = k)}
    >
      {FEEDBACK_KIND_LABELS[k]}
    </button>
  {/each}
</div>

{#if detailed}
  <div class="report">
    <label for="{idPrefix}-expected">What did you expect to happen?</label>
    <textarea
      id="{idPrefix}-expected"
      bind:this={expectedInput}
      rows="2"
      maxlength={FEEDBACK_REPORT_TEXT_MAX}
      {disabled}
      value={report.expected ?? ""}
      oninput={(e) => (report = { ...report, expected: e.currentTarget.value })}
    ></textarea>
    <label for="{idPrefix}-actual">What happened instead?</label>
    <textarea
      id="{idPrefix}-actual"
      rows="2"
      maxlength={FEEDBACK_REPORT_TEXT_MAX}
      {disabled}
      value={report.actual ?? ""}
      oninput={(e) => (report = { ...report, actual: e.currentTarget.value })}
    ></textarea>
    <div class="repeat" role="radiogroup" aria-label="How often does it happen?">
      <span class="label">How often?</span>
      {#each FEEDBACK_REPEATS as r (r)}
        <button
          type="button"
          role="radio"
          class="chip small"
          aria-checked={report.repeat === r}
          {disabled}
          onclick={() => (report = { ...report, repeat: report.repeat === r ? undefined : r })}
        >
          {FEEDBACK_REPEAT_LABELS[r]}
        </button>
      {/each}
    </div>
  </div>
{/if}

{#if nudge}
  <p class="nudge" role="alert">
    <span>What did you expect to happen? A line above helps us fix it first time.</span>
    <button type="button" class="link" {disabled} onclick={() => onsendanyway?.()}>Send anyway</button>
  </p>
{/if}

<style>
  .kind,
  .repeat {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .chip {
    padding: 3px 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    background: var(--bg);
    color: var(--ink);
    font: 500 12px/1.5 var(--font-ui);
    cursor: pointer;
  }
  .chip.small {
    padding: 1px 8px;
    font-size: 11px;
  }
  .chip:hover:not(:disabled) {
    border-color: var(--blue);
  }
  .chip[aria-checked="true"] {
    border-color: var(--blue);
    background: color-mix(in srgb, var(--blue) 12%, var(--bg));
    color: var(--blue);
  }
  .chip:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px var(--focus);
  }
  .report {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label,
  .label {
    font-size: 12px;
    color: var(--muted);
  }
  .repeat {
    margin-top: 2px;
  }
  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 44px;
    field-sizing: content;
    max-height: 160px;
    font: inherit;
    font-size: 13px;
    padding: 4px 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg);
    color: var(--ink);
  }
  textarea:focus {
    outline: none;
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus);
  }
  .nudge {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 10px;
    margin: 0;
    padding: 6px 8px;
    border-radius: var(--radius);
    border: 1px solid var(--warn-line-soft);
    background: var(--warn-bg);
    font-size: 12px;
    color: var(--warn-ink);
  }
  .link {
    background: none;
    border: 0;
    padding: 0;
    color: var(--blue);
    font: 500 12px/1.4 var(--font-ui);
    cursor: pointer;
  }
  .link:hover {
    text-decoration: underline;
  }
</style>
