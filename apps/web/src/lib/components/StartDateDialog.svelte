<script lang="ts">
  import { localDateOf, startsOnWindow, type SignalProgram } from "@pt/shared";
  import { futureStartWarning, movedLogs, movedSummary, nextMonday, startIssue, startLine } from "$lib/startDate";
  import { weekdayDayMonth } from "$lib/programEdit";
  import InputDate from "$lib/ui/InputDate.svelte";
  import Note from "$lib/ui/Note.svelte";

  /**
   * "Week 1 starts on": one date decides the block's calendar. On the
   * LeaveGuard pattern (native modal `<dialog>`, Esc and backdrop cancel,
   * focus back to the opener). Activating picks the date and goes; changing an
   * active program's date shows which logged sessions move week first.
   */
  interface Props {
    /** Open while set; `activate` on a draft, `change` on an active program. */
    mode: "activate" | "change" | null;
    program: SignalProgram;
    /** The program's logs — only their dates matter. */
    logs?: readonly { programId: string; date: string }[];
    /** Saves the date; a thrown error shows in the dialog. */
    onconfirm: (startsOn: string) => Promise<void>;
    onclose: () => void;
    /** Activating: the name of the member's active program, which stops the moment this one goes live. */
    replacing?: string | null;
    /** The member's first name, for the warning. */
    member?: string | null;
  }
  let { mode, program, logs = [], onconfirm, onclose, replacing = null, member = null }: Props = $props();

  let dialog = $state<HTMLDialogElement>();
  let opener: HTMLElement | null = null;
  const uid = $props.id();
  const today = localDateOf(Date.now());
  const weeks = $derived(Math.max(1, program.weeks.length));
  const range = $derived(startsOnWindow(weeks, today));

  let date = $state("");
  let step = $state<"pick" | "confirm">("pick");
  let busy = $state(false);
  let error = $state<string | null>(null);

  const issue = $derived(startIssue(date, today, weeks));
  const line = $derived(!issue && date ? startLine(date, today, weeks) : null);
  /** Week 1 is still ahead but the current program stops now: the member has a gap with nothing to log. */
  const gap = $derived(mode === "activate" && !issue ? futureStartWarning(date, today, replacing, member) : null);
  const moved = $derived(mode === "change" && date && !issue ? movedLogs(program, logs, date) : []);
  const unchanged = $derived(mode === "change" && date === (program.startsOn ?? ""));

  $effect(() => {
    if (!dialog) return;
    if (mode && !dialog.open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      date = mode === "change" && program.startsOn ? program.startsOn : nextMonday(today);
      step = "pick";
      error = null;
      busy = false;
      dialog.showModal();
    } else if (!mode && dialog.open) {
      dialog.close();
      if (opener?.isConnected && (!document.activeElement || document.activeElement === document.body)) opener.focus({ preventScroll: true });
      opener = null;
    }
  });

  async function submit() {
    if (issue || busy) return;
    if (mode === "change" && step === "pick") {
      step = "confirm";
      return;
    }
    busy = true;
    error = null;
    try {
      await onconfirm(date);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  const cancel = () => {
    if (!busy) onclose();
  };
</script>

<dialog
  bind:this={dialog}
  class="start"
  aria-labelledby="{uid}-title"
  oncancel={(e) => {
    e.preventDefault();
    cancel();
  }}
  onclick={(e) => {
    if (e.target === dialog) cancel();
  }}
>
  {#if mode}
    <form
      onsubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {#if step === "pick"}
        <h2 id="{uid}-title">{mode === "activate" ? "When does Week 1 start?" : "Change when Week 1 starts"}</h2>
        <p class="lede">
          {mode === "activate"
            ? "Every week of the block counts from this day, for you and in the client portal."
            : "Every week moves with it. Logged sessions keep their dates."}
        </p>
        <span class="label" aria-hidden="true">Week 1 starts on</span>
        <div class="pick">
          <div class="date">
            <InputDate label="Week 1 starts on" hideLabel {today} min={range.earliest} max={range.latest} error={issue} bind:value={date} />
          </div>
          <button type="button" class="btn ghost small" aria-pressed={date === today} onclick={() => (date = today)}>Today</button>
          <button type="button" class="btn ghost small" aria-pressed={date === nextMonday(today)} onclick={() => (date = nextMonday(today))}>Next Monday</button>
        </div>
        <p class="line" aria-live="polite">{line ?? ""}</p>
        {#if gap}<Note tone="warn" role="status" class="gap">{gap}</Note>{/if}
      {:else}
        <h2 id="{uid}-title">Move Week 1 to {weekdayDayMonth(date)}?</h2>
        <p class="lede">{line}. {movedSummary(moved)}</p>
        {#if moved.length > 0}
          <ul class="moved">
            {#each moved.slice(0, 6) as m (m.date + m.from)}
              <li><span class="when">{weekdayDayMonth(m.date)}</span> W{m.from} → W{m.to}</li>
            {/each}
            {#if moved.length > 6}<li class="more">and {moved.length - 6} more</li>{/if}
          </ul>
        {/if}
      {/if}

      {#if error}<p class="line bad" role="alert">{error}</p>{/if}

      <div class="actions">
        {#if step === "confirm"}
          <button type="button" class="btn ghost" disabled={busy} onclick={() => (step = "pick")}>Back</button>
        {/if}
        <span class="grow"></span>
        <button type="button" class="btn" disabled={busy} onclick={cancel}>Cancel</button>
        <button type="submit" class="btn primary" disabled={busy || !!issue || unchanged}>
          {#if mode === "activate"}{busy ? "Activating…" : "Activate program"}
          {:else if step === "pick"}Continue
          {:else}{busy ? "Moving…" : "Move Week 1"}{/if}
        </button>
      </div>
    </form>
  {/if}
</dialog>

<style>
  .start {
    width: min(440px, calc(100vw - 32px));
    padding: 20px 22px 18px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--surface);
    color: var(--ink);
    box-shadow: var(--shadow-overlay);
  }
  .start[open] {
    animation: start-in 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .start::backdrop {
    background: var(--scrim);
  }
  @keyframes start-in {
    from {
      opacity: 0;
      transform: translateY(6px) scale(0.98);
    }
  }
  h2 {
    margin: 0 0 6px;
    font: 600 16px/1.3 var(--font-ui);
    text-wrap: balance;
  }
  .lede {
    margin: 0 0 16px;
    font: 400 13.5px/1.5 var(--font-ui);
    color: var(--muted);
    text-wrap: pretty;
  }
  .label {
    display: block;
    margin-bottom: 6px;
    font: 600 12.5px var(--font-ui);
  }
  .pick {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .pick .date {
    flex: 1 1 100%;
    min-width: 0;
  }
  .btn[aria-pressed="true"] {
    background: var(--active);
    color: var(--ink);
  }
  .line {
    min-height: 1lh;
    margin: 8px 0 18px;
    font: 500 13px/1.45 var(--font-mono);
    color: var(--ink);
  }
  .start :global(.note.gap) {
    margin: -8px 0 18px;
  }
  .moved {
    margin: -6px 0 18px;
    padding: 8px 12px;
    list-style: none;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--well);
    font: 500 12.5px/1.7 var(--font-mono);
  }
  .moved .when {
    display: inline-block;
    min-width: 92px;
    color: var(--muted);
  }
  .moved .more {
    color: var(--muted);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .grow {
    flex: 1;
  }
  @media (max-width: 480px) {
    .grow {
      display: none;
    }
    .actions {
      flex-direction: column-reverse;
      align-items: stretch;
    }
    .btn {
      justify-content: center;
      min-height: 44px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .start[open] {
      animation: none;
    }
  }
</style>
