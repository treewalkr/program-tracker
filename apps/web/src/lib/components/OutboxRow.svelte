<script lang="ts">
  import type { Snippet } from "svelte";
  import { feedbackHandle } from "@pt/shared";
  import { ERROR, KIND, STATUS, lastActivity, latency, span, type OutboxMessage } from "$lib/emailOutbox";
  import { ago } from "$lib/draftReview";
  import Pill from "$lib/ui/Pill.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import CopyButton from "./CopyButton.svelte";

  /**
   * One outbox message: status, recipient (masked), what it was about, and a
   * meta line (attempts, timing). The status + recipient block is the
   * disclosure button; it opens the attempt timeline, identifiers with copy
   * buttons, and the source event. Stacks into a card in narrow containers.
   */
  interface Props {
    message: OutboxMessage;
    /** Clock for relative times (the page ticks it). */
    now?: number;
    /** Start expanded. */
    open?: boolean;
    /** Extra actions in the detail (e.g. Retry / Discard). */
    actions?: Snippet;
  }

  let { message: m, now = Date.now(), open = $bindable(false), actions }: Props = $props();

  const detailId = $props.id();

  const TONE = { queued: "neutral", sending: "neutral", retrying: "warn", dead: "bad", sent: "good" } as const;

  const failure = $derived(m.attempts.findLast((a) => !a.ok)?.error);
  const okAttempt = $derived(m.attempts.find((a) => a.ok));
  const tries = $derived(m.attempts.length);

  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const stamp = (iso: string) =>
    new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

  /** The one fact about this message that matters most right now. */
  const fact = $derived.by(() => {
    switch (m.status) {
      case "queued":
        return `waiting ${span(now - Date.parse(m.createdAt))}`;
      case "sending":
        return "handing to provider";
      case "retrying":
        return m.nextAttemptAt ? `next try in ${span(Date.parse(m.nextAttemptAt) - now)}` : "retry pending";
      case "dead":
        return failure ? (ERROR[failure] ?? failure) : "gave up";
      case "sent":
        return okAttempt?.ms ? `sent in ${latency(okAttempt.ms)}` : "sent";
    }
  });
</script>

