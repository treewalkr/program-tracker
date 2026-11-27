<script lang="ts">
  import { onMount, tick } from "svelte";
  import { api } from "$lib/api";
  import { errorText } from "$lib/api/errors";
  import type { ExerciseDto, ExercisePatch } from "$lib/api/types";
  import {
    EQUIPMENT_OPTIONS,
    FUNCTIONAL_OPTIONS,
    MUSCLE_OPTIONS,
    NONE,
    PATTERN_GROUPS,
    PATTERN_OPTIONS,
    addPattern,
    copyName,
    emptyFilters,
    functionalName,
    humanize,
    patternName,
    patternShare,
    patternShort,
    pickCell,
    prefillFrom,
    removeAction,
    removePattern,
    tabCounts,
    visibleRows,
    type ExerciseForm,
    type Filters,
    type Sort,
    type Tab,
  } from "$lib/exerciseLibrary";
  import { MAX_MOVEMENT_PATTERNS, MULTI_MOVEMENT, NO_PATTERN, primaryPattern } from "@pt/shared";
  import ExerciseCoverage from "$lib/components/ExerciseCoverage.svelte";
  import ExerciseInspector from "$lib/components/ExerciseInspector.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import ListToolbar from "$lib/ui/ListToolbar.svelte";
  import Pager from "$lib/ui/Pager.svelte";
  import SelectPrefixed from "$lib/ui/SelectPrefixed.svelte";
  import { listUrlState } from "$lib/list/urlState.svelte";
  import { pageOf } from "@pt/shared";
  import LeaveGuard from "$lib/ui/LeaveGuard.svelte";
  import { createLibraryGuard } from "$lib/libraryGuard.svelte";

  const TABS = ["all", "mine", "untagged", "archived"] as const satisfies readonly Tab[];
  const MAP_KEY = "pt.exercises.map";

  let list = $state<ExerciseDto[]>([]);
  let loading = $state(true);
  let loadError = $state("");

  /** Tab, search, page and rows-per-page live in the URL; filters and sort stay local. */
  const view = listUrlState({ tab: TABS });
  const tab = $derived<Tab>(view.params.tab);
  const q = $derived(view.q);
  let filters = $state<Filters>(emptyFilters());
  let sort = $state<Sort>("name");
  const SORTS: { value: Sort; label: string }[] = [
    { value: "name", label: "Name" },
    { value: "uses", label: "Most used" },
    { value: "muscle", label: "Muscle" },
  ];
  let selected = $state<string[]>([]);
  let mapOpen = $state(true);

  /** Inspector: an exercise id, "new", or closed. `nonce` remounts it. */
  let editing = $state<{ id: string | "new"; prefill?: Partial<ExerciseForm>; nonce: number } | null>(null);
  /** The open inspector holds edits that aren't saved. */
  let inspectorDirty = $state(false);
  const guard = createLibraryGuard({
    dirty: () => editing !== null && inspectorDirty,
    what: () => (editingExercise ? `Your edit to ${editingExercise.name}` : "Your new exercise"),
    queryStays: true,
  });
  /** Close the inspector, asking first when it holds unsaved edits. */
  async function closeInspector() {
    if (!(await guard.discard())) return false;
    editing = null;
    inspectorDirty = false;
    return true;
  }
  const editingExercise = $derived(editing && editing.id !== "new" ? (list.find((e) => e.id === editing!.id) ?? null) : null);

  const rows = $derived(visibleRows(list, { tab, q, filters, sort }));
  // Paged in the browser: the coverage map and bulk select need the whole library.
  const paged = $derived(pageOf(rows, view.page, view.limit));
  const pageRows = $derived(paged.items);
  const counts = $derived(tabCounts(list));
  const live = $derived(list.filter((e) => !e.archivedAt));
  const allOnPage = $derived(pageRows.length > 0 && pageRows.every((e) => selected.includes(e.id)));
  const pre = $derived(prefillFrom(filters));
  const narrowed = $derived(!!q.trim() || filters.muscle.length + filters.pattern.length + filters.equipment.length > 0);
  /** Filters point at exactly one pattern × equipment cell and it's empty. */
  const gap = $derived(
    !q && (tab === "all" || tab === "untagged") && !filters.muscle.length && filters.pattern.length === 1 &&
      filters.equipment.length === 1 && pre.movementPattern && rows.length === 0
  );

  async function load() {
    loading = true;
    loadError = "";
    try {
      list = await api.exercises();
    } catch (err) {
      loadError = errorText(err);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    const saved = localStorage.getItem(MAP_KEY);
    mapOpen = saved ? saved === "open" : !matchMedia("(max-width: 760px)").matches;
    load();
  });

  // —— flash ————————————————————————————————————————
  let flashMsg = $state<{ text: string; undo?: () => void; bad?: boolean } | null>(null);
  let flashTimer: ReturnType<typeof setTimeout> | undefined;
  function flash(text: string, undo?: () => void, bad = false) {
    clearTimeout(flashTimer);
    flashMsg = { text, undo, bad };
    flashTimer = setTimeout(() => (flashMsg = null), 6000);
  }
  const failed = (err: unknown) => flash(err instanceof Error ? err.message : "Something went wrong.", undefined, true);

  // —— data ops —————————————————————————————————————
  const put = (row: ExerciseDto) => {
    const i = list.findIndex((e) => e.id === row.id);
    if (i === -1) list.push(row);
    else list[i] = row;
  };

  async function patchMany(ids: string[], patch: (e: ExerciseDto) => ExercisePatch) {
    const updated = await Promise.all(
      ids.map((id) => {
        const e = list.find((x) => x.id === id)!;
        return api.patchExercise(id, patch(e)); // guard-ok: n+1 bulk edit of the rows the trainer ticked, not a page load
      })
    );
    updated.forEach(put);
    return updated;
  }

  /** Set the functional movement (single tag) on every row. */
  async function tag(ids: string[], value: string | null) {
    const before = new Map(ids.map((id) => [id, list.find((e) => e.id === id)?.functionalMovement ?? null]));
    try {
      await patchMany(ids, () => ({ functionalMovement: value }));
      selected = [];
      const what = value ? functionalName(value) : "untagged";
      flash(ids.length === 1 ? `${list.find((e) => e.id === ids[0])?.name} tagged ${what}.` : `Tagged ${ids.length} as ${what}.`, () =>
        patchMany(ids, (e) => ({ functionalMovement: before.get(e.id) ?? null })).catch(failed)
      );
    } catch (err) {
      failed(err);
    }
  }

  /**
   * Apply a movement-pattern edit to every row it changes; the toast's Undo
   * puts back each row's previous list (order, and so the primary, included).
   */
  async function editPatterns(ids: string[], change: (list: readonly string[]) => string[], message: (what: string) => string) {
    const rows = ids.map((id) => list.find((e) => e.id === id)).filter((e): e is ExerciseDto => !!e);
    const before = new Map(rows.map((e) => [e.id, [...e.movementPatterns]]));
    const changed = rows.filter((e) => change(e.movementPatterns).join() !== e.movementPatterns.join()).map((e) => e.id);
    if (!changed.length) return flash(`Nothing to change — every exercise is already full (${MAX_MOVEMENT_PATTERNS} patterns) or tagged.`);
    try {
      await patchMany(changed, (e) => ({ movementPatterns: change(e.movementPatterns) }));
      selected = [];
      const what = changed.length === 1 ? (list.find((e) => e.id === changed[0])?.name ?? "1 exercise") : `${changed.length} exercises`;
      flash(message(what), () => patchMany(changed, (e) => ({ movementPatterns: before.get(e.id) ?? [] })).catch(failed));
    } catch (err) {
      failed(err);
    }
  }

  async function setArchived(ids: string[], archived: boolean) {
    try {
      const rows = await patchMany(ids, () => ({ archived }));
      selected = [];
      if (editing && ids.includes(editing.id)) editing = null;
      const one = rows.length === 1 ? rows[0] : null;
      const verb = archived ? (one && !one.custom ? "Hid" : "Archived") : one && !one.custom ? "Unhid" : "Restored";
      const keep = archived && one?.usedIn ? ` Its ${one.usedIn} program${one.usedIn === 1 ? " keeps" : "s keep"} it.` : "";
      flash(`${verb} ${one ? one.name : `${rows.length} exercises`}.${keep}`, () => patchMany(ids, () => ({ archived: !archived })).catch(failed));
    } catch (err) {
      failed(err);
    }
  }

  async function remove(e: ExerciseDto) {
    const rm = removeAction(e);
    if (rm.kind !== "delete") return setArchived([e.id], true);
    await destroy(e);
  }

  async function destroy(e: ExerciseDto) {
    try {
      await api.deleteExercise(e.id);
      list = list.filter((x) => x.id !== e.id);
      selected = selected.filter((id) => id !== e.id);
      if (editing?.id === e.id) editing = null;
      flash(`Deleted ${e.name}.`, async () => {
        try {
          put(await api.createExercise(inputOf(e)));
        } catch (err) {
          failed(err);
        }
      });
    } catch (err) {
      failed(err);
    }
  }

  const inputOf = (e: Pick<ExerciseDto, "name" | "primaryMuscleGroup" | "secondaryMuscleGroups" | "equipment" | "movementPatterns" | "functionalMovement" | "note">) => ({
    name: e.name,
    primaryMuscleGroup: e.primaryMuscleGroup,
    secondaryMuscleGroups: e.secondaryMuscleGroups,
    equipment: e.equipment,
    movementPatterns: e.movementPatterns,
    functionalMovement: e.functionalMovement,
    note: e.note,
  });

  async function duplicate(e: ExerciseDto) {
    try {
      const copy = await api.createExercise({ ...inputOf(e), name: copyName(list, e.name) });
      put(copy);
      open(copy.id);
      flash(`Duplicated as ${copy.name}. Rename it and save.`);
    } catch (err) {
      failed(err);
    }
  }

  async function save(form: ExerciseForm) {
    const ex = editingExercise;
    const tags = {
      movementPatterns: form.movementPatterns,
      functionalMovement: form.functionalMovement || null,
      note: form.note.trim() || null,
    };
    if (ex) {
      const row = await api.patchExercise(
        ex.id,
        ex.custom
          ? { ...tags, name: form.name, primaryMuscleGroup: form.primaryMuscleGroup, secondaryMuscleGroups: form.secondaryMuscleGroups, equipment: form.equipment }
          : tags
      );
      put(row);
      inspectorDirty = false;
    editing = { id: row.id, nonce: Date.now() };
      flash(`Saved ${row.name}.`);
      return;
    }
    const row = await api.createExercise({
      ...tags,
      name: form.name.trim(),
      primaryMuscleGroup: form.primaryMuscleGroup,
      secondaryMuscleGroups: form.secondaryMuscleGroups,
      equipment: form.equipment,
    });
    put(row);
    // Stay on a map cell the new exercise fills; otherwise show it under Mine.
    const fillsCell = (pre.movementPattern ? row.movementPatterns.includes(pre.movementPattern) : row.movementPatterns.length === 0) && (!pre.equipment || pre.equipment === row.equipment);
    if (!fillsCell) {
      filters = emptyFilters();
      view.update({ q: "", params: { tab: "mine" } });
    }
    inspectorDirty = false;
    editing = { id: row.id, nonce: Date.now() };
    flash(`Created ${row.name} in your exercises.`);
  }

  // —— view ops —————————————————————————————————————
  let splitEl = $state<HTMLElement>();
  let searchEl = $state<HTMLInputElement>();

  async function open(id: string | "new", prefill?: Partial<ExerciseForm>) {
    if (editing && !(await closeInspector())) return;
    editing = { id, prefill, nonce: Date.now() };
    tick().then(() => {
      if (splitEl && splitEl.getBoundingClientRect().top < 0) splitEl.scrollIntoView({ block: "start", behavior: smooth() });
    });
  }
  const openNew = (name?: string) =>
    open("new", { equipment: pre.equipment, movementPatterns: pre.movementPattern ? [pre.movementPattern] : [], ...(name ? { name } : {}) });
  const smooth = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

  function setTab(t: string) {
    view.set({ tab: t as Tab });
    selected = [];
  }

  function onpick(pattern?: string, equipment?: string) {
    const next = pickCell(filters, pattern, equipment);
    const cleared = !next.pattern.length && !next.equipment.length;
    filters = next;
    view.update({ q: "", ...(tab === "archived" || tab === "mine" ? { params: { tab: "all" } } : {}) });
    selected = [];
    if (!cleared) tick().then(() => splitEl?.scrollIntoView({ block: "start", behavior: smooth() }));
  }

  function toggleMap() {
    mapOpen = !mapOpen;
    localStorage.setItem(MAP_KEY, mapOpen ? "open" : "closed");
  }

  const toggleFilter = (k: keyof Filters, v: string) => {
    filters[k] = filters[k].includes(v) ? filters[k].filter((x) => x !== v) : [...filters[k], v];
    view.setPage(1);
  };

  function toggleSelectPage() {
    if (selected.length && !allOnPage) selected = [];
    else if (allOnPage) selected = selected.filter((id) => !pageRows.some((e) => e.id === id));
    else selected = [...new Set([...selected, ...pageRows.map((e) => e.id)])];
  }

  const filterLabel = (k: keyof Filters, v: string) =>
    k === "pattern" ? patternName(v === NONE ? null : v) : humanize(v);

  // —— popover menu ——————————————————————————————————
  interface MenuItem {
    label: string;
    /** Right-aligned count ("✓ all", "1 of 2"). */
    note?: string;
    /** Shown instead of the note on hover/focus, in a danger tone ("Remove from 2"); the label stays. */
    alt?: string;
    /** Accessible name when it differs from the label. */
    aria?: string;
    /** Small uppercase group heading (Upper, Lower…). */
    group?: boolean;
    run?: () => void;
    checked?: boolean;
    danger?: boolean;
    keepOpen?: boolean;
    heading?: boolean;
    sep?: boolean;
  }
  let menu = $state<{ x: number; y: number; items: MenuItem[]; label: string } | null>(null);
  let menuEl = $state<HTMLDivElement>();
  let menuAnchor: HTMLElement | null = null;

  function openMenu(ev: MouseEvent, label: string, items: () => MenuItem[]) {
    ev.stopPropagation();
    const a = ev.currentTarget as HTMLElement;
    if (menu && menuAnchor === a) return closeMenu();
    menuAnchor = a;
    const r = a.getBoundingClientRect();
    menu = { x: Math.max(8, Math.min(r.left, window.innerWidth - 232)), y: r.bottom + 4, items: items(), label };
    menuItems = items;
    tick().then(() => {
      if (!menu || !menuEl) return;
      // Flip above the anchor when it would run off the bottom; clamp on screen.
      const h = menuEl.offsetHeight;
      if (r.bottom + 4 + h > window.innerHeight) menu.y = Math.max(8, Math.min(r.top - 4 - h, window.innerHeight - 8 - h));
      menuEl.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    });
  }
  let menuItems: (() => MenuItem[]) | null = null;
  function closeMenu() {
    menu = null;
    menuAnchor?.focus();
    menuAnchor = null;
  }
  function pickMenu(it: MenuItem) {
    it.run?.();
    if (it.keepOpen && menu && menuItems) menu.items = menuItems();
    else closeMenu();
  }

  const functionalItems = (apply: (v: string | null) => void): MenuItem[] => [
    { label: "Functional movement", heading: true },
    ...FUNCTIONAL_OPTIONS.map((o) => ({ label: o.label, run: () => apply(o.key) })),
    { label: "", sep: true },
    { label: "Untagged", run: () => apply(null) },
  ];

  /**
   * Add pattern menu for `ids`: grouped tags with how many rows carry each.
   * A tag every row has reads "✓ all" and turns into "Remove from N".
   */
  const patternItems = (ids: string[]): MenuItem[] => {
    const rows = ids.map((id) => list.find((e) => e.id === id)).filter((e): e is ExerciseDto => !!e);
    const target = rows.length === 1 ? rows[0].name : `${rows.length} exercises`;
    const item = (p: string): MenuItem => {
      const share = patternShare(rows, p);
      const name = patternName(p);
      return share.all
        ? {
            label: name,
            note: share.text,
            alt: `Remove from ${rows.length}`,
            aria: `Remove ${name} from ${target}`,
            run: () => editPatterns(ids, (l) => removePattern(l, p), (what) => `Removed ${name} from ${what}.`),
          }
        : { label: name, note: share.text, run: () => editPatterns(ids, (l) => addPattern(l, p), (what) => `Added ${name} to ${what}.`) };
    };
    return [
      { label: `Add to ${target}`, heading: true },
      ...PATTERN_GROUPS.flatMap((g) => [
        { label: g.label, heading: true, group: true },
        ...g.patterns.filter((p) => p !== NO_PATTERN).map(item),
      ]),
      { label: "", sep: true },
      item(NO_PATTERN),
      { label: "Clear patterns", run: () => editPatterns(ids, () => [], (what) => `Cleared patterns on ${what}.`) },
    ];
  };

  const filterItems = (k: keyof Filters): MenuItem[] => {
    const opts = k === "muscle" ? MUSCLE_OPTIONS : k === "equipment" ? EQUIPMENT_OPTIONS : [...PATTERN_OPTIONS, { key: NONE, label: "Untagged" }];
    return opts.map((o) => ({ label: o.label, checked: filters[k].includes(o.key), keepOpen: true, run: () => toggleFilter(k, o.key) }));
  };

  const rowItems = (e: ExerciseDto): MenuItem[] => {
    const rm = removeAction(e);
    return [
      { label: "Edit", run: () => open(e.id) },
      { label: "Duplicate into my exercises", run: () => duplicate(e) },
      { label: "", sep: true },
      ...(e.archivedAt
        ? [
            { label: e.custom ? "Restore" : "Unhide", run: () => setArchived([e.id], false) },
            ...(e.custom && !e.usedIn ? [{ label: "Delete permanently", danger: true, run: () => destroy(e) }] : []),
          ]
        : [{ label: rm.label, danger: true, run: () => remove(e) }]),
    ];
  };

  function onkey(ev: KeyboardEvent) {
    const t = ev.target as HTMLElement;
    if (ev.key === "Escape") {
      if (menu) return closeMenu();
      if (t.closest("input, textarea, select")) return (t as HTMLInputElement).blur();
      if (editing) void closeInspector();
      return;
    }
    if (t.closest("input, textarea, select, [contenteditable]") || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "/") {
      ev.preventDefault();
      searchEl?.focus();
    } else if (ev.key === "n") {
      ev.preventDefault();
      openNew();
    } else if (ev.key === "m") toggleMap();
  }

  const seedCount = $derived(live.filter((e) => !e.custom).length);
  const mineCount = $derived(counts.mine);
