<script lang="ts">
  import { untrack } from "svelte";
  import { SvelteSet } from "svelte/reactivity";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { CLIENT_STATUSES, pageOf, type ClientStatus } from "@pt/shared";
  import { listUrlState } from "$lib/list/urlState.svelte";
  import ListToolbar from "$lib/ui/ListToolbar.svelte";
  import Pager from "$lib/ui/Pager.svelte";
  import { apiMode } from "$lib/api";
  import { adminApi, type AdminClient } from "$lib/api/admin";
  import {
    booksOf,
    filterClients,
    lastSessionLabel,
    programmeLabel,
    sampleAdminClients,
    trainersOf,
    type BookCell,
    type TrainerBook,
  } from "$lib/adminClients";
  import { localToday, shortDay } from "$lib/dates";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import Avatar from "$lib/ui/Avatar.svelte";
  import Button from "$lib/ui/Button.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Pill from "$lib/ui/Pill.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import SelectPrefixed from "$lib/ui/SelectPrefixed.svelte";

  const STATUS_LABEL: Record<ClientStatus, string> = { active: "Active", paused: "Paused", archived: "Archived" };

  /** Real data comes from the live API; mock mode and `?demo` show a sample platform. */
  const demo = $derived(page.url.searchParams.has("demo"));
  const useSample = $derived(apiMode === "mock" || demo);
  const today = localToday();
  /** Detail link for a client, keeping `?demo` so sample data stays sample. */
  const hrefOf = (id: string) => `/admin/clients/${encodeURIComponent(id)}${demo ? "?demo" : ""}`;

  let rows = $state<AdminClient[] | null>(null);
  let loadError = $state<string | null>(null);

  async function load(sample: boolean) {
    rows = null;
    loadError = null;
    if (sample) {
      const got = await sampleAdminClients(today);
      if (useSample) rows = got;
      return;
    }
    try {
      rows = await adminApi.clients();
    } catch (err) {
      loadError = (err as Error).message;
    }
  }

  // (Re)load when the source flips between sample and real data — and only then.
  $effect(() => {
    const sample = useSample;
    untrack(() => load(sample));
  });

  // Filters live in the URL so a trainer's client count can link straight here.
  const view = listUrlState({ trainer: null, status: ["", ...CLIENT_STATUSES] });
  const q = $derived(view.q);
  const trainerId = $derived(view.params.trainer);
  const status = $derived(view.params.status as ClientStatus | "");
  const statusOpts: { value: ClientStatus | ""; label: string }[] = [
    { value: "", label: "Any" },
    ...CLIENT_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
  ];

  const trainers = $derived(trainersOf(rows ?? []));
  const trainerOpts = $derived([
    { value: "", label: "All" },
    ...trainers.map((t) => ({ value: t.id, label: t.name, hint: t.access === "disabled" ? "disabled" : undefined })),
  ]);
  const shown = $derived(filterClients(rows ?? [], { q, trainerId, status }));
  /** Every trainer's whole book (strip and counts never shrink with a filter)… */
  const allBooks = $derived(booksOf(rows ?? [], today));
  /** …and the clients the filters leave, per trainer. */
  const shownBy = $derived.by(() => {
    const by = new Map<string, AdminClient[]>();
    for (const c of shown) by.set(c.trainer.id, [...(by.get(c.trainer.id) ?? []), c]);
    return by;
  });
  const books = $derived(allBooks.filter((b) => shownBy.has(b.trainer.id)));
  // Paged by trainer in the browser: the directory is one read, and `?demo` swaps in sample rows.
  const paged = $derived(pageOf(books, view.page, view.limit));

  /** Books the admin opened by hand. A filter opens every book it leaves; a small platform starts open. */
  const opened = new SvelteSet<string>();
  let seeded = false;
  $effect(() => {
    if (seeded || rows == null) return;
    seeded = true;
    if (allBooks.length <= 3) untrack(() => allBooks.forEach((b) => opened.add(b.trainer.id)));
  });
  const isOpen = (id: string) => view.filtering || opened.has(id);
  const allOpen = $derived(paged.items.every((b) => isOpen(b.trainer.id)));
  function toggle(id: string) {
    if (opened.has(id)) opened.delete(id);
    else opened.add(id);
  }
  /** The whole row acts, except clicks on its own links and buttons (DESIGN.md › Lists). */
  const onRow = (e: MouseEvent, act: () => void) => {
    if (!(e.target as HTMLElement).closest("a, button")) act();
  };
  function setAll(open: boolean) {
    for (const b of paged.items) {
      if (open) opened.add(b.trainer.id);
      else opened.delete(b.trainer.id);
    }
  }

  const summary = $derived.by(() => {
    if (rows == null) return "Every trainer's members, read-only";
    const n = rows.length;
    const t = trainers.length;
    return `Every trainer's members, read-only · ${n} ${n === 1 ? "member" : "members"} across ${t} ${t === 1 ? "trainer" : "trainers"}`;
  });

  const CELL_LABEL: Record<BookCell, string> = {
    recent: "logged in the last 7 days",
    fading: "logged 8–14 days ago",
    quiet: "quiet for over 2 weeks",
    never: "never logged",
    off: "paused or archived",
  };
  /** "4 active · 1 paused" — zero counts drop out. */
  const statusLine = (b: TrainerBook) =>
    CLIENT_STATUSES.filter((s) => b.status[s] > 0)
      .map((s) => `${b.status[s]} ${s}`)
      .join(" · ");
  /** The book strip's sentence for screen readers and the tooltip. */
  const stripLabel = (b: TrainerBook) =>
    (Object.keys(CELL_LABEL) as BookCell[])
      .map((k) => [k, b.strip.filter((s) => s.cell === k).length] as const)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${n} ${CELL_LABEL[k]}`)
      .join("; ");
  /** Which strip states this page draws, for the legend. */
  const drawn = $derived(new Set(paged.items.flatMap((b) => b.strip.map((s) => s.cell))));
</script>

<svelte:head><title>All members · Program Tracker</title></svelte:head>

{#if demo && apiMode === "live"}
  <Note tone="warn" class="sample-note">
    Sample data — none of these members are real.
    <Button small variant="ghost" href={page.url.pathname}>Back to real data</Button>
  </Note>
{/if}

<PageHead title="All members" sub={summary} />

{#if loadError}
  <Note tone="bad">
    Couldn't load members — {loadError}.
    <Button small onclick={() => load(useSample)}>Try again</Button>
  </Note>
{:else if rows === null}
  <SkeletonPanel rows={6} label="Loading members…" />
{:else if rows.length === 0}
  <section class="panel"><EmptyState>No members yet — trainers' members show up here once they add them.</EmptyState></section>
{:else}
  {#snippet toolbarFilters()}
    <div class="filt"><SelectPrefixed prefix="Trainer" maxWidth="none" options={trainerOpts} value={trainerId} onchange={(v) => view.set({ trainer: v })} /></div>
    <div class="filt"><SelectPrefixed prefix="Status" maxWidth="none" options={statusOpts} value={status} onchange={(v) => view.set({ status: v })} /></div>
  {/snippet}
  <ListToolbar
    bind:value={view.search}
    label="Search member or trainer"
    count={view.filtering ? `${shown.length} of ${rows.length}` : undefined}
    filters={toolbarFilters}
  />

  {#if shown.length === 0}
    <section class="panel">
      <EmptyState>
        No clients match these filters.
        {#snippet actions()}<Button onclick={() => view.clear()}>Clear filters</Button>{/snippet}
      </EmptyState>
    </section>
  {:else}
    <Panel title="Trainers" count={books.length}>
      {#snippet act()}
        {#if !view.filtering}
          <span class="head-act">
            <Button small variant="ghost" onclick={() => setAll(!allOpen)}>{allOpen ? "Collapse all" : "Expand all"}</Button>
          </span>
        {/if}
      {/snippet}

      <table class="sheet tree">
        <thead>
          <tr><th>Member</th><th>Status</th><th>Program</th><th>Member since</th><th>Last session</th></tr>
        </thead>
        {#each paged.items as b (b.trainer.id)}
          {@const open = isOpen(b.trainer.id)}
          {@const clients = shownBy.get(b.trainer.id) ?? []}
          {@const off = b.trainer.access === "disabled"}
          <tbody class="book" class:open>
            <tr class="grp" onclick={(e) => onRow(e, () => !view.filtering && toggle(b.trainer.id))}>
              <th scope="rowgroup" class="g-who">
                <button type="button" class="disclose" aria-expanded={open} disabled={view.filtering} onclick={() => toggle(b.trainer.id)}>
                  <Icon name="chevron" />
                  <Avatar name={b.trainer.name} />
                  <span class="t-name" class:off>{b.trainer.name}</span>
                  {#if off}<Pill tone="bad">Disabled</Pill>{/if}
                  <span class="t-count"><span class="mono">{b.clients.length}</span> {b.clients.length === 1 ? "member" : "members"}</span>
                </button>
              </th>
              <td class="g-status">{statusLine(b)}</td>
              <td class="g-book">
                <span class="strip" role="img" aria-label="{b.trainer.name}'s book: {stripLabel(b)}" title={stripLabel(b)}>
                  {#each b.strip as s (s.client.id)}<i class={s.cell}></i>{/each}
                </span>
                <span class="facts">
                  {#if b.quiet}<span class="warn"><span class="mono">{b.quiet}</span> quiet</span>{/if}
                  {#if b.never}<span><span class="mono">{b.never}</span> never logged</span>{/if}
                  {#if b.over}<span class="warn"><span class="mono">{b.over}</span> over plan</span>{/if}
                  {#if !b.quiet && !b.never && !b.over}<span class="calm">All logging</span>{/if}
                </span>
              </td>
              <td class="g-log" colspan="2"><a class="log" href="/admin/trainers/{b.trainer.id}" aria-label="Access log for {b.trainer.name}">Access log</a></td>
            </tr>
            {#if open}
              {#each clients as c (c.id)}
                {@const last = lastSessionLabel(c.lastSessionAt, today)}
                <tr class="client" class:dim={c.status !== "active"} onclick={(e) => onRow(e, () => goto(hrefOf(c.id)))}>
                  <td class="who-cell">
                    <div class="who"><Avatar name={c.name} /><a class="name" href={hrefOf(c.id)}>{c.name}</a></div>
                  </td>
                  <td><span class="m-label">Status</span><StatusPill status={c.status} /></td>
                  <td class="prog">
                    <span class="m-label">Programme</span>
                    {#if c.programme}
                      <span class="prog-val">
                        <span class="prog-name" title={c.programme.name}>{c.programme.name}</span>
                        <span class="prog-week">
                          <span class="track" class:over={c.programme.over} aria-hidden="true"><i style:width="{Math.min(100, (c.programme.week / c.programme.of) * 100)}%"></i></span>
                          <span class="tnum" class:over={c.programme.over}>{programmeLabel(c.programme)}</span>
                        </span>
                      </span>
                    {:else}<span class="subtle">—</span>{/if}
                  </td>
                  <td class="tnum"><span class="m-label">Member since</span>{shortDay(c.clientSince, today)}</td>
                  <td class="tnum last {last.tone}">
                    <span class="m-label">Last session</span>
                    <span title={c.lastSessionAt ?? "No session logged"}>{last.text}</span>
                  </td>
                </tr>
              {/each}
              {#if clients.length < b.clients.length}
                <tr class="more">
                  <td colspan="5">
                    <span class="mono">{b.clients.length - clients.length}</span> more of {b.trainer.name}'s members don't match.
                  </td>
                </tr>
              {/if}
            {/if}
          </tbody>
        {/each}
      </table>

      <p class="legend" aria-hidden="true">
        {#each ["recent", "fading", "quiet", "never", "off"] as const as k (k)}
          {#if drawn.has(k)}<span><i class={k}></i>{k === "recent" ? "≤7 days" : k === "fading" ? "8–14 days" : k === "quiet" ? "Quiet 15+ days" : k === "never" ? "Never logged" : "Paused or archived"}</span>{/if}
        {/each}
      </p>

      <Pager
        page={paged.page}
        limit={paged.limit}
        total={paged.total}
        noun="Trainers"
        onpage={(p) => view.setPage(p)}
        onlimit={(l) => view.setLimit(l)}
      />
    </Panel>
  {/if}
{/if}

<style>
  .filt { flex: none; width: 200px; }
  /* Phone: the two filters split one row under the search; the count, when
     it shows, takes its own line so the filters never shift width. */
  @container main (max-width: 700px) {
    .filt { flex: 1 1 calc(50% - 4px); width: auto; min-width: 0; }
  }
  :global(.note.sample-note) { display: flex; align-items: center; gap: 6px; margin-bottom: 12px; }
  .head-act { margin-left: auto; }
  .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

  /* —— trainer group row ——————————————————— */
  .tree .grp > * { padding: 6px 16px; vertical-align: middle; background: var(--surface); border-bottom: 1px solid var(--line-soft); font: 400 12px/1.4 var(--font-ui); color: var(--muted); }
  .tree tbody.book + tbody.book .grp > * { border-top: 1px solid var(--line); }
  .tree tbody.book:not(.open) .grp > * { border-bottom: none; }
  .tree tbody.book.open .grp > * { background: var(--well); }
  .tree .grp .g-who { padding-left: 6px; color: var(--ink); text-align: left; }
  .tree .grp .g-book { display: table-cell; }
  .g-book .strip { vertical-align: middle; margin-right: 12px; }
  .g-book .facts { display: inline-flex; vertical-align: middle; }
  .g-log { text-align: right; }
  .disclose {
    display: flex; align-items: center; gap: 10px; min-width: 0;
    padding: 6px 8px; margin: 0;
    border: 1px solid transparent; border-radius: 6px; background: none;
    font: inherit; color: inherit; text-align: left; cursor: pointer;
  }
  .disclose:focus-visible { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
  .disclose:disabled { cursor: default; }
  .disclose :global(svg) { width: 14px; height: 14px; flex: none; color: var(--muted); transform: rotate(-90deg); transition: transform 120ms ease-out; }
  .disclose[aria-expanded="true"] :global(svg) { transform: none; }
  .disclose :global(.avatar) { width: 28px; height: 28px; font-size: 11px; flex: none; }
  .t-name { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t-name.off { color: var(--muted); }
  .t-count { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .t-status { font-size: 12px; color: var(--muted); }

  /* The book strip: one square per client, the contributions ramp for who is logging. */
  .strip { display: inline-flex; flex-wrap: wrap; gap: 2px; max-width: 168px; }
  .strip i, .legend i { display: block; width: 10px; height: 10px; border-radius: 2px; outline: 1px solid var(--cell-edge); outline-offset: -1px; }
  i.recent { background: var(--done-3); }
  i.fading { background: var(--done-1); }
  i.quiet { background: var(--warn-bg); outline: 1px solid var(--warn); }
  i.never { background: var(--surface); outline: 1px solid var(--faint); }
  i.off { background: var(--well-2); outline: 1px solid var(--line); }

  .facts { display: flex; flex-wrap: wrap; gap: 2px 10px; font-size: 12px; color: var(--muted); }
  .g-who .disclose { width: 100%; }
  .facts .warn { color: var(--warn); font-weight: 500; }
  .facts .calm { color: var(--faint); }
  .log { font-size: 12px; white-space: nowrap; }

  /* —— client rows, indented under their trainer ———————— */
  .tree .who-cell { padding-left: 48px; }
  .who { display: flex; align-items: center; gap: 10px; }
  .who :global(.avatar) { width: 24px; height: 24px; font-size: 11px; flex: none; }
  .name { font-weight: 600; color: var(--ink); white-space: nowrap; }
  .name:hover { color: var(--blue); text-decoration: underline; }
  .tree tr.dim td, .tree tr.dim .name { color: var(--muted); }
  /* Rows tint whole: the sheet's per-cell hover would patch the trainer row
     and leave gaps between a stacked card's cells. Touch screens get none. */
  .tree tbody.book tr.grp:hover > * { background: var(--surface); }
  .tree tbody.book.open tr.grp:hover > * { background: var(--well); }
  .tree tbody.book tr.client:hover > td { background: none; }
  @media (hover: hover) {
    .tree tbody.book tr.grp, .tree tbody.book tr.client { cursor: pointer; }
    .tree tbody.book tr.client:hover > td { background: var(--row-hover); }
    .tree tbody.book tr.grp:hover > *, .tree tbody.book.open tr.grp:hover > * { background: var(--hover-soft); }
  }
  .prog { min-width: 180px; }
  .prog-val { display: flex; flex-direction: column; gap: 3px; min-width: 0; max-width: 280px; }
  /* Long programme names stop at two lines; the full name is on hover. */
  .prog-name { display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .prog-week { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--muted); }
  .track { flex: none; width: 48px; height: 4px; border-radius: 99px; background: var(--well-2); overflow: hidden; }
  .track i { display: block; height: 100%; background: var(--blue); }
  .track.over i { background: var(--warn); }
  .prog-week .over { color: var(--warn); }
  .tnum { font-variant-numeric: tabular-nums; white-space: nowrap; }
  .last.none { color: var(--muted); }
  .last.dormant { color: var(--warn); }
  .tree tr.more td { padding: 8px 16px 10px 48px; font-size: 12px; color: var(--muted); background: var(--surface); }
  .m-label { display: none; }

  .legend {
    display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px 14px;
    margin: 0; padding: 8px 16px; border-top: 1px solid var(--line-soft);
    font-size: 11px; color: var(--muted);
  }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }

  /* Sized to the room beside the sidebar, not the window: the five
     columns need ~700px, which the sidebar takes away long before a phone. */
  @container main (max-width: 760px) {
    .tree thead { display: none; }
    .tree, .tree tbody { display: block; width: 100%; }
    .tree .grp {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "who log" "book book";
      align-items: center;
      background: var(--surface);
      border-bottom: 1px solid var(--line-soft);
    }
    .tree tbody.book + tbody.book .grp { border-top: 1px solid var(--line); }
    .tree tbody.book.open .grp { background: var(--well); }
    .tree tbody.book:not(.open) .grp { border-bottom: none; }
    .tree .grp > * { display: block; border: none !important; background: none !important; padding: 0 12px; }
    .tree .grp .g-who { grid-area: who; padding: 4px 0 0 4px; }
    .tree .grp .g-status { display: none; }
    .tree .grp .g-book { grid-area: book; display: flex; justify-content: space-between; padding: 0 12px 10px 46px; }
    .tree .grp .g-log { grid-area: log; padding-top: 4px; }

    .tree tr.client {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas: "who status" "prog prog" "since since" "last last";
      row-gap: 3px;
      padding: 10px 12px;
      border-bottom: 1px solid var(--line-soft);
    }
    .tree tbody.book tr.client:last-child { border-bottom: none; }
    .tree tbody.book tr.client:hover > td { background: none; }
    .tree tbody.book tr.client:hover { background: var(--row-hover); }
    .tree tbody.book tr.grp:hover { background: var(--hover-soft); }
    .tree tr.client td { display: flex; align-items: baseline; gap: 8px; min-width: 0; padding: 0; border: none; white-space: normal; background: none; }
    .tree tr.client td:nth-child(1) { grid-area: who; padding-left: 0; margin-bottom: 4px; align-items: center; }
    .tree tr.client td:nth-child(2) { grid-area: status; align-items: center; margin-bottom: 4px; }
    .tree tr.client td:nth-child(2) .m-label { display: none; }
    .tree tr.client td:nth-child(3) { grid-area: prog; }
    .tree tr.client td:nth-child(4) { grid-area: since; }
    .tree tr.client td:nth-child(5) { grid-area: last; }
    .tree td > :not(.m-label) { min-width: 0; }
    .prog-val { max-width: none; }
    .m-label { display: inline; flex: none; width: 96px; color: var(--muted); font-size: 12px; }
    .tree tr.more { display: block; }
    .tree tr.more td { display: block; padding: 8px 12px 10px; }
    .legend { justify-content: flex-start; }
  }
  @media (hover: none) {
    .tree tbody.book tr.client:hover { background: none; }
    .tree tbody.book tr.grp:hover { background: var(--surface); }
    .tree tbody.book.open tr.grp:hover { background: var(--well); }
  }
  @media (prefers-reduced-motion: reduce) {
    .disclose :global(svg) { transition: none; }
  }
</style>
