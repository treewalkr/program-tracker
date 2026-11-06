<script lang="ts">
  import type { ProgramSessionDto } from "$lib/api/types";
  import { MAX_SESSIONS_PER_WEEKDAY, sessionTag, sessionsByWeekday, type SessionFocus } from "@pt/shared";

  /**
   * Week placement board: Mon–Sun columns plus an "Any day" tray. Sessions drag
   * between days, stack inside a day, and reorder within it; Alt+arrows do the
   * same from the keyboard. Placement only — content is edited below.
   */
  let {
    sessions,
    editable,
    focusOf,
    selected = null,
    onplace,
    onselect,
  }: {
    sessions: ProgramSessionDto[];
    editable: boolean;
    focusOf: (s: ProgramSessionDto) => SessionFocus;
    selected?: string | null;
    onplace: (id: string, weekday: number | null, index: number) => void;
    onselect: (id: string) => void;
  } = $props();

  const DAYS = [1, 2, 3, 4, 5, 6, 7];
  const NAMES = ["Any day", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const FOCUS: Record<SessionFocus, string> = { lower: "Lower", upper: "Upper", full: "Full body", none: "" };

  const byDay = $derived(sessionsByWeekday(sessions));
  let dragging = $state<string | null>(null);
  let over = $state<{ day: number; index: number } | null>(null);

  const dayOf = (id: string) => sessions.find((s) => s.id === id)?.weekday ?? 0;
  const full = (day: number) =>
    day !== 0 && (byDay.get(day)?.length ?? 0) >= MAX_SESSIONS_PER_WEEKDAY && (dragging == null || dayOf(dragging) !== day);

  function summary(s: ProgramSessionDto): string {
    if (s.kind === "cardio" && s.cardio) {
      return [s.cardio.modality, s.cardio.durationMin ? `${s.cardio.durationMin} min` : null, s.cardio.hrZone ? `Z${s.cardio.hrZone}` : null]
        .filter(Boolean)
        .join(" · ");
    }
    const f = FOCUS[focusOf(s)];
    const n = s.exercises.length;
    return [f, `${n} ex`].filter(Boolean).join(" · ");
  }

  function drop(day: number, index: number) {
    if (dragging && !full(day)) onplace(dragging, day === 0 ? null : day, index);
    dragging = null;
    over = null;
  }

  function overCard(e: DragEvent, day: number, i: number) {
    if (!dragging || full(day)) return;
    e.preventDefault();
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    over = { day, index: e.clientY > r.top + r.height / 2 ? i + 1 : i };
  }

  function overColumn(e: DragEvent, day: number) {
    if (!dragging || full(day)) return;
    e.preventDefault();
    if (over?.day !== day) over = { day, index: byDay.get(day)?.length ?? 0 };
  }

  /** Alt+←/→ moves to the previous/next day (Any day sits before Mon); Alt+↑/↓ reorders. */
  function key(e: KeyboardEvent, s: ProgramSessionDto, day: number, i: number) {
    if (!editable || !e.altKey) return;
    const list = byDay.get(day) ?? [];
    let target: { day: number; index: number } | null = null;
    if (e.key === "ArrowUp" && i > 0) target = { day, index: i - 1 };
    if (e.key === "ArrowDown" && i < list.length - 1) target = { day, index: i + 1 };
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const step = e.key === "ArrowLeft" ? -1 : 1;
      for (let d = day + step; d >= 0 && d <= 7; d += step) {
        if ((byDay.get(d)?.length ?? 0) < MAX_SESSIONS_PER_WEEKDAY || d === 0) {
          target = { day: d, index: byDay.get(d)?.length ?? 0 };
          break;
        }
      }
    }
    if (!target) return;
    e.preventDefault();
    onplace(s.id, target.day === 0 ? null : target.day, target.index);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cal-id="${s.id}"]`)?.focus());
  }
</script>

{#snippet column(day: number)}
  {@const list = byDay.get(day) ?? []}
  <div
    class="col"
    class:tray={day === 0}
    class:empty={list.length === 0}
    class:target={over?.day === day}
    class:blocked={dragging != null && full(day)}
    role="group"
    aria-label={day === 0 ? "Unscheduled sessions" : NAMES[day]}
    ondragover={(e) => overColumn(e, day)}
    ondragleave={(e) => {
      if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) over = null;
    }}
    ondrop={(e) => {
      e.preventDefault();
      drop(day, over?.day === day ? over.index : list.length);
    }}
  >
    <div class="dayname">
      {NAMES[day]}
      {#if list.length > 1}<span class="count">{list.length}</span>{/if}
    </div>
    {#each list as s, i (s.id)}
      {#if over?.day === day && over.index === i && dragging !== s.id}<div class="slot" aria-hidden="true"></div>{/if}
      <button
        type="button"
        class="card"
        class:cardio={s.kind === "cardio"}
        class:sel={selected === s.id}
        class:ghost={dragging === s.id}
        data-cal-id={s.id}
        draggable={editable}
        title={editable ? "Drag to another day, or Alt+arrow keys" : undefined}
        aria-label="{sessionTag(s)}, {s.name}, {day === 0 ? 'any day' : NAMES[day]}"
        onclick={() => onselect(s.id)}
        onkeydown={(e) => key(e, s, day, i)}
        ondragstart={(e) => {
          dragging = s.id;
          e.dataTransfer?.setData("text/plain", s.id);
          if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
        }}
        ondragend={() => {
          dragging = null;
          over = null;
        }}
        ondragover={(e) => overCard(e, day, i)}
      >
        <span class="tag">{sessionTag(s)}</span>
        <span class="name">{s.name}</span>
        <span class="meta">{summary(s)}</span>
      </button>
    {/each}
    {#if over?.day === day && over.index >= list.length}<div class="slot" aria-hidden="true"></div>{/if}
    {#if list.length === 0 && day !== 0}<span class="rest">Rest</span>{/if}
    {#if list.length === 0 && day === 0}<span class="rest">{editable ? "Drop here for “any day”" : "None"}</span>{/if}
  </div>
{/snippet}

<div class="cal" class:dragging={dragging != null}>
  <div class="week">
    {#each DAYS as d (d)}{@render column(d)}{/each}
  </div>
  {#if editable || (byDay.get(0)?.length ?? 0) > 0}
    {@render column(0)}
  {/if}
</div>

<style>
  .cal { display: flex; flex-direction: column; gap: 8px; margin: 0 0 18px; }
  .week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 92px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    transition: border-color 0.12s, background 0.12s;
  }
  .col.empty:not(.tray) { background: var(--well); }
  .col.tray { min-height: 0; flex-direction: row; flex-wrap: wrap; align-items: stretch; border-style: dashed; }
  .col.tray .dayname { width: 100%; }
  .col.tray .card { width: 180px; }
  .col.target { border-color: var(--focus); background: var(--surface); }
  .cal.dragging .col.blocked { opacity: 0.45; }
  .dayname { display: flex; align-items: center; gap: 6px; font: 600 11.5px var(--font-ui); color: var(--muted); }
  .count { font: 500 10.5px var(--font-mono); color: var(--faint); }
  .rest { font-size: 11.5px; color: var(--faint); margin-top: auto; }
  .col.tray .rest { margin-top: 0; }

  .card {
    display: flex;
    flex-direction: column;
    gap: 2px;
    text-align: left;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-left: 3px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--surface);
    font: inherit;
    color: var(--ink);
    cursor: pointer;
    min-width: 0;
  }
  .card[draggable="true"] { cursor: grab; }
  .card.cardio { border-left-color: var(--good); }
  .card:hover { background: var(--well); }
  .card.sel { border-color: var(--focus); border-left-width: 3px; }
  .card.ghost { opacity: 0.35; }
  .card:focus-visible { outline: 2px solid var(--focus); outline-offset: 1px; }
  .tag { font: 500 10.5px var(--font-mono); color: var(--muted); text-transform: uppercase; letter-spacing: 0.02em; }
  .name { font: 600 12.5px/1.25 var(--font-ui); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .meta { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .slot { height: 3px; border-radius: 2px; background: var(--focus); }

  @media (max-width: 760px) {
    .week { grid-template-columns: minmax(0, 1fr); gap: 4px; }
    .col:not(.tray) { display: grid; grid-template-columns: 40px minmax(0, 1fr); align-items: center; gap: 4px 8px; min-height: 0; padding: 6px 8px; }
    .col:not(.tray) .dayname { grid-column: 1; grid-row: 1 / span 4; align-self: start; padding-top: 4px; }
    .col:not(.tray) > :not(.dayname) { grid-column: 2; }
    .col.tray .card { width: 100%; }
    .rest { margin-top: 0; }
  }
</style>
