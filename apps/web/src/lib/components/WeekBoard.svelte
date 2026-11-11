<script lang="ts">
  /**
   * The overview's training week as a day board: one column per weekday,
   * each listing the clients who train that day (status as ink-on-tint, the
   * session tag under the name). Due, not-logged and missed entries open the
   * logger; the rest open the client. Last week's missed / not-logged days
   * inside the look-back carry over as one line under the board; clients with
   * nothing this week collapse into the idle line. Purely presentational —
   * strips arrive built and sorted (exceptions first) from the page.
   */
  import type { ClientStrip, StripDay } from "$lib/overview";
  import { LOOKBACK_DAYS, addDays, dayDateLabel, daySentence, idleReason, plural } from "$lib/overview";

  interface Props {
    /** Built by `buildClientStrip`, ordered by `exceptionOrder`; every strip has the same weeks. */
    strips: ClientStrip[];
    /** Today as an ISO date. */
    today: string;
  }

  let { strips, today }: Props = $props();

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const STATE_WORDS: Partial<Record<StripDay["status"], string>> = { logged: "done", missed: "missed", unlogged: "to log" };

  const active = $derived(strips.filter((s) => s.exception !== "none"));
  const idle = $derived(strips.filter((s) => s.exception === "none"));
  /** This week's dates, from any strip (they all share them). */
  const days = $derived(strips[0]?.weeks.at(-1)?.map((d) => d.date) ?? []);
  const columns = $derived(
    days.map((date, i) => ({
      date,
      entries: active.flatMap((s) => {
        const d = s.weeks[s.weeks.length - 1][i];
        return d && marks(d) ? [{ s, d }] : [];
      }),
    }))
  );
  /** Earlier weeks' days still open inside the look-back. */
  const carried = $derived.by(() => {
    const since = addDays(today, -LOOKBACK_DAYS);
    return strips.flatMap((s) =>
      s.weeks
        .slice(0, -1)
        .flat()
        .filter((d) => (d.status === "missed" || d.status === "unlogged") && d.date >= since)
        .map((d) => ({ s, d }))
    );
  });

  const marks = (d: StripDay) => d.status !== "rest" && d.status !== "before-start";
  const loggable = (d: StripDay) => d.status === "today" || d.status === "unlogged" || d.status === "missed";
  const tagOf = (d: StripDay) => (d.sessions[0]?.name ?? "Session").split(" + ")[0].split("—")[0].trim() || "Session";
  const logHref = (s: ClientStrip, d: StripDay) =>
    d.openSessionId
      ? `/clients/${s.client.id}/log?session=${encodeURIComponent(d.openSessionId)}&date=${d.date}`
      : `/clients/${s.client.id}/log`;
</script>