</script>

<svelte:head><title>Exercises · Program Tracker</title></svelte:head>
<svelte:window onkeydown={onkey} onclick={(ev) => menu && !menuEl?.contains(ev.target as Node) && closeMenu()} />

<PageHead
  title="Exercise library"
  sub={loading ? "Loading…" : loadError ? "Tagged patterns feed balance checks and AI drafts." : `${seedCount} in the library · ${mineCount} of yours. Tagged patterns feed balance checks and AI drafts.`}
>
  {#snippet actions()}
    <Button variant="primary" onclick={() => openNew()} title="New exercise (n)">
      {#snippet icon()}<Icon name="plus" />{/snippet}New exercise
    </Button>
  {/snippet}
</PageHead>

  {#snippet toolbarFilters()}
    {#each [["muscle", "Muscle"], ["pattern", "Pattern"], ["equipment", "Equipment"]] as [k, label] (k)}
      {@const n = filters[k as keyof Filters].length}
      <button
        type="button"
        class="btn fbtn"
        aria-haspopup="menu"
        aria-expanded={menu?.label === label}
        onclick={(ev) => openMenu(ev, label, () => filterItems(k as keyof Filters))}
      >
        {label}{#if n}<span class="n">{n}</span>{/if}<Icon name="chevron" />
      </button>
    {/each}
    <div class="sortsel"><SelectPrefixed prefix="Sort" maxWidth="none" options={SORTS} bind:value={sort} onchange={() => view.setPage(1)} /></div>
  {/snippet}

{#if loading}
  <SkeletonPanel rows={8} dense label="Loading exercises…" />
{:else if loadError}
  <EmptyState>
    Couldn't load the exercise library. {loadError}
    {#snippet actions()}<Button onclick={load}>Try again</Button>{/snippet}
  </EmptyState>
{:else}
  <ExerciseCoverage {list} {filters} open={mapOpen} ontoggle={toggleMap} {onpick} />

  <Tabs
    label="Exercise views"
    idPrefix="lib"
    value={tab}
    onchange={setTab}
    items={[
      { id: "all", label: "All", count: String(counts.all) },
      { id: "mine", label: "Mine", count: String(counts.mine) },
      { id: "untagged", label: "Needs tagging", count: String(counts.untagged) },
      { id: "archived", label: "Archived & hidden", count: String(counts.archived) },
    ]}
  />

  <ListToolbar
    bind:value={view.search}
    bind:input={searchEl}
    label="Search exercises"
    kbd="/"
    count={narrowed ? `${rows.length} of ${counts[tab]}` : undefined}
    filters={toolbarFilters}
  />

  {#if filters.muscle.length || filters.pattern.length || filters.equipment.length}
    <div class="active-f">
      {#each ["muscle", "pattern", "equipment"] as const as k (k)}
        {#each filters[k] as v (v)}
          <button type="button" class="tchip on" onclick={() => toggleFilter(k, v)} aria-label="Remove filter {filterLabel(k, v)}">
            {filterLabel(k, v)}<Icon name="x" />
          </button>
        {/each}
      {/each}
      <button type="button" class="linkbtn" onclick={() => ((filters = emptyFilters()), view.setPage(1))}>Clear filters</button>
    </div>
  {/if}

  <div class="split" class:open={editing !== null} bind:this={splitEl}>
    <section class="panel" aria-label="Exercises">
      <div class="panel-head">
        {#if selected.length}
          <div class="bulk">
            <input type="checkbox" checked aria-label="Clear selection" onchange={() => (selected = [])} />
            <b>{selected.length} selected</b>
            <button type="button" class="btn small" onclick={(ev) => openMenu(ev, "Add pattern", () => patternItems([...selected]))}>Add pattern</button>
            <button type="button" class="btn small" onclick={(ev) => openMenu(ev, "Set functional", () => functionalItems((v) => tag([...selected], v)))}>Set functional</button>
            <button type="button" class="btn small" onclick={() => setArchived([...selected], tab !== "archived")}>
              {tab === "archived" ? "Restore" : "Archive or hide"}
            </button>
            <button type="button" class="linkbtn clear" onclick={() => (selected = [])}>Clear</button>
          </div>
        {:else}
          <input type="checkbox" aria-label="Select this page" checked={allOnPage} disabled={!pageRows.length} onchange={toggleSelectPage} />
          <h2>{rows.length === 1 ? "1 exercise" : `${rows.length} exercises`}</h2>
          <span class="act faint">Click a row to edit</span>
        {/if}
      </div>

      {#if rows.length}
        <div class="tw x-scroll">
          <table class="sheet">
            <thead>
              <tr>
                <th class="cb"><span class="sr">Select</span></th>
                <th>Exercise</th>
                <th>Primary</th>
                <th>Pattern</th>
                <th class="col-func">Functional</th>
                <th class="col-eq">Equipment</th>
                <th class="r">Used in</th>
                <th><span class="sr">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {#each pageRows as e (e.id)}
                <tr class:sel={editing?.id === e.id} class:arch={e.archivedAt} onclick={(ev) => !(ev.target as HTMLElement).closest("input, button") && open(e.id)}>
                  <td class="cb">
                    <input
                      type="checkbox"
                      aria-label="Select {e.name}"
                      checked={selected.includes(e.id)}
                      onchange={(ev) => (selected = ev.currentTarget.checked ? [...selected, e.id] : selected.filter((id) => id !== e.id))}
                    />
                  </td>
                  <td>
                    <button type="button" class="nm" onclick={() => open(e.id)}>{e.name}</button>
                    {#if e.custom}<span class="src mine">Mine</span>{/if}
                    {#if e.archivedAt}<span class="arch-tag">{e.custom ? "archived" : "hidden"}</span>{/if}
                    <span class="sec">{e.secondaryMuscleGroups.map((m) => humanize(m).toLowerCase()).join(", ") || "no secondary"}</span>
                  </td>
                  <td><span class="pill neutral">{humanize(e.primaryMuscleGroup)}</span></td>
                  <td>
                    {#if e.movementPatterns.length}
                      {@const lead = primaryPattern(e) ?? e.movementPatterns[0]}
                      {@const multi = lead !== MULTI_MOVEMENT && e.movementPatterns.includes(MULTI_MOVEMENT)}
                      {@const rest = e.movementPatterns.filter((p) => p !== lead && p !== MULTI_MOVEMENT)}
                      <span class="pats">
                        <span class="pill neutral" title={patternName(lead)}>{patternShort(lead)}</span>
                        {#if rest.length || multi}<span class="pill more" title={`Also: ${[...rest, ...(multi ? [MULTI_MOVEMENT] : [])].map(patternName).join(", ")}`}
                            >{rest.length ? `+${rest.length + (multi ? 1 : 0)}` : "+more"}</span
                          >{/if}
                      </span>
                    {:else}
                      <button type="button" class="untag" aria-label="Tag pattern for {e.name}" onclick={(ev) => openMenu(ev, "Pattern tag", () => patternItems([e.id]))}>Tag</button>
                    {/if}
                  </td>
                  <td class="col-func">
                    {#if e.functionalMovement}
                      {functionalName(e.functionalMovement)}
                    {:else}
                      <button type="button" class="untag" aria-label="Tag functional movement for {e.name}" onclick={(ev) => openMenu(ev, "Functional tag", () => functionalItems((v) => tag([e.id], v)))}>Tag</button>
                    {/if}
                  </td>
                  <td class="col-eq">{humanize(e.equipment)}</td>
                  <td class="r fig">{#if e.usedIn}{e.usedIn}{:else}<span class="faint">—</span>{/if}</td>
                  <td class="more">
                    <button type="button" class="iconbtn" aria-label="More actions for {e.name}" aria-haspopup="menu" onclick={(ev) => openMenu(ev, `Actions ${e.id}`, () => rowItems(e))}>
                      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <Pager
          page={paged.page}
          limit={paged.limit}
          total={paged.total}
          noun="Exercises"
          onpage={(p) => view.setPage(p)}
          onlimit={(l) => view.setLimit(l)}
        />
      {:else if gap}
        <div class="gapnote">
          <span>
            <b>No {patternName(pre.movementPattern).toLowerCase()} exercise with {humanize(pre.equipment).toLowerCase()} yet.</b>
            Programs that need one fall back to other equipment.
          </span>
          <Button onclick={() => openNew()}>Add one</Button>
        </div>
      {:else}
        <EmptyState>
          {#if q}
            No exercise matches “{q}”.
          {:else if tab === "untagged"}
            Every exercise has a pattern and a functional tag.
          {:else if tab === "archived"}
            Nothing archived or hidden.
          {:else if tab === "mine"}
            You haven't added your own exercises yet.
          {:else}
            No exercises match these filters.
          {/if}
          {#snippet actions()}
            {#if q}<Button onclick={() => openNew(q)}>Create “{q}”</Button>{/if}
          {/snippet}
        </EmptyState>
      {/if}
    </section>

    {#if editing}
      {#key editing.nonce}
        <ExerciseInspector
          exercise={editingExercise}
          prefill={editing.prefill}
          {list}
          onclose={closeInspector}
          ondirty={(d) => (inspectorDirty = d)}
          onsave={save}
          onremove={remove}
          onrestore={(e) => setArchived([e.id], false)}
          ondelete={destroy}
          onduplicate={duplicate}
          onopen={(id) => open(id)}
        />
      {/key}
    {/if}
  </div>
{/if}

<LeaveGuard guard={guard.asker} />

{#if menu}
  <div class="menu" role="menu" aria-label={menu.label} bind:this={menuEl} style="left:{menu.x}px; top:{menu.y}px">
    {#each menu.items as it, i (i)}
      {#if it.sep}<hr />
      {:else if it.heading}<div class="mh" class:mg={it.group}>{it.label}</div>
      {:else}
        <button
          type="button"
          role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
          aria-checked={it.checked}
          aria-label={it.aria}
          class:danger={it.danger}
          class:swap={it.alt}
          onclick={(ev) => (ev.stopPropagation(), pickMenu(it))}
        >
          {#if it.checked !== undefined}<span class="chk" aria-hidden="true">{it.checked ? "✓" : ""}</span>{/if}<span class="ml">{it.label}</span
          >{#if it.note}<span class="cnt">{it.note}</span>{/if}{#if it.alt}<span class="alt">{it.alt}</span>{/if}
        </button>
      {/if}
    {/each}
  </div>
{/if}

<div class="flash" class:show={flashMsg} class:bad={flashMsg?.bad} role="status" aria-live="polite">
  {#if flashMsg}
    <span>{flashMsg.text}</span>
    {#if flashMsg.undo}
      <Button small onclick={() => { const u = flashMsg?.undo; flashMsg = null; u?.(); }}>Undo</Button>
    {/if}
  {/if}
</div>

<style>
  .fbtn :global(svg) { width: 12px; height: 12px; }
  .fbtn .n { font: 500 11px/1 var(--font-ui); background: var(--hover-ink); color: var(--on-ink); border-radius: 99px; padding: 2px 6px; }
  .sortsel { flex: none; width: 180px; }
  .active-f { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: -4px 0 12px; }
  .active-f .tchip :global(svg) { width: 10px; height: 10px; margin-left: 4px; }
  .active-f .linkbtn { font-size: 12px; margin-left: 6px; }

  .split { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
  .split.open { grid-template-columns: minmax(0, 1fr) 400px; }
  .panel-head input[type="checkbox"], td.cb input { width: 15px; height: 15px; accent-color: var(--hover-ink); cursor: pointer; }
  .bulk { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; flex: 1; }
  .bulk .clear { margin-left: auto; font-size: 13px; }

  .tw { overflow-x: auto; position: relative; }
  .sheet td { vertical-align: middle; }
  .sheet .cb { width: 36px; padding-right: 0; }
  .sheet tbody tr { cursor: pointer; }
  .sheet tbody tr.sel td { background: var(--pulse-now-bg); }
  .sheet tbody tr.arch td { color: var(--faint); }
  .nm { appearance: none; border: 0; background: none; padding: 0; font: 600 14px var(--font-ui); color: var(--ink); cursor: pointer; text-align: left; }
  .nm:hover { color: var(--blue); text-decoration: underline; }
  .sec { display: block; margin-top: 1px; font-size: 12px; color: var(--faint); }
  .more { width: 36px; }
  .fig { font: 500 12px var(--font-mono); font-variant-numeric: tabular-nums; }
  .faint { color: var(--faint); font-size: 12px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

  .src { font: 500 11px/1 var(--font-ui); padding: 2px 6px; border-radius: 99px; border: 1px solid var(--line); vertical-align: 1px; margin-left: 6px; }
  .src.mine { color: var(--blue); border-color: var(--blue-line); background: var(--pulse-now-bg); }
  .arch-tag {
    font: 500 11px/1 var(--font-ui); padding: 2px 6px; border-radius: 99px; border: 1px solid var(--line); color: var(--faint);
    background: var(--well); margin-left: 6px;
  }
  .untag {
    display: inline-flex; align-items: center; font: 500 12px/1.2 var(--font-ui); padding: 1px 8px; border-radius: 99px;
    border: 1px dashed var(--line-strong); color: var(--warn); background: transparent; white-space: nowrap; cursor: pointer;
  }
  .untag:hover { border-color: var(--warn); background: var(--warn-bg); }
  .iconbtn {
    appearance: none; width: 28px; height: 28px; display: inline-grid; place-items: center; border: 0; border-radius: 6px;
    background: none; color: var(--muted); cursor: pointer;
  }
  .iconbtn:hover { background: var(--well-2); color: var(--ink); }
  .iconbtn svg { width: 16px; height: 16px; stroke: currentColor; fill: none; stroke-width: 1.7; stroke-linecap: round; }
  .linkbtn { appearance: none; background: none; border: 0; padding: 0; font: inherit; color: var(--blue); cursor: pointer; }
  .linkbtn:hover { text-decoration: underline; }

  .gapnote { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; padding: 22px 16px; color: var(--muted); }
  .gapnote b { color: var(--ink); }

  .menu {
    position: fixed; z-index: 30; min-width: 220px; max-height: min(420px, 70vh); overflow-y: auto; background: var(--surface);
    border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--shadow-overlay); padding: 4px;
  }
  .menu button {
    display: flex; width: 100%; gap: 8px; align-items: center; padding: 6px 10px; border: 0; background: none; border-radius: 6px;
    font: 400 14px var(--font-ui); color: var(--ink); cursor: pointer; text-align: left;
  }
  .menu button:hover, .menu button:focus-visible { background: var(--well-2); outline: none; }
  .menu button.danger { color: var(--bad); }
  .menu button.danger:hover { background: var(--bad-bg); }
  .menu hr { border: 0; border-top: 1px solid var(--line-soft); margin: 4px 0; }
  .menu .mh { font: 600 12px var(--font-ui); color: var(--muted); padding: 6px 10px 4px; }
  .menu .chk { width: 14px; }
  .menu .mh.mg { font: 500 11px var(--font-ui); letter-spacing: 0.06em; text-transform: uppercase; color: var(--faint); padding: 8px 10px 2px; }
  .menu .ml { flex: 1; }
  .menu .cnt { font: 500 12px var(--font-ui); font-variant-numeric: tabular-nums; color: var(--muted); }
  /* "✓ all" rows: hover/focus swaps the count for "Remove from N" in a danger tone; the tag name stays. */
  .menu .alt { display: none; font: 500 12px var(--font-ui); }
  .menu button.swap:hover, .menu button.swap:focus-visible { background: var(--bad-bg); color: var(--bad); }
  .menu button.swap:hover .cnt, .menu button.swap:focus-visible .cnt { display: none; }
  .menu button.swap:hover .alt, .menu button.swap:focus-visible .alt { display: inline; }
  .pats { display: inline-flex; gap: 4px; align-items: center; }
  .pill.more { background: none; border: 1px dashed var(--line-strong); color: var(--muted); }

  .flash {
    position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); z-index: 40; display: flex; gap: 12px; align-items: center;
    font: 500 13px/1.5 var(--font-ui); color: var(--ink); background: var(--surface); border: 1px solid var(--line);
    border-radius: 6px; padding: 8px 8px 8px 14px; box-shadow: var(--shadow-overlay);
    opacity: 0; transform: translate(-50%, 8px); pointer-events: none;
    transition: opacity 160ms cubic-bezier(0.16, 1, 0.3, 1), transform 160ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .flash.show { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
  .flash.bad { color: var(--bad); border-color: var(--bad-line); background: var(--bad-bg); }

  @media (max-width: 1180px) {
    .split.open { grid-template-columns: minmax(0, 1fr); }
  }
  @media (max-width: 760px) {
    .col-func, .col-eq { display: none; }
    .sortsel { margin-left: 0; }
  }
  /* Phone: the three filters share one row; sort gets the next row to itself. */
  @container main (max-width: 700px) {
    .fbtn { flex: 1 1 25%; min-width: 0; justify-content: center; gap: 4px; padding-inline: 8px; }
    .sortsel { flex: 1 1 60%; width: auto; }
  }
  @media (prefers-reduced-motion: reduce) {
    .flash { transition: none; }
  }
</style>
