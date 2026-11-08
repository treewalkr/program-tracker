<script lang="ts">
  import { tick } from "svelte";
  import type { ExerciseRole, RoleLabel } from "@pt/shared";
  import { canCreateLabel, groupRoleLabels, roleDisplay, searchRoleLabels } from "$lib/roleLabels";
  import { roleLabels } from "$lib/roleLabelStore.svelte";
  import Icon from "$lib/ui/Icon.svelte";

  /**
   * Role picker (ARIA combobox), the pill at the head of an exercise. Typing
   * filters the labels by name, chip or meaning; an empty query lists them by
   * category, the trainer's own under "Your labels". "No role" clears it. The
   * last option makes a new label from the query (name, chip, one-line
   * meaning, where it sorts) and picks it. Shift+Enter or the pencil edits a
   * label's meaning. ↑↓ / Enter / Esc.
   */
  let {
    value,
    onpick,
    labels: labelsProp,
    editable = true,
  }: {
    value: ExerciseRole | undefined;
    onpick: (role: ExerciseRole | undefined) => void;
    /** The trainer's labels; defaults to the shared store. */
    labels?: RoleLabel[];
    /** Offer "+ New label" and editing (saved through the store). */
    editable?: boolean;
  } = $props();

  const labels = $derived(labelsProp ?? roleLabels.all);
  const uid = $props.id();
  let open = $state(false);
  let query = $state("");
  let active = $state(0);
  let root = $state<HTMLDivElement>();
  let trigger = $state<HTMLButtonElement>();
  let search = $state<HTMLInputElement>();
  let listEl = $state<HTMLUListElement>();

  const current = $derived(value ? roleDisplay(value, labels) : null);
  const typed = $derived(query.trim().replace(/\s+/g, " "));
  const matches = $derived(searchRoleLabels(labels, query));
  const groups = $derived(typed ? [{ label: "", items: matches }] : groupRoleLabels(matches));
  const canCreate = $derived(editable && canCreateLabel(labels, typed));

  type Option = { kind: "none" } | { kind: "label"; label: RoleLabel } | { kind: "create" };
  /** Flat option order for keyboard movement: No role (browsing only), the labels as grouped, then create. */
  const options = $derived<Option[]>([
    ...(typed ? [] : [{ kind: "none" } as const]),
    ...groups.flatMap((g) => g.items.map((label) => ({ kind: "label", label }) as const)),
    ...(canCreate ? [{ kind: "create" } as const] : []),
  ]);
  const optId = (i: number) => `${uid}-opt-${i}`;
  const indexOfLabel = (l: RoleLabel) => options.findIndex((o) => o.kind === "label" && o.label.key === l.key);
  const activeLabels = $derived(labels.filter((l) => !l.archived).sort((a, b) => a.rank - b.rank));

  // —— forms: a new label, or a label's meaning ————————————————————————————
  type Form = { mode: "new" | "edit"; target: RoleLabel | null; name: string; chip: string; description: string; after: string };
  let form = $state<Form | null>(null);
  let saving = $state(false);
  let formError = $state("");
  let firstField = $state<HTMLInputElement>();

  async function startCreate() {
    form = { mode: "new", target: null, name: typed, chip: "", description: "", after: activeLabels.at(-1)?.key ?? "" };
    formError = "";
    await tick();
    firstField?.focus();
    if (typed) firstField?.select();
  }

  async function startEdit(l: RoleLabel) {
    form = { mode: "edit", target: l, name: l.name, chip: l.chip === l.name ? "" : l.chip, description: l.description, after: "" };
    formError = "";
    await tick();
    firstField?.focus();
  }

  async function backToList() {
    form = null;
    await tick();
    search?.focus();
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!form || saving) return;
    const name = form.name.trim();
    const description = form.description.trim();
    if (!name) return void (formError = "Give the label a name.");
    if (!description && (form.mode === "new" || !form.target?.builtinKey)) {
      return void (formError = "Say in a line what the label means.");
    }
    saving = true;
    formError = "";
    try {
      if (form.mode === "new") {
        const created = await roleLabels.create({ name, chip: form.chip.trim() || undefined, description, after: form.after || undefined });
        form = null;
        onpick(created.key);
        hide();
      } else if (form.target) {
        const t = form.target;
        await roleLabels.update(t.builtinKey ?? t.id!, {
          ...(t.builtinKey ? {} : { name }),
          chip: form.chip.trim(),
          description,
        });
        await backToList();
      }
    } catch (err) {
      formError = err instanceof Error ? err.message : "Couldn't save the label.";
    } finally {
      saving = false;
    }
  }

  async function archive() {
    const t = form?.target;
    if (!t?.id || saving) return;
    saving = true;
    try {
      await roleLabels.archive(t.id);
      await backToList();
    } catch (err) {
      formError = err instanceof Error ? err.message : "Couldn't remove the label.";
    } finally {
      saving = false;
    }
  }

  function onFormKey(e: KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); backToList(); }
  }

  // —— open / close / pick ———————————————————————————————————————————————
  async function show() {
    query = "";
    form = null;
    open = true;
    await tick();
    active = Math.max(0, value ? options.findIndex((o) => o.kind === "label" && o.label.key === value) : 0);
    search?.focus();
    scrollActive("center");
  }

  function hide(refocus = true) {
    open = false;
    form = null;
    if (refocus) trigger?.focus();
  }

  function choose(o: Option | undefined) {
    if (!o) return;
    if (o.kind === "create") return void startCreate();
    const role = o.kind === "label" ? o.label.key : undefined;
    if (role !== value) onpick(role);
    hide();
  }

  function scrollActive(block: ScrollLogicalPosition = "nearest") {
    listEl?.querySelector(`#${CSS.escape(optId(active))}`)?.scrollIntoView({ block });
  }

  async function move(to: number) {
    if (options.length === 0) return;
    active = (to + options.length) % options.length;
    await tick();
    scrollActive();
  }

  function onkey(e: KeyboardEvent) {
    const o = options[active];
    if (e.key === "ArrowDown") { e.preventDefault(); move(active + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(active - 1); }
    else if (e.key === "Enter" && e.shiftKey && editable && o?.kind === "label") { e.preventDefault(); startEdit(o.label); }
    else if (e.key === "Enter") { e.preventDefault(); choose(o); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
    else if (e.key === "Tab") hide(false);
  }

  function onTriggerKey(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); show(); }
  }
