<script lang="ts">
  import { tick } from "svelte";
  import type { SessionKind } from "@pt/shared";
  import type { SessionTypeDto, SessionTypeInput } from "$lib/api/types";
  import { FORMAT_HINT, FORMAT_LABEL, groupByFormat, searchSessionTypes } from "$lib/sessionTypeSearch";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Searchable session-type picker (ARIA combobox), same interaction model as
   * ExercisePicker: type to filter, ↑↓ / Enter / Esc. Empty query browses by
   * format. With `oncreate`, a typed name that isn't a type yet offers two
   * create rows — as a lifting type or as a cardio type — saved and picked
   * in one step. The trigger shows the type name, or the bare format when
   * the session has no type yet.
   */
  let {
    value,
    format,
    types,
    onpick,
    oncreate,
    label = "Session type",
    small = false,
  }: {
    /** Selected type id (undefined = none yet). */
    value: string | undefined;
    /** The session's current format — shown when no type is set. */
    format: SessionKind;
    types: SessionTypeDto[];
    onpick: (type: SessionTypeDto) => void;
    /** Saves a new type and returns it. Omit to hide the create rows. */
    oncreate?: (input: SessionTypeInput) => Promise<SessionTypeDto>;
    /** Accessible name for the trigger. */
    label?: string;
    /** Compact trigger for panel headers. */
    small?: boolean;
  } = $props();

  const uid = $props.id();
  let open = $state(false);
  let query = $state("");
  let active = $state(0);
  let saving = $state(false);
  let createError = $state("");
  let root = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();
  let search = $state<HTMLInputElement>();
  let listEl = $state<HTMLUListElement>();
  /** Open toward whichever side has room for the 300px popover. */
  let alignLeft = $state(false);

  const current = $derived(types.find((t) => t.id === value) ?? null);
  /** Archived types stay out of the picker unless already chosen. */
  const pool = $derived(types.filter((t) => !t.archivedAt || t.id === value));
  const typed = $derived(query.trim().replace(/\s+/g, " "));
  const groups = $derived(
    typed ? [{ format: null, items: searchSessionTypes(pool, typed) }] : groupByFormat(pool)
  );
  const flat = $derived(groups.flatMap((g) => g.items));
  const optId = (i: number) => `${uid}-opt-${i}`;
  /** Create rows unless the query already names a type (archived ones included). */
  const createFormats = $derived<SessionKind[]>(
    oncreate && typed && !types.some((t) => t.name.toLowerCase() === typed.toLowerCase()) ? ["lifting", "cardio"] : []
  );
  const count = $derived(flat.length + createFormats.length);
  const archivedHit = $derived(
    typed ? types.find((t) => t.archivedAt && t.id !== value && t.name.toLowerCase() === typed.toLowerCase()) : undefined
  );

  async function show() {
    query = "";
    createError = "";
    const r = trigger?.getBoundingClientRect();
    alignLeft = !!r && r.right < 316;
    open = true;
    await tick();
    active = Math.max(0, flat.findIndex((t) => t.id === value));
    search?.focus();
    scrollActive("center");
  }

  function hide(refocus = true) {
    open = false;
    if (refocus) trigger?.focus();
  }

  function pick(t: SessionTypeDto) {
    if (t.id !== value) onpick(t);
    hide();
  }

  async function create(f: SessionKind) {
    if (!oncreate || saving) return;
    saving = true;
    createError = "";
    try {
      const made = await oncreate({ name: typed, format: f });
      onpick(made);
      hide();
    } catch (err) {
      createError = err instanceof Error ? err.message : "Couldn't add the type.";
    } finally {
      saving = false;
    }
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
    else if (e.key === "Enter") {
      e.preventDefault();
      if (flat[active]) pick(flat[active]);
      else if (active >= flat.length) create(createFormats[active - flat.length]);
    }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
    else if (e.key === "Tab") hide(false);
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(); }
  }

  function highlight(name: string): { text: string; hit: boolean }[] {
    const words = typed.toLowerCase().split(/\s+/).filter(Boolean);
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

<div class="tp" class:small bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    class="tp-btn"
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label="{label}: {current?.name ?? FORMAT_LABEL[format]}"
    onclick={() => (open ? hide() : show())}
    onkeydown={onTriggerKey}
  >
    <span class="tp-dot" class:cardio={(current?.format ?? format) === "cardio"} aria-hidden="true"></span>
    <span class="tp-name" class:unset={!current}>{current?.name ?? FORMAT_LABEL[format]}</span>
    <span class="tp-chev"><Icon name="chevron" /></span>
  </button>

  {#if open}
    <div class="tp-pop" class:left={alignLeft}>
      <div class="tp-search">
        <Icon name="search" />
        <input
          bind:this={search}
          bind:value={query}
          oninput={() => { active = 0; createError = ""; listEl?.scrollTo({ top: 0 }); }}
          onkeydown={onkey}
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls="{uid}-list"
          aria-activedescendant={active < count ? optId(active) : undefined}
          aria-autocomplete="list"
          aria-label="Search session types"
          placeholder={oncreate ? "Search or add a type" : "Search types"}
          autocomplete="off"
          spellcheck="false"
          maxlength="40"
        />
      </div>

      <ul class="tp-list" id="{uid}-list" role="listbox" aria-label="Session types" bind:this={listEl}>
        {#each groups as g (g.format ?? "all")}
          {#if g.format}<li class="tp-group" role="presentation">{FORMAT_LABEL[g.format]}<span>{FORMAT_HINT[g.format]}</span></li>{/if}
          {#each g.items as t (t.id)}
            {@const i = flat.indexOf(t)}
            <!-- keyboard lives on the combobox input (aria-activedescendant), per the ARIA combobox pattern -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              id={optId(i)}
              role="option"
              class="tp-opt"
              class:active={i === active}
              aria-selected={t.id === value}
              onpointermove={() => (active = i)}
              onpointerdown={(e) => e.preventDefault()}
              onclick={() => pick(t)}
            >
              <span class="tp-check">{#if t.id === value}<Icon name="check" />{/if}</span>
              <span class="tp-opt-name">
                {#each highlight(t.name) as part, pi (pi)}{#if part.hit}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
              </span>
              {#if !g.format}<span class="tp-fmt" class:cardio={t.format === "cardio"}>{FORMAT_LABEL[t.format]}</span>{/if}
            </li>
          {/each}
        {/each}
        {#each createFormats as f, ci (f)}
          {@const i = flat.length + ci}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <li
            id={optId(i)}
            role="option"
            class="tp-opt tp-create"
            class:first={ci === 0}
            class:alone={flat.length === 0 && ci === 0}
            class:active={i === active}
            aria-selected="false"
            aria-disabled={saving}
            onpointermove={() => (active = i)}
            onpointerdown={(e) => e.preventDefault()}
            onclick={() => create(f)}
          >
            <span class="tp-check"><Icon name="plus" /></span>
            <span class="tp-opt-name">New {FORMAT_LABEL[f].toLowerCase()} type “<strong>{typed}</strong>”</span>
          </li>
        {/each}
      </ul>

      {#if createError}<p class="tp-err" role="alert">{createError}</p>{/if}
      {#if count === 0}
        <p class="tp-empty">
          {#if archivedHit}“{archivedHit.name}” is archived — <a href="/session-types" target="_blank" rel="noopener">restore it</a>.
          {:else}No type matches “{typed}”.{/if}
        </p>
      {/if}
      <p class="tp-foot">
        <a href="/session-types" target="_blank" rel="noopener">Manage types</a>
      </p>
    </div>
  {/if}
</div>

<style>
  .tp { position: relative; flex: none; }

  .tp-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 132px;
    max-width: 220px;
    min-height: 32px;
    padding: 5px 30px 5px 10px;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--ink);
    font: 14px/1.4 var(--font-ui);
    text-align: left;
    cursor: pointer;
    position: relative;
    transition: background-color 120ms, border-color 120ms;
  }
  .small .tp-btn { min-width: 112px; min-height: 0; padding: 3px 26px 3px 8px; font-size: 12.5px; }
  .tp-btn:hover { background: var(--well-2); border-color: var(--line-strong); }
  .tp-btn[aria-expanded="true"] {
    background: var(--surface);
    border-color: var(--blue);
    box-shadow: 0 0 0 3px var(--focus-ring);
  }
  .tp-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--blue); }
  .tp-dot.cardio { background: var(--good); }
  .tp-name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
  .tp-name.unset { font-weight: 400; color: var(--muted); }
  .tp-chev {
    position: absolute;
    right: 8px;
    top: 50%;
    width: 14px;
    height: 14px;
    margin-top: -7px;
    color: var(--muted);
    display: inline-flex;
  }
  .tp-chev :global(svg) { width: 14px; height: 14px; }

  .tp-pop {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    width: 300px;
    max-width: calc(100vw - 32px);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-overlay);
    z-index: 20;
    overflow: hidden;
  }
  .tp-pop.left { right: auto; left: 0; }

  .tp-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line-soft);
    color: var(--muted);
  }
  .tp-search :global(svg) { width: 14px; height: 14px; flex: none; }
  .tp-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: none;
    padding: 9px 0;
    font: 14px var(--font-ui);
    color: var(--ink);
  }
  .tp-search input::placeholder { color: var(--muted); }
  .tp-search:focus-within { color: var(--blue); }

  .tp-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: min(300px, 50vh);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .tp-group {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 12px 4px;
    font: 500 11px/1.2 var(--font-ui);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .tp-group span { text-transform: none; letter-spacing: 0; font-weight: 400; }
  .tp-opt {
    display: flex;
    gap: 6px;
    align-items: center;
    margin: 0 4px;
    padding: 5px 8px 5px 4px;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 14px;
    color: var(--ink);
  }
  .tp-opt.active { background: var(--well-2); }
  .tp-check { width: 16px; height: 18px; flex: none; display: inline-flex; align-items: center; }
  .tp-check :global(svg) { width: 14px; height: 14px; }
  .tp-opt-name { min-width: 0; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tp-opt[aria-selected="true"] .tp-opt-name { font-weight: 600; }
  .tp-opt-name mark { background: none; color: inherit; font-weight: 600; text-decoration: underline; text-decoration-color: var(--blue); text-underline-offset: 3px; }
  .tp-fmt { font-size: 12px; color: var(--blue); }
  .tp-fmt.cardio { color: var(--good); }

  .tp-create { color: var(--blue); }
  .tp-create.first { border-top: 1px solid var(--line-soft); border-radius: 0 0 var(--radius) var(--radius); margin-top: 4px; padding-top: 7px; }
  .tp-create.alone { border-top: none; margin-top: 0; }
  .tp-create strong { font-weight: 600; }

  .tp-err { margin: 0; padding: 6px 12px; font-size: 12px; color: var(--bad); }
  .tp-empty { margin: 0; padding: 14px 12px; text-align: center; font-size: 13px; color: var(--muted); }
  .tp-foot {
    margin: 0;
    padding: 6px 12px;
    border-top: 1px solid var(--line-soft);
    background: var(--well);
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .tp-btn { transition: none; }
  }
</style>
