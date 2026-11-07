<script lang="ts">
  import { tick } from "svelte";
  import type { ExerciseDto, ExerciseInput } from "$lib/api/types";
  import { exerciseMeta, groupByPattern, guessExercise, searchExercises } from "$lib/exerciseSearch";
  import { EQUIPMENT_OPTIONS, MUSCLE_OPTIONS, PATTERN_OPTIONS } from "$lib/exerciseLibrary";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Searchable exercise picker (ARIA combobox). The trigger shows the current
   * exercise with its muscle · equipment · pattern line; the popover filters
   * the catalog as you type — every word must match name, muscle, equipment
   * or pattern. Empty query browses by movement pattern. ↑↓ / Enter / Esc.
   * With `oncreate`, the last option adds a new exercise to the library and
   * picks it — prefilled from the query and the closest existing exercise.
   */
  let {
    value,
    catalog,
    onpick,
    oncreate,
    label = "Exercise",
  }: {
    /** Selected exercise id. */
    value: string;
    catalog: ExerciseDto[];
    onpick: (exercise: ExerciseDto) => void;
    /** Saves a new library exercise and returns it. Omit to hide "New exercise". */
    oncreate?: (input: ExerciseInput) => Promise<ExerciseDto>;
    /** Accessible name for the trigger. */
    label?: string;
  } = $props();

  const uid = $props.id();
  let open = $state(false);
  let query = $state("");
  let active = $state(0);
  let root = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();
  let search = $state<HTMLInputElement>();
  let listEl = $state<HTMLUListElement>();

  const current = $derived(catalog.find((c) => c.id === value) ?? null);
  /** Archived exercises stay out of the picker unless already chosen. */
  const pool = $derived(catalog.filter((c) => !c.archivedAt || c.id === value));
  const groups = $derived(
    query.trim() ? [{ label: "", items: searchExercises(pool, query) }] : groupByPattern(pool)
  );
  /** Flat option order for keyboard movement. */
  const flat = $derived(groups.flatMap((g) => g.items));
  const optId = (i: number) => `${uid}-opt-${i}`;
  const typed = $derived(query.trim().replace(/\s+/g, " "));
  /** Offer "New exercise" unless the query already names one exactly. */
  const canCreate = $derived(
    !!oncreate && !catalog.some((c) => c.name.toLowerCase() === typed.toLowerCase())
  );
  /** Options incl. the trailing create row. */
  const count = $derived(flat.length + (canCreate ? 1 : 0));

  type Draft = { name: string; primaryMuscleGroup: string; equipment: string; movementPattern: string };
  let draft = $state<Draft | null>(null);
  let saving = $state(false);
  let createError = $state("");
  let nameInput = $state<HTMLInputElement>();

  async function startCreate() {
    const g = guessExercise(typed, catalog);
    draft = { name: typed, primaryMuscleGroup: g.primaryMuscleGroup, equipment: g.equipment, movementPattern: g.movementPattern ?? "" };
    createError = "";
    await tick();
    nameInput?.focus();
    if (typed) nameInput?.select();
  }

  async function backToSearch() {
    draft = null;
    await tick();
    search?.focus();
  }

  async function submitCreate(e: SubmitEvent) {
    e.preventDefault();
    if (!draft || !oncreate || saving) return;
    const name = draft.name.trim();
    if (!name || !draft.primaryMuscleGroup || !draft.equipment) {
      createError = "Name, muscle and equipment are required.";
      return;
    }
    saving = true;
    createError = "";
    try {
      const created = await oncreate({
        name,
        primaryMuscleGroup: draft.primaryMuscleGroup,
        equipment: draft.equipment,
        movementPattern: draft.movementPattern || null,
      });
      draft = null;
      onpick(created);
      hide();
    } catch (err) {
      createError = err instanceof Error ? err.message : "Couldn't add the exercise.";
    } finally {
      saving = false;
    }
  }

  function onDraftKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); backToSearch(); }
  }

  async function show() {
    query = "";
    draft = null;
    open = true;
    await tick();
    active = Math.max(0, flat.findIndex((e) => e.id === value));
    search?.focus();
    scrollActive("center");
  }

  function hide(refocus = true) {
    open = false;
    draft = null;
    if (refocus) trigger?.focus();
  }

  function pick(e: ExerciseDto) {
    if (e.id !== value) onpick(e);
    hide();
  }

  function scrollActive(block: ScrollLogicalPosition = "nearest") {
    listEl?.querySelector(`#${CSS.escape(optId(active))}`)?.scrollIntoView({ block });
  }

  async function move(to: number) {
    if (count === 0) return;
    active = (to + count) % count;
    await tick();
    scrollActive();
  }

  function onkey(e: KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); move(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(active - 1); }
    else if (e.key === "PageDown") { e.preventDefault(); move(Math.min(count - 1, active + 8)); }
    else if (e.key === "PageUp") { e.preventDefault(); move(Math.max(0, active - 8)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[active]) pick(flat[active]); else if (active === flat.length && canCreate) startCreate(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
    else if (e.key === "Tab") hide(false);
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(); }
  }

  /** Bold the query words inside a name. */
  function highlight(name: string): { text: string; hit: boolean }[] {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return [{ text: name, hit: false }];
    const lower = name.toLowerCase();
    const marks = new Array(name.length).fill(false);
    for (const w of words) {
      for (let i = lower.indexOf(w); i !== -1; i = lower.indexOf(w, i + 1)) marks.fill(true, i, i + w.length);
    }
    const out: { text: string; hit: boolean }[] = [];
    for (let i = 0; i < name.length; i++) {
      const last = out[out.length - 1];
      if (last && last.hit === marks[i]) last.text += name[i];
      else out.push({ text: name[i], hit: marks[i] });
    }
    return out;
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    if (open && root && !root.contains(e.target as Node)) hide(false);
  }}