<div class="board-wrap">
  <div class="board">
    {#each columns as col, i (col.date)}
      {@const done = col.entries.filter((e) => e.d.status === "logged").length}
      <div class="day" class:now={col.date === today} role="group" aria-label={dayDateLabel(col.date, true)}>
        <div class="head">
          <span class="dow">{DAY_LABELS[i]}</span>
          <span class="date">{Number(col.date.slice(8, 10))}</span>
          {#if col.entries.length}
            <span class="tally" title={`${done} of ${col.entries.length} logged`}>{done}/{col.entries.length}</span>
          {/if}
        </div>
        {#if col.entries.length}
          <ul class="list">
            {#each col.entries as { s, d } (s.client.id)}
              {@const word = STATE_WORDS[d.status]}
              {@const label = daySentence(s.client.name, d)}
              <li>
                <a
                  class="ent {d.status}"
                  href={loggable(d) ? logHref(s, d) : `/clients/${s.client.id}`}
                  aria-label={loggable(d) ? `${label} Open the logger.` : label}
                  title={d.sessions.map((x) => x.name).join(" + ")}
                >
                  <span class="top">
                    <span class="who">{s.client.name}</span>
                    {#if word}<span class="st">{word}</span>{/if}
                  </span>
                  <span class="what">{tagOf(d)}{d.sessions.length > 1 ? ` +${d.sessions.length - 1}` : ""}</span>
                </a>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="rest">Rest</p>
        {/if}
      </div>
    {/each}
  </div>

  {#if carried.length}
    <p class="foot">
      <span class={["pill", carried.some((c) => c.d.status === "missed") ? "bad" : "warn"]}>From last week</span>
      {#each carried as { s, d } (s.client.id + d.date)}
        <span class="carry">
          <b>{s.client.name}</b> · {tagOf(d)}
          <span class="when">{dayDateLabel(d.date)}</span>
          <a href={logHref(s, d)} aria-label={`${daySentence(s.client.name, d)} Open the logger.`}>Log</a>
        </span>
      {/each}
    </p>
  {/if}

  {#if idle.length}
    <p class="foot">
      <span>No sessions this week:</span>
      <span class="idle" aria-label={plural(idle.length, "client")}>
        {#each idle as s (s.client.id)}
          <span class="carry"><a href={`/clients/${s.client.id}`}>{s.client.name}</a> <span class="pill neutral">{idleReason(s)}</span></span>
        {/each}
      </span>
    </p>
  {/if}
</div>

<style>
  .board-wrap { container: weekboard / inline-size; }
  .board { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); }
  .day { min-width: 0; padding: 0 6px 12px; border-right: 1px solid var(--line-soft); }
  .day:last-child { border-right: 0; }
  /* Today's column: the quiet Pulse band, header to last entry. */
  .day.now { background: color-mix(in srgb, var(--pulse-now-bg) 45%, transparent); }
  .head { display: flex; align-items: baseline; gap: 4px; padding: 10px 2px 8px; }
  .dow { font: 600 13px/1.2 var(--font-ui); color: var(--ink); }
  .date { font: 400 11px/1 var(--font-mono); color: var(--faint); }
  .now .dow, .now .date { color: var(--blue); }
  .tally { margin-left: auto; font: 400 11px/1 var(--font-mono); font-variant-numeric: tabular-nums; color: var(--muted); }
  .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }

  .ent {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: 5px 7px;
    border-radius: 4px;
    border: 1px solid var(--line);
    background: var(--well);
    color: var(--muted);
    min-width: 0;
  }
  .ent:hover { border-color: var(--ink); text-decoration: none; }
  .ent:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; box-shadow: 0 0 0 2px var(--surface); }
  .top { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
  .who { font: 600 12px/1.3 var(--font-ui); color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .st { margin-left: auto; font: 500 10px/1 var(--font-ui); white-space: nowrap; }
  .what { font: 400 11px/1.3 var(--font-ui); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* Loudest first, as in the grid: missed > to log > due today > planned ≈ done. */
  .ent.logged { background: var(--good-bg); border-color: var(--good-line); color: var(--done-ink); }
  .ent.missed { background: var(--bad-fill); border-color: var(--bad); box-shadow: inset 0 0 0 1px var(--bad); color: var(--bad-ink); }
  .ent.missed .who, .ent.missed .what { color: var(--bad-ink); }
  .ent.missed .st { font-weight: 600; }
  .ent.unlogged { background: var(--warn-bg); border-color: var(--warn); color: var(--warn-ink); }
  .ent.today { background: var(--pulse-now-bg); border-color: var(--blue); box-shadow: inset 0 0 0 1px var(--blue); color: var(--blue); }
  .rest { margin: 4px 2px 0; font: 400 12px/1.4 var(--font-ui); color: var(--faint); }

  .foot {
    margin: 0;
    border-top: 1px solid var(--line-soft);
    padding: 10px 16px;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 16px;
    font-size: 13px;
    color: var(--muted);
  }
  .foot b, .foot a { font-weight: 500; }
  .foot b { color: var(--ink); }
  .idle { display: contents; }
  .carry { white-space: nowrap; }
  .when { font: 400 12px/1 var(--font-mono); margin: 0 4px; }
  .foot .pill.neutral { font-size: 11px; padding: 0 6px; }

  /* Too narrow for seven columns: each day becomes a row, entries flow beside its label. */
  @container weekboard (max-width: 600px) {
    .board { grid-template-columns: 1fr; }
    .day {
      display: grid;
      grid-template-columns: 64px minmax(0, 1fr);
      align-items: start;
      gap: 8px;
      padding: 8px 12px;
      border-right: 0;
      border-bottom: 1px solid var(--line-soft);
    }
    .day:last-child { border-bottom: 0; }
    .head { flex-wrap: wrap; padding: 4px 0 0; }
    .tally { margin-left: 0; flex-basis: 100%; }
    .list { flex-direction: row; flex-wrap: wrap; }
    .list li { min-width: 0; flex: 1 1 120px; max-width: 200px; }
    .rest { margin: 4px 0 0; }
    .foot { padding: 10px 12px; }
  }
</style>
