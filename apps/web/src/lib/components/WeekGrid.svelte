<script module lang="ts">
  export type { ClientStrip, StripDay, StripSession } from "$lib/overview";
</script>

<script lang="ts">
  /**
   * The overview's contributions grid. One row per client: up to five past
   * weeks as small squares shaded by logged volume (vs the client's usual day),
   * then this week as labelled cells. Purely presentational — strips arrive
   * built and sorted (exceptions first) from the page; clients with nothing
   * this week collapse into one line at the bottom.
   *
   * Every non-rest day explains itself: hover/focus shows a tooltip, a click
   * (tap) pins it as a popover whose due sessions link to the logger. Past
   * weeks are one tab stop per client (arrow keys move between days); they
   * drop oldest-first as the panel narrows.
   */
  import { tick } from "svelte";
  import type { ClientStrip, StripDay } from "$lib/overview";
  import { LEVEL_WORDS, SESSION_WORDS, dayDateLabel, daySentence, idleReason, plural, sessionLine, volumeLabel } from "$lib/overview";

  interface Props {
    /** Built by `buildClientStrip`, ordered by `exceptionOrder`; every strip has the same weeks. */
    strips: ClientStrip[];
    /** Today as an ISO date. */
    today: string;
  }

  let { strips, today }: Props = $props();

  const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const shortDate = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

  const active = $derived(strips.filter((s) => s.exception !== "none"));
  const idle = $derived(strips.filter((s) => s.exception === "none"));
  /** Calendar weeks, from any strip (they all share them). */
  const calendar = $derived(strips[0]?.weeks.map((w) => w.map((d) => d.date)) ?? []);
  const thisWeek = $derived(calendar[calendar.length - 1] ?? []);
  const pastWeeks = $derived(calendar.slice(0, -1));

  /** The logger, opened on a session and date. */
  const logHref = (clientId: string, sessionId: string | null | undefined, date: string) =>
    sessionId ? `/clients/${clientId}/log?session=${encodeURIComponent(sessionId)}&date=${date}` : `/clients/${clientId}/log`;
  /** Extra sessions on a day show as marks under the tag — one each, up to this many. */
  const MAX_MARKS = 3;
  /** In-cell state word at wider widths; today's cell has none (ring + header say it). */
  const STATE_WORDS: Partial<Record<StripDay["status"], string>> = { logged: "done", missed: "missed", unlogged: "to log" };
  const tagOf = (name: string) => name.split(" + ")[0].split("—")[0].trim() || "Session";
  const marks = (d: StripDay) => d.status !== "rest" && d.status !== "before-start";
  /** Due, not logged yet, or missed: the cell (and the popover's Log link) opens the logger. */
  const loggable = (d: { status: string }) => d.status === "today" || d.status === "unlogged" || d.status === "missed";
  const metaOf = (s: ClientStrip) =>
    [
      s.program ? `${s.client.sessionsPerWeek ?? "—"}/wk` : null,
      s.unscheduled ? `+${s.unscheduled} any day` : null,
      s.cardio ? `cardio ${s.cardio.done}/${s.cardio.target} ${s.cardio.unitLabel}` : null,
    ]
      .filter((m): m is string => !!m);

  // ── Legend: only what this data draws ──
  const LEGEND_WORDS = { logged: "Done", missed: "Missed", unlogged: "Not logged", today: "Due today", upcoming: "Planned" } as const;
  type LegendState = keyof typeof LEGEND_WORDS;
  const legend = $derived.by(() => {
    const seen = new Set<string>();
    let ramp = false;
    for (const s of active) {
      s.weeks.forEach((w, i) => {
        const current = i === s.weeks.length - 1;
        for (const d of w) {
          // Past logged days read on the ramp; this week's done cells get their own swatch.
          if (d.status === "logged" && !current) ramp = true;
          else seen.add(d.status);
        }
      });
    }
    return { ramp, states: (Object.keys(LEGEND_WORDS) as LegendState[]).filter((st) => seen.has(st)) };
  });

  // ── Tooltip / popover: one floating card, anchored to the square or cell ──
  type Tip = { strip: ClientStrip; day: StripDay; x: number; y: number; below: boolean; pinned: boolean; anchor: HTMLElement };
  let tip = $state<Tip | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let card = $state<HTMLDivElement>();
  const uid = $props.id();
  const tipId = `wk-tip-${uid}`;

  function place(anchor: HTMLElement) {
    const r = anchor.getBoundingClientRect();
    const below = r.top < 160;
    return { x: Math.min(Math.max(r.left + r.width / 2, 130), window.innerWidth - 130), y: below ? r.bottom + 6 : r.top - 6, below };
  }
  function show(strip: ClientStrip, day: StripDay, anchor: HTMLElement, delay: number) {
    if (tip?.pinned) return;
    clearTimeout(timer);
    timer = setTimeout(() => (tip = { strip, day, anchor, pinned: false, ...place(anchor) }), delay);
  }
  function hide() {
    clearTimeout(timer);
    if (!tip?.pinned) tip = null;
  }
  /** Click/tap pins the card; from the keyboard (Enter/Space) focus moves into it. */
  async function pin(e: MouseEvent, strip: ClientStrip, day: StripDay) {
    const anchor = e.currentTarget as HTMLElement;
    clearTimeout(timer);
    if (tip?.pinned && tip.anchor === anchor) {
      tip = null;
      return;
    }
    tip = { strip, day, anchor, pinned: true, ...place(anchor) };
    if (e.detail === 0) {
      await tick();
      card?.querySelector<HTMLElement>("a")?.focus();
    }
  }
  function close(refocus: boolean) {
    const anchor = tip?.anchor;
    tip = null;
    if (refocus) anchor?.focus();
  }

  $effect(() => {
    if (!tip) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(true);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!card?.contains(t) && !tip?.anchor.contains(t)) close(false);
    };
    const onScroll = () => close(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
    };
  });
  $effect(() => () => clearTimeout(timer));

  // ── Past weeks: one tab stop per client, arrows move between days ──
  let current = $state<Record<string, string>>({});
  /** Default tab stop: the latest marked past day — the latest week shows at every width. */
  const lastMarked = (s: ClientStrip) => s.weeks.slice(0, -1).flat().filter(marks).at(-1)?.date;
  const stopOf = (s: ClientStrip) => current[s.client.id] ?? lastMarked(s);

  function rove(e: KeyboardEvent, s: ClientStrip) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(e.key)) return;
    const group = e.currentTarget as HTMLElement;
    const items = [...group.querySelectorAll<HTMLButtonElement>("button.sq")].filter((b) => b.offsetParent !== null);
    if (items.length === 0) return;
    e.preventDefault();
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : Math.min(items.length - 1, Math.max(0, at + (e.key === "ArrowLeft" ? -1 : 1)));
    current[s.client.id] = items[next].dataset.date!;
    items[next].focus();
  }
