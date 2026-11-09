<script module lang="ts">
  export type { ClientRow, WeekEntry } from "$lib/overview";
</script>

<script lang="ts">
  /**
   * Contributions-style training-week grid. Purely presentational — row
   * building and status derivation stay in the owning page, which passes
   * ready-made rows plus the week's ISO dates (past columns dim, the
   * today column derives from `today`).
   */
  interface Props {
    rows: ClientRow[];
    /** 7 ISO dates for Mon–Sun of the displayed week. */
    weekDates: string[];
    /** Today as an ISO date. */
    today: string;
    /** clientId → current program name, for the row meta line. */
    currentNames: Record<string, string>;
  }

  import type { ClientRow } from "$lib/overview";

  let { rows, weekDates, today, currentNames }: Props = $props();

  const STATE = { logged: "done", today: "today", due: "missed" } as const;
  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayNumberOf = (iso: string) => Number(iso.slice(8, 10));
  /** The logger, opened on this cell's session and date. */
  const logHref = (clientId: string, sessionId: string | undefined, date: string) =>
    sessionId ? `/clients/${clientId}/log?session=${encodeURIComponent(sessionId)}&date=${date}` : `/clients/${clientId}/log`;
  const shortName = (sessionName: string) => sessionName.split(" + ")[0].split("—")[0].trim() || "Session";
</script>