</script>

<svelte:window
  onpointerdown={(e) => {
    if (open && root && !root.contains(e.target as Node)) hide(false);
  }}
/>

<div class="rp" bind:this={root}>
  <button
    bind:this={trigger}
    type="button"
    class="rp-btn"
    class:unset={!value}
    class:primary={value === "primary"}
    aria-haspopup="listbox"
    aria-expanded={open}
    aria-label="Role: {current?.name ?? 'none'}"
    title={current ? `${current.name} — ${current.description}` : "What the session emphasizes with this exercise"}
    onclick={() => (open ? hide() : show())}
    onkeydown={onTriggerKey}
  >
    <span class="rp-name">{current?.name ?? "No role"}</span>
    <span class="rp-chev" aria-hidden="true"></span>
  </button>

  {#if open}
    <div class="rp-pop">
      {#if form}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <form class="rp-form" onsubmit={submit} onkeydown={onFormKey} aria-label={form.mode === "new" ? "New label" : `Edit ${form.target?.name}`}>
          <div class="rp-form-head">
            <button type="button" class="rp-back" aria-label="Back to labels" onclick={backToList}><Icon name="chevron" /></button>
            <span class="rp-form-title">{form.mode === "new" ? "New label" : `Edit “${form.target?.name}”`}</span>
            {#if form.target?.builtinKey}<span class="rp-form-sub">Built-in</span>{/if}
          </div>
          <div class="rp-form-body">
            {#if form.target?.builtinKey}
              <div class="rp-f2">
                <label class="rp-f">
                  <span>Chip <em>optional</em></span>
                  <input bind:this={firstField} bind:value={form.chip} class="input" maxlength="12" placeholder={form.target.name} autocomplete="off" />
                </label>
              </div>
            {:else}
              <div class="rp-f2">
                <label class="rp-f">
                  <span>Name</span>
                  <input bind:this={firstField} bind:value={form.name} class="input" required maxlength="40" autocomplete="off" />
                </label>
                <label class="rp-f">
                  <span>Chip <em>optional</em></span>
                  <input bind:value={form.chip} class="input" maxlength="12" placeholder={form.name.trim() || "Same as name"} autocomplete="off" />
                </label>
              </div>
            {/if}
            <label class="rp-f">
              <span>What it means {#if form.target?.builtinKey}<em>empty = the default</em>{/if}</span>
              <input
                bind:value={form.description}
                class="input"
                required={!form.target?.builtinKey}
                maxlength="200"
                placeholder="e.g. Fast, light reps done fresh"
                autocomplete="off"
              />
            </label>
            {#if form.mode === "new"}
              <label class="rp-f">
                <span>Sort after</span>
                <select bind:value={form.after} class="select">
                  {#each activeLabels as l (l.key)}<option value={l.key}>{l.name}</option>{/each}
                </select>
              </label>
            {/if}
            {#if formError}<p class="rp-err" role="alert">{formError}</p>{/if}
          </div>
          <div class="rp-form-foot">
            {#if form.mode === "edit" && form.target?.id && !form.target.builtinKey}
              <button type="button" class="rp-archive" onclick={archive} disabled={saving}>Remove label</button>
            {/if}
            <button type="button" class="btn small" onclick={backToList}>Back</button>
            <button type="submit" class="btn small rp-save" disabled={saving}>
              {saving ? "Saving…" : form.mode === "new" ? "Add and use" : "Save"}
            </button>
          </div>
        </form>
      {:else}
        <div class="rp-search">
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
            aria-activedescendant={active < options.length ? optId(active) : undefined}
            aria-autocomplete="list"
            aria-label="Search labels"
            placeholder="Search labels"
            autocomplete="off"
            spellcheck="false"
          />
        </div>

        <ul class="rp-list" id="{uid}-list" role="listbox" aria-label="Labels" bind:this={listEl}>
          {#if !typed}
            <!-- keyboard lives on the combobox input (aria-activedescendant), per the ARIA combobox pattern -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              id={optId(0)}
              role="option"
              class="rp-opt rp-none"
              class:active={active === 0}
              aria-selected={!value}
              onpointermove={() => (active = 0)}
              onpointerdown={(e) => e.preventDefault()}
              onclick={() => choose({ kind: "none" })}
            >
              <span class="rp-check">{#if !value}<Icon name="check" />{/if}</span>
              <span class="rp-text"><span class="rp-opt-name">No role</span></span>
            </li>
          {/if}
          {#each groups as g (g.label)}
            {#if g.label}<li class="rp-group" role="presentation">{g.label}</li>{/if}
            {#each g.items as l (l.key)}
              {@const i = indexOfLabel(l)}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <li
                id={optId(i)}
                role="option"
                class="rp-opt"
                class:active={i === active}
                aria-selected={l.key === value}
                onpointermove={() => (active = i)}
                onpointerdown={(e) => e.preventDefault()}
                onclick={() => choose({ kind: "label", label: l })}
              >
                <span class="rp-check">{#if l.key === value}<Icon name="check" />{/if}</span>
                <span class="rp-text">
                  <span class="rp-opt-name">{l.name}{#if l.chip !== l.name}<span class="rp-chip">{l.chip}</span>{/if}</span>
                  <span class="rp-opt-meta">{l.description}</span>
                </span>
                {#if editable}
                  <button
                    type="button"
                    class="rp-edit"
                    tabindex="-1"
                    aria-label="Edit {l.name}"
                    title="Edit what {l.name} means (Shift+Enter)"
                    onclick={(e) => { e.stopPropagation(); startEdit(l); }}
                  ><Icon name="pencil" /></button>
                {/if}
              </li>
            {/each}
          {/each}
          {#if canCreate}
            {@const i = options.length - 1}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <li
              id={optId(i)}
              role="option"
              class="rp-opt rp-create"
              class:active={active === i}
              class:alone={matches.length === 0}
              aria-selected="false"
              onpointermove={() => (active = i)}
              onpointerdown={(e) => e.preventDefault()}
              onclick={startCreate}
            >
              <span class="rp-check"><Icon name="plus" /></span>
              <span class="rp-text">
                <span class="rp-opt-name">New label “<strong>{typed}</strong>”</span>
                <span class="rp-opt-meta">Name it, say what it means, use it here</span>
              </span>
            </li>
          {/if}
        </ul>

        {#if options.length === 0}
          <p class="rp-empty">No label matches “{typed}”.</p>
        {/if}

        <p class="rp-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>Enter</kbd> pick</span>
          {#if editable}<span><kbd>⇧</kbd><kbd>Enter</kbd> edit</span>{/if}
        </p>
      {/if}
    </div>
  {/if}
</div>

<style>
  .rp { position: relative; display: inline-flex; flex: none; }

  /* a pill like RoleChip that opens — dashed while unset, ink for the primary lift */
  .rp-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-width: 96px;
    font: 500 12.5px/1 var(--font-ui);
    color: var(--muted);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 5px 26px 5px 11px;
    cursor: pointer;
    text-align: left;
    transition: border-color 120ms ease, background-color 120ms ease;
  }
  .rp-btn:hover { border-color: var(--line-strong); background: var(--surface); }
  .rp-btn:focus-visible { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
  .rp-btn[aria-expanded="true"] { border-color: var(--blue); background: var(--surface); }
  .rp-btn.unset { background: transparent; border-style: dashed; }
  .rp-btn.primary { color: var(--ink); border-color: var(--line-strong); }
  .rp-name { white-space: nowrap; }
  .rp-chev {
    position: absolute;
    right: 11px;
    top: 50%;
    width: 5px;
    height: 5px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: translateY(-70%) rotate(45deg);
    pointer-events: none;
  }

  .rp-pop {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 340px;
    max-width: calc(100vw - 32px);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    box-shadow: var(--shadow-overlay);
    z-index: 20;
    overflow: hidden;
  }

  .rp-search {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    border-bottom: 1px solid var(--line-soft);
    color: var(--muted);
  }
  .rp-search :global(svg) { width: 14px; height: 14px; flex: none; }
  .rp-search input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: none;
    padding: 10px 0;
    font: 14px var(--font-ui);
    color: var(--ink);
  }
  .rp-search input::placeholder { color: var(--muted); }
  .rp-search:focus-within { color: var(--blue); }

  .rp-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    max-height: min(360px, 55vh);
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .rp-group {
    position: sticky;
    top: -4px;
    padding: 8px 12px 4px;
    background: var(--surface);
    font: 500 11px/1.2 var(--font-ui);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--muted);
  }
  .rp-opt {
    display: flex;
    gap: 6px;
    align-items: flex-start;
    margin: 0 4px;
    padding: 6px 6px 6px 4px;
    border-radius: var(--radius);
    cursor: pointer;
  }
  .rp-opt.active { background: var(--well-2); }
  .rp-none { border-bottom: 1px solid var(--line-soft); border-radius: var(--radius) var(--radius) 0 0; margin-bottom: 2px; }
  .rp-check { width: 16px; height: 18px; flex: none; color: var(--ink); display: inline-flex; align-items: center; }
  .rp-check :global(svg) { width: 14px; height: 14px; }
  .rp-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
  .rp-opt-name { font-size: 14px; color: var(--ink); line-height: 18px; }
  .rp-opt[aria-selected="true"] .rp-opt-name { font-weight: 600; }
  .rp-chip {
    margin-left: 6px;
    padding: 0 6px;
    border: 1px solid var(--line);
    border-radius: 99px;
    font: 500 11px/16px var(--font-ui);
    color: var(--muted);
    vertical-align: 1px;
  }
  .rp-opt-meta { font-size: 12px; line-height: 16px; color: var(--muted); }
  .rp-edit {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: var(--radius);
    background: none;
    color: var(--faint);
    cursor: pointer;
    opacity: 0;
    transition: opacity 120ms ease;
  }
  .rp-edit :global(svg) { width: 13px; height: 13px; }
  .rp-opt.active .rp-edit, .rp-edit:focus-visible { opacity: 1; }
  .rp-edit:hover { background: var(--surface); color: var(--ink); }
  @media (hover: none) { .rp-edit { opacity: 1; } }

  .rp-create { border-top: 1px solid var(--line-soft); border-radius: 0 0 var(--radius) var(--radius); margin-top: 4px; padding-top: 8px; }
  .rp-create.alone { border-top: none; margin-top: 0; }
  .rp-create .rp-check, .rp-create .rp-opt-name { color: var(--blue); }
  .rp-create strong { font-weight: 600; }

  .rp-empty { margin: 0; padding: 18px 12px; text-align: center; font-size: 13px; color: var(--muted); }

  .rp-foot {
    display: flex;
    gap: 12px;
    margin: 0;
    padding: 6px 12px;
    border-top: 1px solid var(--line-soft);
    background: var(--well);
    font-size: 11px;
    color: var(--muted);
  }
  .rp-foot kbd {
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

  .rp-form-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px 8px 6px;
    border-bottom: 1px solid var(--line-soft);
  }
  .rp-back {
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
  .rp-back:hover { background: var(--well-2); color: var(--ink); }
  .rp-back :global(svg) { width: 14px; height: 14px; transform: rotate(90deg); }
  .rp-form-title { font: 600 14px var(--font-ui); color: var(--ink); }
  .rp-form-sub { margin-left: auto; font-size: 12px; color: var(--muted); }
  .rp-form-body { display: grid; gap: 10px; padding: 12px; }
  .rp-f2 { display: grid; grid-template-columns: 1fr 96px; gap: 10px; }
  .rp-f2:has(> :only-child) { grid-template-columns: 120px; }
  .rp-f { display: grid; gap: 4px; min-width: 0; }
  .rp-f > span { font: 500 12px var(--font-ui); color: var(--ink); }
  .rp-f em { font-style: normal; font-weight: 400; color: var(--muted); }
  .rp-f .input, .rp-f .select { width: 100%; font-size: 14px; }
  .rp-err { margin: 0; font-size: 12px; color: var(--bad); }
  .rp-form-foot {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-top: 1px solid var(--line-soft);
    background: var(--well);
  }
  .rp-archive {
    margin-right: auto;
    border: none;
    background: none;
    padding: 0;
    font: 500 12px var(--font-ui);
    color: var(--muted);
    cursor: pointer;
  }
  .rp-archive:hover { color: var(--bad); }

  @media (max-width: 600px) {
    .rp-pop { width: calc(100vw - 32px); }
    .rp-foot { display: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .rp-btn, .rp-edit { transition: none; }
  }
</style>