</script>

<div class="week-wrap">
  <div class="wk-in">
    <div class="wk" role="table" aria-label="Training week by client, this week and the five before">
      <div class="wk-head" role="rowgroup">
        <div class="wk-tr" role="row">
          <div class="wk-client corner" role="columnheader">Client</div>
          <div class="hist" role="columnheader">
            <span class="sr">Earlier weeks</span>
            <span class="hw-labels" aria-hidden="true">
              {#each pastWeeks as w (w[0])}<span class="hw-label">{shortDate(w[0])}</span>{/each}
            </span>
          </div>
          {#each thisWeek as date, i (date)}
            <div class="wk-day" class:now={date === today} role="columnheader" aria-label={dayDateLabel(date, true)}>
              {DAY_LABELS[i]}<span class="d">{Number(date.slice(8, 10))}</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="wk-body" role="rowgroup">
        {#each active as s (s.client.id)}
          {@const meta = metaOf(s)}
          <div class="wk-tr" role="row">
            <div class="wk-client" role="rowheader">
              <a href={`/clients/${s.client.id}`} title={s.program ?? undefined}>{s.client.name}</a>
              {#if meta.length}
                <span class="meta">
                  {#each meta as m, i (m)}<span>{m}{i < meta.length - 1 ? " ·" : ""}</span>{/each}
                </span>
              {/if}
            </div>

            <div class="hist" role="cell">
              <!-- Roving focus: arrow keys bubble up from the day buttons inside. -->
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div class="hist-days" onkeydown={(e) => rove(e, s)} role="group" aria-label={`${s.client.name}, earlier weeks`}>
                {#each s.weeks.slice(0, -1) as w (w[0].date)}
                  <div class="hw">
                    {#each w as d (d.date)}
                      {#if marks(d)}
                        <button
                          type="button"
                          class="sq {d.status}"
                          data-level={d.status === "logged" ? d.level : undefined}
                          data-date={d.date}
                          tabindex={stopOf(s) === d.date ? 0 : -1}
                          aria-label={daySentence(s.client.name, d)}
                          aria-expanded={tip?.pinned && tip.day === d ? "true" : "false"}
                          aria-controls={tip?.pinned && tip.day === d ? tipId : undefined}
                          onpointerenter={(e) => e.pointerType === "mouse" && show(s, d, e.currentTarget, 150)}
                          onpointerleave={hide}
                          onfocus={(e) => {
                            current[s.client.id] = d.date;
                            show(s, d, e.currentTarget, 0);
                          }}
                          onblur={hide}
                          onclick={(e) => pin(e, s, d)}
                        ></button>
                      {:else}
                        <span class="sq rest" aria-hidden="true"></span>
                      {/if}
                    {/each}
                  </div>
                {/each}
              </div>
            </div>

            {#each s.weeks[s.weeks.length - 1] as d (d.date)}
              {@const extras = d.sessions.slice(1, 1 + MAX_MARKS)}
              <div class="wk-cell" class:now={d.date === today} role="cell">
                {#if marks(d)}
                  {@const label = daySentence(s.client.name, d)}
                  {#snippet body()}
                    {@const tag = tagOf(d.sessions[0].name)}
                    <span class="tag" class:word={!tag.includes(" ")} class:longword={tag.split(" ").some((w) => w.length > 8)}>{tag}</span>
                    <span class="foot">
                      {#each extras as x, i (i)}<span class="mk {x.kind}"></span>{/each}
                      {#if STATE_WORDS[d.status]}<span class="state">{STATE_WORDS[d.status]}</span>{/if}
                    </span>
                  {/snippet}
                  {#if loggable(d)}
                    <a
                      class="cell {d.status}"
                      href={logHref(s.client.id, d.openSessionId, d.date)}
                      aria-label={`${label} Open the logger.`}
                      onpointerenter={(e) => e.pointerType === "mouse" && show(s, d, e.currentTarget, 150)}
                      onpointerleave={hide}
                      onfocus={(e) => show(s, d, e.currentTarget, 0)}
                      onblur={hide}
                    >{@render body()}</a>
                  {:else}
                    <button
                      type="button"
                      class="cell {d.status}"
                      aria-label={label}
                      aria-expanded={tip?.pinned && tip.day === d ? "true" : "false"}
                      aria-controls={tip?.pinned && tip.day === d ? tipId : undefined}
                      onpointerenter={(e) => e.pointerType === "mouse" && show(s, d, e.currentTarget, 150)}
                      onpointerleave={hide}
                      onfocus={(e) => show(s, d, e.currentTarget, 0)}
                      onblur={hide}
                      onclick={(e) => pin(e, s, d)}
                    >{@render body()}</button>
                  {/if}
                {:else}
                  <span class="offday" aria-hidden="true"></span>
                {/if}
              </div>
            {/each}
          </div>
        {/each}

        {#if idle.length > 0}
          <div class="wk-tr idle" role="row">
            <div class="idle-line" role="cell" aria-colspan={9}>
              <span class="idle-count">No sessions this week:</span>
              <ul class="idle-names" aria-label={plural(idle.length, "client")}>
                {#each idle as s (s.client.id)}
                  <li><a href={`/clients/${s.client.id}`}>{s.client.name}</a> <span class="pill neutral">{idleReason(s)}</span></li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </div>
    </div>

    {#if active.length > 0}
      <div class="legend" aria-hidden="true">
        {#if legend.ramp}
          <span class="lg">
            Less
            {#each [1, 2, 3, 4] as l (l)}<span class="sq logged" data-level={l}></span>{/each}
            More
          </span>
        {/if}
        {#each legend.states as st (st)}
          <span class="lg"><span class="sw {st}"></span>{LEGEND_WORDS[st]}</span>
        {/each}
      </div>
    {/if}
  </div>
</div>

{#if tip}
  {@const t = tip}
  <div
    bind:this={card}
    id={tipId}
    class="tip"
    class:below={t.below}
    class:pinned={t.pinned}
    style:left="{t.x}px"
    style:top="{t.y}px"
    role={t.pinned ? "dialog" : "tooltip"}
    aria-label={t.pinned ? `${t.strip.client.name}, ${dayDateLabel(t.day.date, true)}` : undefined}
    aria-hidden={t.pinned ? undefined : "true"}
    onfocusout={(e) => t.pinned && !card?.contains(e.relatedTarget as Node) && close(false)}
  >
    <div class="tip-head">
      <strong>{t.strip.client.name}</strong>
      <span>{dayDateLabel(t.day.date)}</span>
    </div>
    <ul>
      {#each t.day.sessions as x, i (i)}
        <li class={x.status}>
          <span class="dot" aria-hidden="true"></span>
          <span class="nm">{x.name}</span>
          <span class="st">{x.loggedOn ? `logged ${dayDateLabel(x.loggedOn)}` : SESSION_WORDS[x.status]}</span>
          {#if t.pinned && x.planned && loggable(x)}
            <a class="go" href={logHref(t.strip.client.id, x.id, t.day.date)} aria-label={`Log ${sessionLine(x)}`}>Log</a>
          {/if}
        </li>
      {/each}
    </ul>
    {#if t.day.volume}
      <div class="tip-vol"><span class="fig">{volumeLabel(t.day.volume)}</span> · {LEVEL_WORDS[t.day.level]}</div>
    {/if}
    {#if t.pinned}
      <a class="tip-client" href={`/clients/${t.strip.client.id}`}>Open {t.strip.client.name}</a>
    {/if}
  </div>
{/if}

<style>
  /* Sizes: 10px squares, 2px gap → 82px a week; weeks 5px apart. */
  .week-wrap { container: weekgrid / inline-size; }
  .wk-in {
    --sq: 10px;
    --sq-gap: 2px;
    --hw: calc(7 * var(--sq) + 6 * var(--sq-gap));
    --client-col: 152px;
    /* 64px fits an eight-letter uppercase mono tag ("STRENGTH") on one line. */
    --day-min: 64px;
    padding: 12px 16px;
  }
  .wk { display: flex; flex-direction: column; }
  .wk-tr {
    display: grid;
    grid-template-columns: var(--client-col) auto repeat(7, minmax(var(--day-min), 1fr));
    column-gap: 4px;
    align-items: center;
  }
  .wk-body .wk-tr + .wk-tr { border-top: 1px solid var(--line-soft); }

  /* Header */
  .wk-day, .corner, .hist[role="columnheader"] {
    font: 500 12px/1.4 var(--font-ui);
    color: var(--muted);
    padding: 6px 2px 8px;
    text-align: center;
  }
  .corner { text-align: left; padding-left: 4px; }
  .wk-day .d { display: block; font: 400 11px/1.6 var(--font-mono); color: var(--faint); }
  .wk-day.now, .wk-day.now .d { color: var(--blue); font-weight: 600; }
  /* Today's column: a quiet band of the Pulse tint from header to last row. */
  .wk-day.now, .wk-cell.now { background: color-mix(in srgb, var(--pulse-now-bg) 45%, transparent); }
  .wk-day.now { border-radius: 4px 4px 0 0; }
  .hist[role="columnheader"] { padding-right: 12px; }
  .hw-labels { display: flex; gap: 5px; }
  .hw-label {
    width: var(--hw);
    font: 400 11px/1.6 var(--font-mono);
    color: var(--faint);
    text-align: left;
    align-self: end;
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Client column */
  .wk-client { padding: 8px 4px; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .wk-client a { color: var(--ink); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .wk-client .meta {
    font: 400 11px/1.4 var(--font-mono);
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    column-gap: 0.5ch;
  }
  .wk-client .meta span { white-space: nowrap; }

  /* Past weeks */
  .hist[role="cell"] { padding-right: 12px; }
  .hist-days { display: flex; gap: 5px; }
  .hw { display: flex; gap: var(--sq-gap); }
  .sq {
    width: var(--sq);
    height: var(--sq);
    border-radius: 2px;
    border: 1px solid transparent;
    padding: 0;
    background: var(--well-2);
    flex: none;
    cursor: default;
  }
  button.sq { cursor: pointer; }
  .sq.rest, .sq.before-start { background: var(--well-2); opacity: 0.55; }
  .sq.logged[data-level="1"] { background: var(--done-1); }
  .sq.logged[data-level="2"] { background: var(--done-2); }
  .sq.logged[data-level="3"] { background: var(--done-3); }
  .sq.logged[data-level="4"] { background: var(--done-4); }
  .sq.missed { background: var(--bad-bg); border-color: var(--bad); }
  .sq.unlogged { background: var(--warn-bg); border-color: var(--warn); }
  .sq.today { background: var(--pulse-now-bg); border-color: var(--blue); }
  /* Faint, not line-strong: the planned outline needs 3:1 on canvas in every palette. */
  .sq.upcoming { background: var(--surface); border-color: var(--faint); }
  button.sq:hover { outline: 1px solid var(--ink); outline-offset: 1px; }

  /* This week */
  /* Stretched to the row so today's band runs unbroken down the column. */
  .wk-cell { padding: 6px 0; display: flex; justify-content: center; align-items: center; align-self: stretch; min-width: 0; }
  /* Every this-week cell is the same height at a given width: the tag clamps
     to two lines, extras are marks, never extra text lines. */
  .cell {
    width: 100%;
    max-width: 76px;
    height: 52px;
    border-radius: 4px;
    border: 1px solid var(--line);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    padding: 3px;
    overflow: hidden;
    text-decoration: none;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  a.cell:hover { text-decoration: none; }
  .cell:hover { border-color: var(--ink); }
  .cell .tag {
    font: 500 10px/1.2 var(--font-mono);
    letter-spacing: 0.02em;
    text-transform: uppercase;
    text-align: center;
    max-width: 100%;
    hyphens: auto;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  /* A word never breaks mid-word: one word, or (in the ~48px uppercase mono
     cells) any tag with a word over eight letters, stays on one line and ellipsizes. */
  .cell .tag.word, .cell .tag.longword { display: block; white-space: nowrap; text-overflow: ellipsis; }
  .cell .foot { display: flex; align-items: center; justify-content: center; gap: 3px; max-width: 100%; }
  .cell .state { font: 400 11px/1.2 var(--font-ui); white-space: nowrap; }
  .cell .mk + .state { margin-left: 2px; }
  /* Extra sessions: lifting a square, cardio a disc — shape, not only colour. */
  .mk { flex: none; width: 6px; height: 6px; background: currentColor; }
  .mk.cardio { border-radius: 99px; }
  .cell.logged { background: var(--done-4); border-color: var(--done-4); color: var(--on-done); }
  .cell.logged:hover { border-color: var(--ink); }
  .cell.today { border-color: var(--blue); box-shadow: inset 0 0 0 1px var(--blue); background: var(--pulse-now-bg); color: var(--blue); }
  .cell.missed { background: var(--bad-bg); border-color: var(--bad-line); color: var(--bad); }
  .cell.missed:hover { border-color: var(--bad); }
  .cell.unlogged { background: var(--warn-bg); border-color: var(--warn-line); color: var(--warn-ink); }
  .cell.unlogged:hover { border-color: var(--warn); }
  .cell.upcoming { background: var(--well); color: var(--muted); }
  .offday {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--line);
  }

  /* One focus ring for every fill — ink outline on the canvas gap, clear of blue and green. */
  .sq:focus-visible, .cell:focus-visible {
    outline: 2px solid var(--ink);
    outline-offset: 2px;
    box-shadow: 0 0 0 2px var(--surface);
  }

  /* Clients with nothing this week */
  .wk-tr.idle { display: block; }
  .idle-line {
    padding: 10px 4px 4px;
    font-size: 13px;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 8px;
  }
  .idle-count { font-weight: 500; }
  .idle-names { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px 16px; }
  .idle-names li { display: inline-flex; align-items: baseline; gap: 6px; white-space: nowrap; }
  .idle-names a { font-weight: 500; text-underline-offset: 3px; }
  .idle-names .pill { font-size: 11px; padding: 0 6px; }

  /* Legend */
  .legend {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px 16px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--line-soft);
    font: 400 11px/1.4 var(--font-ui);
    color: var(--muted);
  }
  .lg { display: inline-flex; align-items: center; gap: 3px; }
  .lg .sq + :not(.sq) { margin-left: 2px; }
  /* State swatches are the cells in miniature: same edge, radius and fill. */
  .sw {
    width: 16px;
    height: 12px;
    border-radius: 4px;
    border: 1px solid var(--line);
    margin-right: 2px;
    flex: none;
    display: grid;
    place-items: center;
  }
  /* A short stroke in the cell's text colour stands in for its tag. */
  .sw::after { content: ""; width: 6px; height: 2px; background: currentColor; }
  .sw.logged { background: var(--done-4); border-color: var(--done-4); color: var(--on-done); }
  .sw.missed { background: var(--bad-bg); border-color: var(--bad-line); color: var(--bad); }
  .sw.unlogged { background: var(--warn-bg); border-color: var(--warn-line); color: var(--warn-ink); }
  .sw.today { background: var(--pulse-now-bg); border-color: var(--blue); color: var(--blue); }
  .sw.upcoming { background: var(--well); color: var(--muted); }

  /* Tooltip / popover */
  .tip {
    position: fixed;
    z-index: 60;
    transform: translate(-50%, -100%);
    min-width: 200px;
    max-width: 260px;
    padding: 8px 10px;
    border-radius: 6px;
    background: var(--surface);
    color: var(--ink);
    border: 1px solid var(--line);
    box-shadow: var(--shadow-overlay);
    font: 400 12px/1.45 var(--font-ui);
    pointer-events: none;
  }
  .tip.below { transform: translate(-50%, 0); }
  .tip.pinned { pointer-events: auto; }
  .tip-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
  .tip-head span { color: var(--muted); font-family: var(--font-mono); font-size: 11px; }
  .tip ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; }
  .tip li { display: grid; grid-template-columns: 8px 1fr auto auto; gap: 6px; align-items: baseline; }
  .tip .dot { width: 8px; height: 8px; border-radius: 2px; background: var(--done-3); align-self: center; }
  .tip li.missed .dot { background: var(--bad); }
  .tip li.unlogged .dot { background: var(--warn-bg); box-shadow: inset 0 0 0 1px var(--warn); }
  /* Hollow, so it never reads as a logged dot where the ramp is blue (colourblind). */
  .tip li.today .dot { background: transparent; box-shadow: inset 0 0 0 2px var(--blue); }
  .tip li.upcoming .dot { background: transparent; border: 1px solid var(--line-strong); }
  .tip .st { color: var(--muted); white-space: nowrap; }
  .tip li.missed .st { color: var(--bad); }
  .tip li.unlogged .st { color: var(--warn-ink); }
  .tip li.today .st { color: var(--blue); }
  .tip .go { font-weight: 600; }
  .tip-vol { margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--line-soft); color: var(--muted); }
  .tip-vol .fig { font-family: var(--font-mono); color: var(--ink); }
  .tip-client { display: inline-block; margin-top: 6px; font-weight: 500; }

  /* Drop past weeks oldest-first as the panel narrows (each week ≈ 87px; 5 weeks need ~1106px). */
  @container weekgrid (max-width: 1105px) { .hw:nth-child(1), .hw-label:nth-child(1) { display: none; } }
  @container weekgrid (max-width: 1018px) { .hw:nth-child(2), .hw-label:nth-child(2) { display: none; } }
  @container weekgrid (max-width: 931px) { .hw:nth-child(3), .hw-label:nth-child(3) { display: none; } }
  @container weekgrid (max-width: 844px) { .hw:nth-child(4), .hw-label:nth-child(4) { display: none; } }
  /* Below ~65px cells uppercase mono wraps "STRENGTH / A" and stacks a third
     line over the state word: the tag drops to sentence-case UI type so a name
     ("Lower", "Strength A") fits on one line, or whole over two at the narrowest;
     one long word ellipsizes — the full name is in the label and the tooltip. */
  @container weekgrid (max-width: 844px) {
    .cell .tag.longword:not(.word) { display: -webkit-box; white-space: normal; }
    .cell .tag {
      font: 500 11px/1.2 var(--font-ui);
      text-transform: none;
      letter-spacing: -0.02em;
    }
  }
  /* The latest week stays at every width, so the history column (and its
     header, read by screen readers) always exists: rows are always 9 cells. */
  @container weekgrid (max-width: 757px) {
    .wk-in { --client-col: 112px; --day-min: 48px; }
    /* The last week moves under the client name; days span both lines. */
    .wk-tr { grid-template-columns: var(--client-col) repeat(7, minmax(var(--day-min), 1fr)); }
    .wk-body .wk-client { grid-column: 1; grid-row: 1; padding-bottom: 4px; }
    .hist[role="cell"] { grid-column: 1; grid-row: 2; padding: 0 4px 8px; }
    .wk-body .wk-cell { grid-row: 1 / span 2; }
    /* 48px cells: a two-line tag plus the word would stack three lines. Fill and
       edge carry the state; the word is in the label, tooltip and legend. */
    .cell .state { display: none; }
    .wk-head .hist {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
    }
  }

  /* Narrow: the client becomes a label line above its week, so seven days fit. */
  @container weekgrid (max-width: 520px) {
    .wk-in { padding: 8px 4px; }
    .wk-tr { grid-template-columns: repeat(7, minmax(0, 1fr)); column-gap: 1px; }
    .corner {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
    }
    /* The label line: client left, the last two weeks right; days below. */
    .wk-body .wk-client { grid-column: 1 / 5; grid-row: 1; }
    .hist[role="cell"] { grid-column: 5 / -1; grid-row: 1; justify-self: end; align-self: end; padding: 0 2px 4px; }
    .wk-body .wk-cell { grid-row: 2; }
    .hw:nth-child(4) { display: flex; }
    .wk-client {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 10px;
      padding: 10px 2px 2px;
    }
    .wk-body .wk-cell { padding: 4px 0 8px; }
    .cell { height: 44px; padding: 3px 2px; }
    .legend { justify-content: flex-start; }
  }
  /* Two weeks no longer fit beside the name. */
  @container weekgrid (max-width: 450px) { .hw:nth-child(4) { display: none; } }
</style>