/>

<div class="xp" bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    class="xp-btn"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label="{label}: {current?.name ?? 'none'}"
    onclick={() => (open ? hide() : show())}
    onkeydown={onTriggerKey}
  >
    <span class="xp-name">{current?.name ?? "Pick an exercise"}</span>
    {#if current}<span class="xp-meta">{exerciseMeta(current)}</span>{/if}
    <span class="xp-chev"><Icon name="chevron" /></span>
  </button>

  {#if open}
    <div class="xp-pop">
      {#if draft}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <form class="xp-new" onsubmit={submitCreate} onkeydown={onDraftKey} aria-label="New exercise">
          <div class="xp-new-head">
            <button type="button" class="xp-back" aria-label="Back to search" onclick={backToSearch}>
              <Icon name="chevron" />
            </button>
            <span class="xp-new-title">New exercise</span>
            <span class="xp-new-sub">Saved to your library</span>
          </div>
          <div class="xp-new-body">
            <label class="xp-f">
              <span>Name</span>
              <input bind:this={nameInput} bind:value={draft.name} class="input" required maxlength="120" autocomplete="off" />
            </label>
            <div class="xp-new-grid">
              <label class="xp-f">
                <span>Main muscle</span>
                <select bind:value={draft.primaryMuscleGroup} class="select" required>
                  <option value="" disabled>Choose…</option>
                  {#each MUSCLE_OPTIONS as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
                </select>
              </label>
              <label class="xp-f">
                <span>Equipment</span>
                <select bind:value={draft.equipment} class="select" required>
                  <option value="" disabled>Choose…</option>
                  {#each EQUIPMENT_OPTIONS as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
                </select>
              </label>
              <label class="xp-f wide">
                <span>Movement pattern <em>optional</em></span>
                <select bind:value={draft.movementPattern} class="select">
                  <option value="">No pattern</option>
                  {#each PATTERN_OPTIONS as o (o.key)}<option value={o.key}>{o.label}</option>{/each}
                </select>
              </label>
            </div>
            {#if createError}<p class="xp-err" role="alert">{createError}</p>{/if}
          </div>
          <div class="xp-new-foot">
            <button type="button" class="btn small" onclick={backToSearch}>Back</button>
            <button type="submit" class="btn small xp-add" disabled={saving}>
              {saving ? "Adding…" : "Add and use"}
            </button>
          </div>
        </form>
      {:else}
      <div class="xp-search">
        <Icon name="search" />
        <input
          bind:this={search}
          bind:value={query}
          oninput={() => { active = 0; listEl?.scrollTo({ top: 0 }); }}
          onkeydown={onkey}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="{uid}-list"
          aria-activedescendant={active < count ? optId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Search exercises"
          placeholder="Search {pool.length} exercises — name, muscle, equipment"
          autocomplete="off"
          spellcheck="false"
        />
      </div>

      <ul class="xp-list" id="{uid}-list" role="listbox" aria-label="Exercises" bind:this={listEl}>
        {#each groups as g (g.label)}
          {#if g.label}<li class="xp-group" role="presentation">{g.label}<span>{g.items.length}</span></li>{/if}
          {#each g.items as ex (ex.id)}
            {@const i = flat.indexOf(ex)}
            <!-- keyboard lives on the combobox input (aria-activedescendant), per the ARIA combobox pattern -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              id={optId(i)}
              role="option"
              class="xp-opt"
              class:active={i === active}
              aria-selected={ex.id === value}
              onpointermove={() => (active = i)}
              onpointerdown={(e) => e.preventDefault()}
              onclick={() => pick(ex)}
            >
              <span class="xp-check">{#if ex.id === value}<Icon name="check" />{/if}</span>
              <span class="xp-text">
                <span class="xp-opt-name">
                  {#each highlight(ex.name) as part, pi (pi)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
                  {#if ex.custom}<span class="xp-custom">custom</span>{/if}
                </span>
                <span class="xp-opt-meta">{exerciseMeta(ex)}</span>
              </span>
            </li>
          {/each}
        {/each}
        {#if canCreate}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            id={optId(flat.length)}
            role="option"
            class="xp-opt xp-create"
            class:active={active === flat.length}
            class:alone={flat.length === 0}
            aria-selected="false"
            onpointermove={() => (active = flat.length)}
            onpointerdown={(e) => e.preventDefault()}
            onclick={startCreate}
          >
            <span class="xp-check"><Icon name="plus" /></span>
            <span class="xp-text">
              <span class="xp-opt-name">
                {#if typed}New exercise “<strong>{typed}</strong>”{:else}New exercise…{/if}
              </span>
              <span class="xp-opt-meta">Add it to your library and use it here</span>
            </span>
          </li>
        {/if}
      </ul>

      {#if flat.length === 0 && !canCreate}
        <p class="xp-empty">
          No exercise matches “{typed}”.
          {#if oncreate}It's archived — <a href="/exercises" target="_blank" rel="noopener">restore it in the library</a>.
          {:else}<a href="/exercises" target="_blank" rel="noopener">Add it to the library</a>{/if}
        </p>
      {/if}

      <p class="xp-foot" aria-hidden="true">
        <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
        <span><kbd>Enter</kbd> pick</span>
        <span><kbd>Esc</kbd> close</span>
        {#if query.trim()}<span class="xp-count">{flat.length} {flat.length === 1 ? "match" : "matches"}</span>{/if}
      </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .xp { position: relative; flex: 1; min-width: 200px; }

  .xp-btn {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    min-height: 32px;
    padding: 5px 34px 5px 12px;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--ink);
    font: inherit;
    text-align: left;
    cursor: pointer;
    position: relative;
    transition: background-color 120ms, border-color 120ms;
  }
  .xp-btn:hover { background: var(--well-2); border-color: var(--line-strong); }
  .xp-btn[aria-expanded="true"] {
    background: var(--surface);
    border-color: var(--blue);
    box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15);
  }
  .xp-name { font: 600 14px/1.4 var(--font-ui); white-space: nowrap; }
  .xp-meta {
    min-width: 0;
    font-size: 12px;
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .xp-chev {
    position: absolute;
    right: 10px;
    top: 50%;
    width: 14px;
    height: 14px;
    margin-top: -7px;
    color: var(--muted);
    display: inline-flex;
  }
  .xp-chev :global(svg) { width: 14px; height: 14px; }

  .xp-pop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: max(100%, 400px);
    max-width: calc(100vw - 32px);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-overlay);
    z-index: 20;
    overflow: hidden;
  }

  .xp-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line-soft);
    color: var(--muted);
  }
  .xp-search :global(svg) { width: 14px; height: 14px; flex: none; }
  .xp-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: none;
    padding: 10px 0;
    font: 14px var(--font-ui);
    color: var(--ink);
  }
  .xp-search input::placeholder { color: var(--muted); }
  .xp-search:focus-within { color: var(--blue); }

  .xp-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: min(340px, 50vh);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .xp-group {
    position: sticky;
    top: -4px;
    display: flex;
    justify-content: space-between;
    padding: 8px 12px 4px;
    background: var(--surface);
    font: 500 11px/1.2 var(--font-ui);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .xp-group span { font-family: var(--font-mono); letter-spacing: 0; }
  .xp-opt {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 0 4px;
    padding: 6px 8px 6px 4px;
    border-radius: var(--radius);
    cursor: pointer;
  }
  .xp-opt.active { background: var(--well-2); }
  .xp-check { width: 16px; height: 18px; flex: none; color: var(--ink); display: inline-flex; align-items: center; }
  .xp-check :global(svg) { width: 14px; height: 14px; }
  .xp-text { display: flex; flex-direction: column; min-width: 0; }
  .xp-opt-name { font-size: 14px; color: var(--ink); line-height: 18px; }
  .xp-opt[aria-selected="true"] .xp-opt-name { font-weight: 600; }
  .xp-opt-name mark { background: none; color: inherit; font-weight: 600; text-decoration: underline; text-decoration-color: var(--blue); text-underline-offset: 3px; }
  .xp-custom {
    margin-left: 6px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 99px;
    font: 500 11px/16px var(--font-ui);
    color: var(--muted);
    vertical-align: 1px;
  }
  .xp-opt-meta { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .xp-empty { margin: 0; padding: 18px 12px; text-align: center; font-size: 13px; color: var(--muted); }
  .xp-empty a { display: block; margin-top: 4px; }

  .xp-foot {
    display: flex;
    gap: 12px;
    margin: 0;
    padding: 6px 12px;
    border-top: 1px solid var(--line-soft);
    background: var(--well);
    font-size: 11px;
    color: var(--muted);
  }
  .xp-foot kbd {
    display: inline-block;
    min-width: 16px;
    margin-right: 2px;
    padding: 0 4px;
    border: 1px solid var(--line);
    border-bottom-width: 2px;
    border-radius: var(--radius);
    background: var(--surface);
    font: 10px/14px var(--font-mono);
    text-align: center;
    color: var(--ink);
  }
  .xp-count { margin-left: auto; font-family: var(--font-mono); }

  .xp-create { border-top: 1px solid var(--line-soft); border-radius: 0 0 var(--radius) var(--radius); margin-top: 4px; padding-top: 8px; }
  .xp-create.alone { border-top: none; margin-top: 0; }
  .xp-create .xp-check { color: var(--blue); }
  .xp-create .xp-opt-name { color: var(--blue); }
  .xp-create strong { font-weight: 600; }

  .xp-new-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 8px 6px;
    border-bottom: 1px solid var(--line-soft);
  }
  .xp-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--muted);
    cursor: pointer;
  }
  .xp-back:hover { background: var(--well-2); color: var(--ink); }
  .xp-back :global(svg) { width: 14px; height: 14px; transform: rotate(90deg); }
  .xp-new-title { font: 600 14px var(--font-ui); color: var(--ink); }
  .xp-new-sub { margin-left: auto; font-size: 12px; color: var(--muted); }
  .xp-new-body { display: grid; gap: 10px; padding: 12px; }
  .xp-new-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .xp-f { display: grid; gap: 4px; min-width: 0; }
  .xp-f.wide { grid-column: 1 / -1; }
  .xp-f > span { font: 500 12px var(--font-ui); color: var(--ink); }
  .xp-f em { font-style: normal; font-weight: 400; color: var(--muted); }
  .xp-f .input, .xp-f .select { width: 100%; font-size: 14px; }
  .xp-err { margin: 0; font-size: 12px; color: var(--bad); }
  .xp-new-foot {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--line-soft);
    background: var(--well);
  }

  @media (max-width: 600px) {
    .xp-meta { display: none; }
    .xp-pop { width: 100%; }
    .xp-foot { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .xp-btn { transition: none; }
  }
</style>
