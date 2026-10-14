<script module lang="ts">
  import type { ClientDto } from "$lib/api/types";

  export interface WeekEntry {
    day: number; // 1=Mon … 7=Sun
    clientId: string;
    sessionName: string;
    status: "logged" | "due" | "today" | "upcoming";
  }

  export interface ClientRow {
    client: ClientDto;
    program: string | null;
    entries: Map<number, WeekEntry>;
  }
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

  let { rows, weekDates, today, currentNames }: Props = $props();

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const dayNumberOf = (iso: string) => Number(iso.slice(8, 10));
  const shortName = (sessionName: string) => sessionName.split("—")[0].trim() || "Session";
</script>

<div class="week-wrap">
  <div class="week-grid">
    <div class="wk-h corner">Client</div>
    {#each weekDates as date, i (date)}
      <div class="wk-h" class:dim={date < today}>
        {DAY_LABELS[i]}<span class="d">{dayNumberOf(date)}</span>
      </div>
    {/each}

    {#each rows as row (row.client.id)}
      <div class="wk-row">
        <div class="wk-client">
          <a href={`/clients/${row.client.id}`}>{row.client.name}</a>
          {#if row.program}
            <span class="meta">
              {row.client.daysPerWeek ?? "—"} d/wk · {currentNames[row.client.id]}
            </span>
          {/if}
        </div>
        {#if row.entries.size === 0}
          <div class="wk-cell span">
            <span class="pill neutral">{row.client.status === "active" ? "no program" : row.client.status}</span>
          </div>
        {:else}
          {#each [1, 2, 3, 4, 5, 6, 7] as d (d)}
            {@const e = row.entries.get(d)}
            <div class="wk-cell">
              {#if e}
                {@const cls = e.status === "logged" ? "done" : e.status === "today" ? "today" : e.status === "due" ? "missed" : "next"}
                <a
                  class="cell {cls}"
                  href={e.status === "logged" ? `/clients/${row.client.id}` : `/clients/${row.client.id}/log`}
                  title={`${row.client.name} — ${e.sessionName}`}
                >
                  <span class="tag">{shortName(e.sessionName)}{#if e.status === "logged"} ✓{:else if e.status === "today"} · due{:else if e.status === "due"} · missed{/if}</span>
                </a>
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
  .week-wrap { overflow-x: auto; padding: 12px 16px; }
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
  .wk-cell { padding: 5px 4px; display: flex; justify-content: center; }
  .wk-cell.span { grid-column: 2 / -1; justify-content: flex-start; }
  .cell {
    width: 100%;
    max-width: 70px;
    min-height: 34px;
    border-radius: 4px;
    border: 1px solid var(--line);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    text-decoration: none;
  }
  .cell:hover { text-decoration: none; filter: brightness(1.05); }
  .cell .tag {
    font: 500 10px/1.2 var(--font-mono);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-align: center;
  }
  .cell.done { background: var(--done-4); border-color: var(--done-4); }
  .cell.done .tag { color: #fff; }
  .cell.today { border-color: var(--blue); border-width: 2px; background: var(--pulse-now-bg); }
  .cell.today .tag { color: var(--blue); }
  .cell.missed { background: var(--bad-bg); border-color: var(--bad-line); }
  .cell.missed .tag { color: var(--bad); }
  .cell.next { background: var(--well); }
  .cell.next .tag { color: var(--muted); }
  .offday { align-self: center; color: var(--faint); font-size: 11px; }
</style>