<div class="week-wrap">
  <div class="week-grid">
    <div class="wk-h corner">Client</div>
    {#each weekDates as date, i (date)}
      <div class="wk-h" class:dim={date < today} class:now={date === today}>
        {DAY_LABELS[i]}<span class="d">{dayNumberOf(date)}</span>
      </div>
    {/each}

    {#each rows as row (row.client.id)}
      <div class="wk-row">
        <div class="wk-client">
          <a href={`/clients/${row.client.id}`}>{row.client.name}</a>
          {#if row.program}
            <span class="meta">
              {row.client.sessionsPerWeek ?? "—"}/wk · {currentNames[row.client.id]}
            </span>
          {/if}
          {#if row.unscheduled && row.entries.size > 0}
            <span class="meta">+{row.unscheduled} any day</span>
          {/if}
          {#if row.cardio}
            <span class="meta cardio">cardio {row.cardio.done}/{row.cardio.target} {row.cardio.unitLabel}</span>
          {/if}
        </div>
        {#if row.entries.size === 0}
          <div class="wk-cell span">
            {#if row.program && row.unscheduled}
              <span class="pill neutral">{row.unscheduled} {row.unscheduled === 1 ? "session" : "sessions"} · any day</span>
            {:else}
              <span class="pill neutral">{row.client.status === "active" ? "no program" : row.client.status}</span>
            {/if}
          </div>
        {:else}
          {#each [1, 2, 3, 4, 5, 6, 7] as d (d)}
            {@const e = row.entries.get(d)}
            <div class="wk-cell">
              {#if e}
                {@const cls = e.status === "logged" ? "done" : e.status === "today" ? "today" : e.status === "due" ? "missed" : "next"}
                {@const label = `${row.client.name}, ${DAY_LABELS[d - 1]}: ${e.sessionName}${e.status === "upcoming" ? ", upcoming" : `, ${STATE[e.status]}`}`}
                {#snippet body()}
                  {#if (e.count ?? 1) > 1}<span class="more">{e.count}</span>{/if}
                  <span class="tag">{shortName(e.sessionName)}</span>
                  {#if e.status !== "upcoming"}<span class="state">{STATE[e.status]}</span>{/if}
                {/snippet}
                {#if e.status === "upcoming"}
                  <!-- Not loggable yet (the logger refuses future dates), so not a link. -->
                  <span class="cell {cls}" title={`${row.client.name} — ${e.sessionName}`} role="img" aria-label={label}>{@render body()}</span>
                {:else}
                  <a
                    class="cell {cls}"
                    href={e.status === "logged" ? `/clients/${row.client.id}` : logHref(row.client.id, e.sessionId, weekDates[d - 1])}
                    title={`${row.client.name} — ${e.sessionName}`}
                    aria-label={label}
                  >{@render body()}</a>
                {/if}
              {:else}
                <span class="offday">—</span>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .week-wrap { overflow-x: auto; padding: 12px 16px; container-type: inline-size; }
  .week-grid {
    display: grid;
    grid-template-columns: 104px repeat(7, minmax(52px, 1fr));
    min-width: 480px;
  }
  .wk-h {
    font: 500 12px/1.4 var(--font-ui);
    color: var(--muted);
    padding: 8px 4px;
    text-align: center;
  }
  .wk-h .d { display: block; font: 400 11px/1.6 var(--font-ui); color: var(--faint); }
  .wk-h.dim { color: var(--faint); }
  .wk-h.now { color: var(--blue); font-weight: 600; }
  .wk-h.now .d { color: var(--blue); }
  .wk-h.corner { text-align: left; padding-left: 12px; }
  .wk-row { display: contents; }
  .wk-client { padding: 8px 4px 8px 12px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .wk-client a { color: var(--ink); font-weight: 600; }
  .wk-client .meta {
    font: 400 11px/1.4 var(--font-ui);
    color: var(--faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wk-client .meta.cardio { color: var(--muted); }
  .wk-cell { padding: 5px 4px; display: flex; justify-content: center; }
  .wk-cell.span { grid-column: 2 / -1; justify-content: flex-start; }
  .cell {
    width: 100%;
    max-width: 70px;
    min-height: 34px;
    border-radius: 4px;
    border: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 3px 2px;
    text-decoration: none;
  }
  a.cell:hover { text-decoration: none; filter: brightness(1.05); }
  .cell .tag {
    font: 500 10px/1.2 var(--font-mono);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-align: center;
  }
  .cell .tag { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cell .state { font: 400 10px/1.2 var(--font-ui); }
  .cell.done .state { color: var(--on-done); }
  .cell.today .state { color: var(--blue); font-weight: 600; }
  .cell.missed .state { color: var(--bad); }
  .cell.done { background: var(--done-4); border-color: var(--done-4); }
  .cell.done .tag { color: var(--on-done); }
  .cell.today { border-color: var(--blue); border-width: 2px; background: var(--pulse-now-bg); }
  .cell.today .tag { color: var(--blue); }
  .cell.missed { background: var(--bad-bg); border-color: var(--bad-line); }
  .cell.missed .tag { color: var(--bad); }
  .cell.next { background: var(--well); }
  .cell.next .tag { color: var(--muted); }
  .cell { position: relative; }
  .cell .more {
    position: absolute;
    top: 2px;
    right: 3px;
    font: 500 9px/1 var(--font-mono);
    opacity: 0.8;
  }
  /* Keep the session tag clear of the corner count badge. */
  .cell:has(.more) .tag { padding-right: 8px; }
  .cell.done .more { color: var(--on-done); }
  .cell.today .more { color: var(--blue); }
  .cell.missed .more { color: var(--bad); }
  .cell.next .more { color: var(--muted); }
  .offday { align-self: center; color: var(--faint); font-size: 11px; }

  /* Narrow panels: the client column becomes a label row above its week,
     so all seven days fit without sideways scrolling. */
  @container (max-width: 520px) {
    .week-grid { grid-template-columns: repeat(7, minmax(0, 1fr)); min-width: 0; }
    .wk-h.corner { display: none; }
    .wk-h { padding: 4px 2px 6px; }
    .wk-client {
      grid-column: 1 / -1;
      flex-direction: row;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 10px;
      padding: 12px 2px 4px;
      border-top: 1px solid var(--line-soft);
    }
    .wk-client .meta { max-width: 100%; }
    .wk-cell { padding: 4px 2px; }
    .wk-cell.span { grid-column: 1 / -1; }
  }
</style>