<article class="row" class:open data-status={m.status}>
  <div class="line">
    <button type="button" class="toggle" aria-expanded={open} aria-controls={detailId} onclick={() => (open = !open)}>
      <span class="status">
        {#if m.status === "sent"}
          <span class="sent"><span class="dot" aria-hidden="true"></span>Sent</span>
        {:else}
          <Pill tone={TONE[m.status]}><span class="dot" aria-hidden="true"></span>{STATUS[m.status]}</Pill>
        {/if}
      </span>
      <span class="who">
        {#if m.recipient}
          <span class="name">{m.recipient.name}</span>
          <span class="addr">{m.recipient.email}</span>
        {:else}
          <span class="gone">Removed account</span>
        {/if}
      </span>
      <span class="chev" aria-hidden="true"><Icon name="chevron" /></span>
      <span class="sr">{open ? "Hide" : "Show"} details</span>
    </button>
    <div class="what">
      {#if m.feedbackNumber !== null}
        <a href="/feedback#{feedbackHandle(m.feedbackNumber)}">{m.label}</a>
      {:else}
        <span>{m.label}</span>
      {/if}
      <span class="kind">{KIND[m.kind] ?? m.kind}</span>
    </div>
    <div class="meta">
      {#if tries > 1 || m.status === "retrying"}
        <span class="tries" title="Attempts used of {m.maxAttempts}">{tries}/{m.maxAttempts}</span>
      {/if}
      <span class="state {m.status}">{fact}</span>
      <time datetime={lastActivity(m)} title={stamp(lastActivity(m))}>{ago(lastActivity(m), now)}</time>
    </div>
  </div>

  {#if open}
    <div class="detail" id={detailId}>
      <section class="timeline" aria-label="Attempts">
        <h3>Attempts</h3>
        <ol>
          {#each m.attempts as a, i (i)}
            <li class:ok={a.ok} class:fail={!a.ok}>
              <span class="mark" aria-hidden="true"></span>
              <time datetime={a.at} title={stamp(a.at)}>{clock(a.at)}</time>
              <span class="res">
                {#if a.ok}Accepted by provider{:else}{ERROR[a.error ?? ""] ?? a.error ?? "Failed"}{/if}
              </span>
              {#if a.ms !== undefined}<span class="ms">{latency(a.ms)}</span>{/if}
            </li>
          {/each}
          {#if m.status === "sending"}
            <li class="pending"><span class="mark" aria-hidden="true"></span><span class="res">In flight now</span></li>
          {:else if m.status === "queued"}
            <li class="pending">
              <span class="mark" aria-hidden="true"></span><span class="res">Waiting for the dispatcher</span>
            </li>
          {:else if m.status === "retrying" && m.nextAttemptAt}
            <li class="pending">
              <span class="mark" aria-hidden="true"></span>
              <time datetime={m.nextAttemptAt} title={stamp(m.nextAttemptAt)}>{clock(m.nextAttemptAt)}</time>
              <span class="res">Attempt {tries + 1} of {m.maxAttempts}</span>
            </li>
          {:else if m.status === "dead"}
            <li class="end"><span class="mark" aria-hidden="true"></span><span class="res">Gave up after {tries} {tries === 1 ? "attempt" : "attempts"}</span></li>
          {/if}
        </ol>
      </section>

      <dl class="facts">
        <dt>Event</dt>
        <dd>{m.event}</dd>
        <dt>Created</dt>
        <dd><time datetime={m.createdAt}>{stamp(m.createdAt)}</time></dd>
        <dt>Sent</dt>
        <dd>{#if m.sentAt}<time datetime={m.sentAt}>{stamp(m.sentAt)}</time>{:else}<span class="faint">not yet</span>{/if}</dd>
        <dt>Dedupe key</dt>
        <dd class="copyable"><code>{m.dedupeKey}</code><CopyButton text={m.dedupeKey} /></dd>
        <dt>Message id</dt>
        <dd class="copyable"><code>{m.id}</code><CopyButton text={m.id} /></dd>
      </dl>

      {#if actions}<div class="actions">{@render actions()}</div>{/if}
    </div>
  {/if}
</article>

<style>
  .row {
    container-type: inline-size;
    border-bottom: 1px solid var(--line-soft);
  }
  .row:last-child { border-bottom: none; }
  .row.open { background: var(--well); }

  .line {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(15rem, 0.75fr);
    align-items: center;
    gap: 4px 16px;
    padding: 8px 16px 8px 8px;
  }

  .toggle {
    appearance: none;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-width: 0;
    padding: 4px 8px;
    border: none;
    border-radius: var(--radius);
    background: none;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }
  .toggle:hover { background: var(--hover-soft); }
  .chev {
    display: inline-flex;
    color: var(--faint);
    transition: transform 120ms;
  }
  .open .chev { transform: rotate(180deg); }

  .status { display: inline-flex; }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 99px;
    background: currentColor;
    flex: none;
  }
  [data-status="sending"] .dot { background: var(--blue); }
  .sent {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font: 500 12px/1.2 var(--font-ui);
    color: var(--muted);
    padding: 3px 9px;
  }
  .sent .dot { background: var(--green-btn); }

  .who {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .name {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .addr {
    font: 400 12px/1.4 var(--font-mono);
    color: var(--muted);
    white-space: nowrap;
  }
  .gone { color: var(--faint); font-style: italic; }

  .what {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }
  .what a, .what > span:first-child {
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kind {
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
  }

  .meta {
    display: flex;
    align-items: baseline;
    justify-content: flex-end;
    gap: 12px;
    font: 400 12px/1.4 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
    white-space: nowrap;
  }
  .tries {
    padding: 1px 6px;
    border-radius: var(--radius);
    background: var(--chip-bg);
    color: var(--ink);
  }
  .state { font-family: var(--font-ui); }
  .state.retrying { color: var(--warn); }
  .state.dead { color: var(--bad); }
  .meta time { min-width: 7ch; text-align: right; color: var(--faint); }

  /* —— detail —— */
  .detail {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
    gap: 16px 32px;
    padding: 4px 16px 16px 120px;
  }
  h3 {
    margin: 0 0 8px;
    font: 600 12px/1.2 var(--font-ui);
    color: var(--muted);
  }
  .timeline ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .timeline li {
    position: relative;
    display: grid;
    grid-template-columns: 12px max-content minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 8px;
    padding: 3px 0;
    font-size: 13px;
  }
  /* the rail joining attempt marks */
  .timeline li:not(:last-child)::before {
    content: "";
    position: absolute;
    left: 4px;
    top: 15px;
    bottom: -7px;
    width: 1px;
    background: var(--line);
  }
  .mark {
    align-self: center;
    width: 9px;
    height: 9px;
    border-radius: 99px;
    border: 1px solid var(--line-strong);
    background: var(--surface);
  }
  .ok .mark { background: var(--green-btn); border-color: var(--green-btn); }
  .fail .mark { background: var(--bad); border-color: var(--bad); }
  .end .mark { border-color: var(--bad); }
  .pending .mark { border-style: dashed; }
  .timeline time, .ms {
    white-space: nowrap;
    font: 400 12px/1.4 var(--font-mono);
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .pending .res, .end .res { grid-column: 3; color: var(--muted); }
  .pending time + .res { grid-column: auto; }
  .fail .res { color: var(--bad); }
  .ms { text-align: right; }

  .facts {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    gap: 6px 16px;
    margin: 0;
    font-size: 13px;
  }
  .facts dt { color: var(--muted); }
  .facts dd { margin: 0; min-width: 0; }
  .copyable {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .copyable code {
    font: 400 12px/1.4 var(--font-mono);
    padding: 1px 6px;
    border-radius: var(--radius);
    background: var(--chip-bg);
    overflow-wrap: anywhere;
    min-width: 0;
  }
  .faint { color: var(--faint); }
  .actions {
    grid-column: 1 / -1;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* —— narrow: stacked card (status → recipient → label → meta) —— */
  @container (max-width: 640px) {
    .line {
      grid-template-columns: minmax(0, 1fr);
      gap: 2px;
      padding: 8px 12px 10px 4px;
    }
    .toggle {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "status chev" "who chev";
      gap: 6px 8px;
    }
    .status { grid-area: status; }
    .who { grid-area: who; flex-wrap: wrap; gap: 0 8px; }
    .chev { grid-area: chev; }
    .what, .meta { padding-left: 8px; }
    .what { flex-wrap: wrap; gap: 0 8px; }
    .what a, .what > span:first-child { white-space: normal; }
    .meta { justify-content: flex-start; flex-wrap: wrap; gap: 4px 12px; }
    .meta time { min-width: 0; text-align: left; }
    .detail {
      grid-template-columns: minmax(0, 1fr);
      padding: 4px 12px 14px;
    }
  }
  @container (max-width: 380px) {
    .facts { grid-template-columns: minmax(0, 1fr); gap: 0; }
    .facts dd { margin-bottom: 6px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .chev { transition: none; }
  }
</style>
