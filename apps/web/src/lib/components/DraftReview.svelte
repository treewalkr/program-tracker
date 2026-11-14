<script lang="ts">
  import { roleLabels } from "$lib/roleLabelStore.svelte";
  import { effortSummary } from "$lib/effort";
  import { diffDrafts, draftWeek, mergeWeekChanges, shownExerciseOrder, weekRangeLabel, type SlotChange } from "@pt/shared";
  import type { ClientDto, DraftEditResultDto, ExerciseDto, GenerationDto, LlmNoteDto, NoteAnchorDto, ProgramDto, ProgramPhasingDto } from "$lib/api/types";
  import { DraftEditor } from "$lib/draftEditor.svelte";
  import { rowMenuItems } from "$lib/draftEditMenu";
  import DraftEditDock from "./DraftEditDock.svelte";
  import { api } from "$lib/api";
  import { revisionChain } from "$lib/generation";
  import { renderMarkdown } from "$lib/chatRefine";
  import {
    ago,
    clientDeload,
    defaultPlan,
    deloadLoadPhrase,
    draftSessionTags,
    historyEntries,
    planChanges,
    rationaleByDay,
    reviewChecks,
    type PlanChange,
  } from "$lib/draftReview";
  import SessionCard, { type SessionEditable, type SlotMark } from "./SessionCard.svelte";
  import BlockPlanStrip from "./BlockPlanStrip.svelte";
  import BlockPlanEditor from "./BlockPlanEditor.svelte";
  import StatusPill from "./StatusPill.svelte";
  import DraftWeekTabs from "./DraftWeekTabs.svelte";
  import Verdict from "./Verdict.svelte";
  import NoteEditor from "./NoteEditor.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";

  /**
   * Review an AI draft and decide. Top: what changed since the previous
   * version (read from the drafts), automatic checks, how the draft evolved,
   * and Approve with its reassurance. Then the block plan (editable by hand —
   * saving creates the next version), then the week: each session beside its own
   * reasoning, or before/after against any earlier version. With
   * `oneditsaved`, the latest version's sessions can be rearranged by hand
   * (row ⋯ menu, Select mode) — each edit saves the next version.
   */
  interface Props {
    gen: GenerationDto;
    gens: GenerationDto[];
    client: ClientDto;
    current: ProgramDto | null;
    catalogById: ReadonlyMap<string, Pick<ExerciseDto, "movementPattern">>;
    newProgram: ProgramDto | null;
    approving?: boolean;
    rejecting?: boolean;
    revisionCancelled?: boolean;
    onapprove: () => void;
    onreject: (reason: string) => void;
    onreset: () => void;
    /** Persist an edited plan; resolves once the new version is the page's `gen`. */
    onsaveplan: (phasing: ProgramPhasingDto) => Promise<void>;
    /** A note was applied: show this new version. Without it, notes can't be applied. */
    onrevised?: (child: GenerationDto) => Promise<void> | void;
    /** A hand edit saved the next version: show it. Without it, sessions are read-only. */
    oneditsaved?: (res: DraftEditResultDto) => void;
  }

  let {
    gen,
    gens,
    client,
    current,
    catalogById,
    newProgram,
    approving = false,
    rejecting = false,
    revisionCancelled = false,
    onapprove,
    onreject,
    onreset,
    onsaveplan,
    onrevised,
    oneditsaved,
  }: Props = $props();

  let rejectOpen = $state(false);
  let rejectReason = $state("");
  let editing = $state(false);
  let planSaving = $state(false);
  let planError = $state<string | null>(null);
  let week = $state(1);
  let mode = $state<"sessions" | "compare">("sessions");
  let base = $state<number | null>(null);
  /** Open note editor: draft session index + exercise slot (1-based; null = whole session). */
  let noteAt = $state<{ day: number; slot: number | null } | null>(null);
  let notes = $state<LlmNoteDto[]>([]);

  $effect(() => {
    const id = gen.id;
    let live = true;
    notes = [];
    api
      .llmNotes([id])
      .then((found) => {
        if (live) notes = found;
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  });



  const draft = $derived(gen.draft!);
  /** The draft week on screen (the block plan strip and the week tabs pick it). */
  const shown = $derived(draftWeek(draft, week));
  /** Role order for an AI-made draft; the stored order once the trainer has hand-edited it. */
  const order = $derived({ keepOrder: gen.trainerOrder });
  const chain = $derived(revisionChain(gens, gen.id));
  const version = $derived(chain.length);
  const prev = $derived(chain.length >= 2 ? chain[chain.length - 2] : null);
  const firstName = $derived(client.name.split(" ")[0]);
  const isWeek = $derived(gen.kind === "week");
  const decided = $derived(newProgram !== null || gen.status === "rejected" || gen.status === "approved");
  // Week and fill drafts follow the program's plan: no plan editing here.
  const canEdit = $derived(gen.status === "validated" && !newProgram && !isWeek && gen.kind !== "fill");

  /** Noted slots per session (0 = the session itself), for the row marks. */
  const notedByDay = $derived(
    shown.sessions.map(
      (_, i) =>
        new Set(
          notes.flatMap((n) =>
            n.anchor?.type === "slot" && n.anchor.sessionIndex === i && (n.anchor.week == null || n.anchor.week === shown.week)
              ? [n.anchor.exerciseIndex != null ? n.anchor.exerciseIndex + 1 : 0]
              : []
          )
        )
    )
  );

  function anchorFor(day: number, slot: number | null): NoteAnchorDto {
    const s = shown.sessions[day];
    const ex = slot != null ? s.exercises[slot - 1] : null;
    return {
      type: "slot",
      week: isWeek ? gen.targetWeek : draft.weeks.length > 1 ? shown.week : null,
      session: s.name,
      sessionIndex: day,
      exerciseIndex: slot != null ? slot - 1 : null,
      exerciseId: ex?.exerciseId ?? null,
      exerciseName: ex?.exerciseName ?? null,
    };
  }

  const canApply = $derived(gen.status === "validated" && !newProgram && !!onrevised);
  /** Fill: the weeks Apply rewrites, and the trainer's weeks it keeps. */
  const isFill = $derived(gen.kind === "fill");
  const fillWrites = $derived(isFill ? draft.weeks.filter((w) => !w.locked).map((w) => w.week) : []);
  const fillKeeps = $derived(isFill ? draft.weeks.filter((w) => w.locked).map((w) => w.week) : []);
  /** A block creates a draft program; a week draft replaces that week; a fill rewrites its weeks. */
  const approveLabel = $derived(
    approving
      ? isWeek || isFill
        ? "Applying…"
        : "Creating…"
      : isFill
        ? `Apply: rewrite ${weekRangeLabel(fillWrites)}`
        : isWeek
          ? `Apply v${version} to week ${gen.targetWeek ?? ""}`
          : `Create program from v${version}`
  );

  /** A newer version exists (this one was reopened): only the latest is editable. */
  const superseded = $derived(gens.some((g) => g.parentGenerationId === gen.id && (g.status === "validated" || g.status === "pending")));
  const handEditable = $derived(!!oneditsaved && gen.status === "validated" && !newProgram && !superseded && !editing && !approving && !rejecting);
  const editLock = $derived(
    !oneditsaved || gen.status !== "validated" || newProgram ? null : superseded ? "Only the latest version can be edited" : editing ? "Finish editing the plan to edit sessions" : null
  );
  const editor = new DraftEditor({
    api,
    target: () => (handEditable ? gen : null),
    onsaved: (res) => oneditsaved?.(res),
  });
  $effect(() => {
    if (!handEditable && editor.selecting) editor.setSelecting(false);
  });

  function editableFor(day: number): SessionEditable | undefined {
    // The trainer's own weeks in a fill stay as written.
    if (!handEditable || shown.locked) return undefined;
    const d = draft;
    return {
      selecting: editor.selecting,
      disabled: editor.busy,
      isSelected: (slot) => editor.isSelected({ day, slot }),
      ontoggle: (slot) => editor.toggle({ day, slot }),
      items: (slot) => rowMenuItems(d, { day, slot }, (ops) => editor.run(ops), roleLabels.all, { ...order, week: d.weeks.length > 1 ? shown.week : null }),
    };
  }
  /** The phone approve bar (fixed, ≤700px; 0 when hidden): the edit dock floats above it. */
  let mbarHeight = $state(0);
  /** The phasing editor's own label; a session edit says "Edited by you: …". */
  const planEdit = $derived(gen.manualEdit && gen.revisionMessage === "Block plan edited by you");

  async function applyNote(note: LlmNoteDto) {
    const child = await api.applyNote(note.id);
    if (child.status !== "validated") throw new Error(child.error ?? `Revision ${child.status}`);
    await onrevised?.(child);
  }
  /** Every change since the previous version; plan changes are listed from planDelta (they carry the week). */
  const slotChanges = $derived(prev?.draft ? diffDrafts(prev.draft, draft).filter((c) => c.kind !== "plan") : []);
  /** The same change made in several weeks reads once, with its weeks ("W1, W3"). */
  const sinceRows = $derived(mergeWeekChanges(slotChanges));
  const keptRows = $derived(mergeWeekChanges(gen.discardedChanges ?? []));
  const weeksLabel = (c: { weeks: number[] }) => (c.weeks.length && c.weeks.length < draft.weeks.length ? `W${c.weeks.join(", W")} · ` : "");
  /** Weeks this version changed (a dot on their tab). */
  const changedDraftWeeks = $derived(new Set(slotChanges.map((c) => c.week).filter((w): w is number => w != null)));
  const multiWeek = $derived(draft.weeks.length > 1);
  /** Another week: ticked rows belong to the old one, so leave select mode. */
  function pickWeek(n: number) {
    if (n === week) return;
    if (editor.selecting) editor.setSelecting(false);
    noteAt = null;
    week = n;
  }
  /** The shown week's changes (they mark its rows). */
  const weekChanges = $derived(slotChanges.filter((c) => c.week == null || c.week === shown.week));
  const plan = $derived(draft.phasing ?? null);
  const planDelta = $derived(prev?.draft ? planChanges(prev.draft.phasing ?? null, plan) : []);
  const changedWeeks = $derived(new Set(planDelta.map((c) => c.week).filter((w): w is number => w !== null)));
  const checks = $derived(reviewChecks(shown, client.sessionsPerWeek, catalogById, client));
  /** This client's deload rule: the default plan's deload cut and the load index follow it. */
  const deload = $derived(clientDeload(client));
  const noDeload = $derived(!isWeek && plan !== null && !(plan.weeks ?? []).some((w) => w.directive === "deload"));
  const why = $derived(rationaleByDay(draft.rationale, shown.sessions.length, shown.sessions));

  const history = $derived(
    historyEntries(chain)
      .map((h, i) => {
        const before = i > 0 ? chain[i - 1].draft : null;
        const after = h.generation.draft;
        const n = before && after ? mergeWeekChanges(diffDrafts(before, after)).length : 0;
        return { ...h, changes: n };
      })
      .reverse()
  );

  const baseVersion = $derived(base !== null && base < version ? base : Math.max(1, version - 1));
  const baseGen = $derived(chain[baseVersion - 1] ?? null);
  const compareAll = $derived(baseGen?.draft ? diffDrafts(baseGen.draft, draft) : []);
  const compareChanges = $derived(compareAll.filter((c) => c.kind !== "plan" && (c.week == null || c.week === shown.week)));

  /** Slot marks for the sessions view, keyed per day by the slot in this version. */
  const marksByDay = $derived.by(() => {
    const days: Map<number, SlotMark>[] = shown.sessions.map(() => new Map());
    for (const c of weekChanges) {
      if (c.afterSlot == null) continue;
      days[c.day - 1]?.set(c.afterSlot, { kind: "changed", was: c.kind === "swap" || c.kind === "rx" ? c.from : null });
    }
    return days;
  });

  /** "Session N" / "Cardio N" per draft session — drafts carry no weekdays. */
  const tags = $derived(draftSessionTags(shown.sessions));

  const cards = $derived(
    shown.sessions.map((s) => ({
      name: s.name,
      kind: s.kind ?? "lifting",
      cardio: s.cardio ?? null,
      exercises: shownExerciseOrder(s.exercises.map((e, i) => ({ ...e, slot: i + 1 })), roleLabels.all, order).map((e) => ({
        name: e.exerciseName ?? "",
        role: e.role,
        movementPattern: e.exerciseId ? catalogById.get(e.exerciseId)?.movementPattern ?? null : null,
        sets: e.prescribedSets,
        slot: e.slot,
        group: e.group,
      })),
    }))
  );

  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const changeText = (c: SlotChange) =>
    c.kind === "swap" ? null : c.kind === "rx" ? `${c.exercise}` : c.kind === "added" ? `+ ${c.exercise}` : `− ${c.exercise}`;
  const planLine = (c: PlanChange) => c;

  /** Before/after rows for one day of the compare view. */
  function compareRows(day: number) {
    return compareChanges.filter((c) => c.day === day);
  }

  async function savePlan(phasing: ProgramPhasingDto) {
    planSaving = true;
    planError = null;
    try {
      await onsaveplan(phasing);
      editing = false;
      week = 1;
    } catch (err) {
      planError = (err as Error).message || "Could not save the plan";
    } finally {
      planSaving = false;
    }
  }

  function startEdit() {
    planError = null;
    editing = true;
  }
</script>

{#snippet actions()}
  {#if gen.status === "rejected"}
    <div class="row"><Button onclick={onreset}>Draft again</Button><Button variant="ghost" href={`/clients/${client.id}`}>Back to {firstName}</Button></div>
  {:else if newProgram}
    <div class="row">
      <Button variant="primary" href={`/programs/${newProgram.id}`}>{#snippet icon()}<Icon name="layers" />{/snippet}Open in builder</Button>
      <Button href={`/clients/${client.id}`}>Back to {firstName}</Button>
    </div>
  {:else}
    <div class="row">
      <Button variant="danger" disabled={editing} onclick={() => (rejectOpen = !rejectOpen)}>Reject…</Button>
      <Button variant="primary" disabled={editing || approving} onclick={onapprove}>
        {#snippet icon()}<Icon name="check" />{/snippet}{approveLabel}
      </Button>
    </div>
    {#if editing}
      <span class="paused">Finish editing the plan first.</span>
    {:else}
      {#if isFill}
        <span class="lock"><Icon name="lock" />Rewrites {weekRangeLabel(fillWrites)} of the program. {weekRangeLabel(fillKeeps)} stay{fillKeeps.length === 1 ? "s" : ""} as you wrote {fillKeeps.length === 1 ? "it" : "them"}; a week logged before you apply is skipped.</span>
      {:else}
        <span class="lock"><Icon name="lock" />Creates a draft program. {firstName} sees nothing until you activate it.</span>
      {/if}
    {/if}
  {/if}
{/snippet}

<Crumbs items={[{ href: "/clients", label: "Clients" }, { href: `/clients/${client.id}`, label: client.name }, { label: "Draft review" }]} />
<div class="rv-head">
  <div class="rv-title">
    <h1>
      {isFill ? `${firstName}'s block, filled in` : isWeek ? `${firstName}'s week ${gen.targetWeek ?? ""} draft` : `${firstName}'s next block`}
      <span class="vtag">v{version}</span>
      <StatusPill status={gen.status} />
    </h1>
    <p class="sub">
      <span>{draft.name.replace(/\s*\(rev\. \d+\)$/, "")}</span>
      <span>·</span>
      {#if planEdit}
        <span>plan edited by you · sessions by <span class="mono">{gen.model}</span></span>
      {:else if gen.manualEdit}
        <span>edited by you · drafted by <span class="mono">{gen.model}</span></span>
      {:else}
        <span>drafted by <span class="mono">{gen.model}</span>{gen.effort ? ` (${effortSummary(gen.effort)})` : ""}</span>
      {/if}
      <span>·</span>
      <span>{ago(gen.createdAt)}</span>
      <span>·</span>
      <span>from {current ? `“${current.name}” + 8 weeks of logs` : "cold start"}</span>
      {#if gen.exampleProgramIds.length > 0}<span>· shaped by {plural(gen.exampleProgramIds.length, "example program")}</span>{/if}
    </p>
    <div class="rv-rate">
      <span>How was v{version}?</span>
      <Verdict subjectKind="generation" subjectId={gen.id} noun="draft" clientId={client.id} clientName={firstName} />
    </div>
  </div>
  <div class="rv-actions">{@render actions()}</div>
</div>

{#if revisionCancelled}<Note tone="warn" role="status">Revision cancelled — the previous draft is untouched.</Note>{/if}
{#if newProgram}
  <Note tone="ok" class="flash" role="status">
    {isFill
      ? `${weekRangeLabel(fillWrites)} written into “${newProgram.name}” (v${newProgram.version}). Weeks logged in the meantime were left as they were.`
      : isWeek
      ? `Week ${gen.targetWeek} replaced in “${newProgram.name}” (v${newProgram.version}) — the rest of the block is untouched.`
      : `Approved. “${newProgram.name}” is now a draft program — edit it, then activate when ready.`}
  </Note>
{:else if gen.status === "rejected"}
  <Note tone="bad" class="flash" role="status">Discarded — this draft won't be used.</Note>
{/if}

{#if rejectOpen && !decided}
  <div class="reject-box">
    <label for="rv-reject">Why reject v{version}? <span class="subtle">Optional — future drafts learn from it.</span></label>
    <textarea id="rv-reject" class="textarea" rows="2" maxlength="2000" placeholder="e.g. Too much hinge volume for a beginner" bind:value={rejectReason}></textarea>
    <div class="row">
      <Button variant="danger" disabled={rejecting} onclick={() => onreject(rejectReason.trim())}>{rejecting ? "Rejecting…" : "Reject draft"}</Button>
      <Button variant="ghost" onclick={() => (rejectOpen = false)}>Keep reviewing</Button>
    </div>
  </div>
{/if}

<section class="panel band" aria-label="Decision summary">
  <section>
    {#if prev}
      <h3>Since v{version - 1} <span class="counter">{plural(sinceRows.length + planDelta.length, "change")}</span></h3>
      {#if sinceRows.length + planDelta.length === 0}
        <p class="subtle m0">No changes.</p>
      {:else}
        <ul class="chg">
          {#each sinceRows.slice(0, 5) as c, i (i)}
            <li>
              <span class="sign" aria-hidden="true">{c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~"}</span>
              <span>
                <span class="where">{weeksLabel(c)}{tags[c.day - 1] ?? `Session ${c.day}`} ·</span>
                {#if c.kind === "swap"}<s>{c.from}</s> → {c.to}
                {:else if c.kind === "rx"}{c.exercise} <span class="rx"><s>{c.from}</s> → {c.to}</span>
                {:else if c.kind === "session" || c.kind === "cardio"}{c.kind === "cardio" ? `${c.exercise} cardio` : "Session"} <span class="rx">{#if c.from}<s>{c.from}</s> → {/if}{c.to}</span>
                {:else}{changeText(c)} <span class="rx">{c.to ?? c.from}</span>{/if}
              </span>
            </li>
          {/each}
          {#each planDelta as c, i (i)}
            {@const p = planLine(c)}
            <li><span class="sign" aria-hidden="true">~</span><span><span class="where">{p.where} ·</span> {#if p.from}<s>{p.from}</s>{" → "}{/if}{p.to}</span></li>
          {/each}
        </ul>
        {#if sinceRows.length > 5}<p class="subtle m0 mt6">+ {sinceRows.length - 5} more — see Compare below</p>{/if}
        <p class="subtle m0 mt10">{planEdit ? `Plan only — sessions are identical to v${version - 1}.` : gen.manualEdit ? "Edited by hand — no AI call." : "Read from the drafts, not from the AI's description."}</p>
      {/if}
      {#if keptRows.length}
        <details class="kept mt6">
          <summary class="subtle">The AI also changed {plural(keptRows.length, "thing")} it wasn't asked to. Kept as before.</summary>
          <ul class="chg">
            {#each keptRows as c, i (i)}
              <!-- Reverted change: what stayed is plain, what the AI tried is struck. -->
              <li><span class="sign" aria-hidden="true">~</span><span><span class="where">{c.kind === "plan" ? "Block plan" : `${weeksLabel(c)}${tags[c.day - 1] ?? `Session ${c.day}`}`} ·</span>
                {#if c.kind === "swap"}kept {c.from} <span class="subtle">· AI tried <s>{c.to}</s></span>
                {:else if c.kind === "added"}<span class="subtle">AI tried to add <s>{c.exercise} {c.to}</s></span>
                {:else if c.kind === "removed"}kept {c.exercise} <span class="subtle">· AI tried to remove it</span>
                {:else}{c.exercise}: <span class="rx">kept {c.from ?? "none"}</span> <span class="subtle">· AI tried <s class="rx">{c.to ?? "none"}</s></span>{/if}</span></li>
            {/each}
          </ul>
        </details>
      {/if}
    {:else}
      <h3>First draft</h3>
      <p class="subtle m0">Nothing to compare yet. {current ? `It follows “${current.name}”.` : "No previous program — a cold start."}</p>
    {/if}
  </section>
  <section>
    <h3>Checks</h3>
    <ul class="checks">
      {#each checks as c, i (i)}
        <li>
          <span class={c.tone}>{#if c.tone === "info"}<span class="dot" aria-hidden="true"></span>{:else}<Icon name={c.tone === "ok" ? "check" : "x"} />{/if}</span>
          <span><span class="sr">{c.tone === "ok" ? "OK: " : c.tone === "warn" ? "Check: " : ""}</span>{c.text}</span>
        </li>
      {/each}
      {#if noDeload}<li><span class="warn"><Icon name="x" /></span><span>No deload week in the plan</span></li>{/if}
    </ul>
  </section>
  <section>
    <h3>How this draft evolved</h3>
    <ul class="hist">
      {#each history as h (h.version)}
        <li>
          <span class="v" class:cur={h.version === version}>v{h.version}</span>
          <span>
            {#if h.request}<span class:q={!h.manual}>{h.manual ? h.request : `“${h.request}”`}</span>{:else}<span class="subtle">First draft from generation settings</span>{/if}
            <span class="meta">{h.version === 1 ? (current ? "from the current block's logs" : "cold start · no logs yet") : `${plural(h.changes, "change")}${h.manual ? " · no AI" : ""}`}</span>
          </span>
          <span class="when">{ago(h.generation.createdAt)}</span>
        </li>
      {/each}
    </ul>
  </section>
</section>

{#if !isWeek}
  <section class="panel plan" class:editing aria-label="Block plan">
    <div class="panel-head">
      <h2>Block plan</h2>
      {#if plan}<span class="counter">{plural(plan.weeks?.length ?? plan.plannedWeeks, "week")}</span><span class="subtle">{plan.phase} → next block: {plan.nextPhase || "—"}</span>{/if}
      <span class="act-r">
        {#if editing}
          <span class="pill neutral">Editing</span>
        {:else}
          {#if plan}<span class="subtle">{gen.manualEdit && planDelta.length ? "Edited by you" : "Proposed by AI"}</span>{/if}
          {#if canEdit}<button type="button" class="btn small" onclick={startEdit}>{plan ? "Edit plan" : "Add a plan"}</button>{/if}
        {/if}
      </span>
    </div>
    <div class="panel-body">
      {#if editing}
        <BlockPlanEditor
          phasing={plan ?? defaultPlan(4, deload)}
          {deload}
          nextVersion={version + 1}
          saving={planSaving}
          error={planError}
          onsave={savePlan}
          oncancel={() => (editing = false)}
        />
      {:else if plan}
        <BlockPlanStrip phasing={plan} bind:selected={week} changed={changedWeeks} {deload} />
        <p class="legend">Bars: volume index chained from each week's target (W1 = 100). Load index under each week; {deloadLoadPhrase(deload)}.</p>
      {:else}
        <p class="subtle m0">This draft has no block plan.</p>
      {/if}
    </div>
  </section>
{/if}

{#if multiWeek}
  <div class="draft-weeks">
    <DraftWeekTabs weeks={draft.weeks} value={shown.week} onchange={pickWeek} changed={changedDraftWeeks} />
  </div>
{/if}
<div class="week-head">
  <h2>{multiWeek ? `Week ${shown.week}${shown.rotation ? ` · ${shown.rotation}` : ""}` : "The week"}</h2>
  {#if shown.locked}<span class="pill neutral" title="You wrote this week; Apply leaves it as it is">yours · kept</span>{/if}
  <div class="seg" role="group" aria-label="View">
    <button type="button" aria-pressed={mode === "sessions"} onclick={() => (mode = "sessions")}>Sessions</button>
    <button type="button" aria-pressed={mode === "compare"} disabled={version < 2} onclick={() => (mode = "compare")}>Compare</button>
  </div>
  {#if mode === "compare" && version >= 2}
    <span class="subtle">v{version} against</span>
    <select class="select base" aria-label="Compare against version" value={baseVersion} onchange={(e) => (base = Number(e.currentTarget.value))}>
      {#each chain.slice(0, -1) as g, i (g.id)}
        <option value={i + 1}>v{i + 1}{i === 0 ? " — first draft" : g.revisionMessage ? ` — “${g.revisionMessage.slice(0, 28)}${g.revisionMessage.length > 28 ? "…" : ""}”` : ""}</option>
      {/each}
    </select>
    <strong class="count">{plural(mergeWeekChanges(compareAll).length, "change")}</strong>
  {:else}
    <span class="subtle">{plural(shown.sessions.length, "session")} · {shown.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.prescribedSets.length, 0), 0)} working sets{#if why.general.length && why.days.every((d) => d.length === 0)} · reasoning is in {isWeek ? "Reasoning" : "Block rationale"} below{/if}</span>
  {/if}
  {#if handEditable && (mode === "sessions" || version < 2)}
    <button
      type="button"
      class="btn small select-toggle"
      aria-pressed={editor.selecting}
      title={editor.selecting ? "Leave select mode" : "Tick exercises to move or superset them together"}
      onclick={() => editor.setSelecting(!editor.selecting)}
    >
      <Icon name="list-check" />{editor.selecting ? "Done" : "Select"}
    </button>
  {:else if editLock}
    <span class="subtle edit-lock"><Icon name="lock" />{editLock}</span>
  {/if}
  {#if gen.status === "validated" && !newProgram}
    <a class="ask" href={`/clients/${client.id}/chat`}><Icon name="sparkle" />Ask for exercise changes in Draft chat →</a>
  {/if}
</div>

{#if mode === "sessions" || version < 2}
  {#each cards as s, i (i)}
    <article class="day" class:has-why={why.days[i].length > 0}>
      <div class="day-main">
        <SessionCard
          name={s.name}
          tag={tags[i]}
          kind={s.kind}
          cardio={s.cardio}
          exercises={s.exercises}
          marks={marksByDay[i]}
          noted={notedByDay[i]}
          onnote={editing ? undefined : (slot) => (noteAt = { day: i, slot })}
          editable={s.kind === "cardio" ? undefined : editableFor(i + 1)}
        />
        {#if noteAt?.day === i}
          {#key noteAt.slot}
            <div class="note-slot">
              <NoteEditor
                subjectKind="generation"
                subjectId={gen.id}
                anchor={anchorFor(i, noteAt.slot)}
                clientId={client.id}
                clientName={firstName}
                onapply={canApply ? applyNote : undefined}
                onsaved={(n) => (notes = [...notes, n])}
                onclose={() => (noteAt = null)}
              />
            </div>
          {/key}
        {/if}
      </div>
      {#if why.days[i].length}
        <aside class="why">
          <h4><Icon name="sparkle" />Why this session</h4>
          {#each why.days[i] as b, j (j)}<div class="md">{@html renderMarkdown(b)}</div>{/each}
        </aside>
      {/if}
    </article>
  {/each}
{:else}
  {#each shown.sessions as s, di (di)}
    {@const rows = compareRows(di + 1)}
    <section class="panel cmp-day">
      <div class="panel-head"><span class="track">{tags[di]}</span><h2>{s.name}</h2><span class="counter">{rows.length} changed</span></div>
      {#if rows.length}
        <table class="cmp">
          <thead><tr><th>v{baseVersion}</th><th>v{version}</th></tr></thead>
          <tbody>
            {#each rows as c, i (i)}
              <tr>
                <td class="before">
                  {#if c.kind === "added"}<span class="subtle">— new slot</span>
                  {:else if c.kind === "swap"}<s>{c.from}</s>
                  {:else if c.kind === "session" || c.kind === "cardio"}{c.kind === "cardio" ? "Cardio" : "Session"} <span class="rx">{c.from ?? "—"}</span>
                  {:else if c.kind === "removed"}<s>{c.exercise}</s> <span class="rx">{c.from}</span>
                  {:else}{c.exercise} <span class="rx">{c.from}</span>{/if}
                </td>
                <td class="after">
                  {#if c.kind === "removed"}<span class="subtle">removed</span>
                  {:else if c.kind === "swap"}<strong>{c.to}</strong>
                  {:else if c.kind === "session" || c.kind === "cardio"}{c.kind === "cardio" ? "Cardio" : "Session"} <span class="rx"><mark>{c.to}</mark></span>
                  {:else if c.kind === "added"}<strong>{c.exercise}</strong> <span class="rx">{c.to}</span>
                  {:else}<strong>{c.exercise}</strong> <span class="rx"><mark>{c.to}</mark></span>{/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}
        <p class="none">No changes in this session.</p>
      {/if}
    </section>
  {/each}
{/if}

{#if mode === "sessions" || version < 2}
  <DraftEditDock {editor} {draft} week={draft.weeks.length > 1 ? shown.week : null} labels={roleLabels.all} keepOrder={gen.trainerOrder} variant="page" lift={mbarHeight} />
{/if}

<div class="more">
  <details>
    <summary>{isWeek ? "Reasoning" : "Block rationale"} <span class="subtle">{plural(why.general.length, "note")} · trainer-facing</span></summary>
    <div class="md prose">{@html renderMarkdown(why.general.join("\n\n"))}</div>
  </details>
  <details class="client">
    <summary>What {firstName} will read <span class="subtle">editable after approval</span></summary>
    <div class="md prose">{@html renderMarkdown(draft.clientSummary)}</div>
  </details>
</div>

{#if !decided}<div class="mbar" bind:clientHeight={mbarHeight}>{@render actions()}</div>{/if}

<style>
  .rv-head { display: flex; align-items: flex-start; gap: 16px; margin: 4px 0 16px; flex-wrap: wrap; }
  .rv-title { min-width: 0; }
  .rv-head h1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sub { font-size: 13px; color: var(--muted); margin: 6px 0 0; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .mono { font-family: var(--font-mono); color: var(--ink); }
  .rv-actions { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
  .rv-rate { display: flex; align-items: flex-start; gap: 8px; margin-top: 8px; font-size: 12px; color: var(--muted); }
  .rv-rate > span { line-height: 26px; }
  .lock, .paused { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--muted); }
  .lock :global(svg) { width: 13px; height: 13px; }
  .vtag { font: 600 12px/1 var(--font-mono); padding: 3px 7px; border-radius: 99px; background: var(--good-bg); color: var(--good); border: 1px solid var(--good-line); }
  .m0 { margin: 0; }
  .mt6 { margin-top: 6px; }
  .mt10 { margin-top: 10px; }

  .reject-box { border: 1px solid var(--bad-line); background: var(--bad-bg); border-radius: 6px; padding: 12px; display: grid; gap: 8px; margin-bottom: 16px; }
  .reject-box label { font: 600 13px/1.3 var(--font-ui); }
  .reject-box .subtle { font-weight: 400; }

  .band { display: grid; grid-template-columns: 1.15fr 1fr 1fr; }
  .band > section { padding: 14px 16px; min-width: 0; }
  .band > section + section { border-left: 1px solid var(--line); }
  .band h3 { font: 600 13px/1.2 var(--font-ui); margin-bottom: 10px; display: flex; gap: 8px; align-items: center; }
  .band h3 .counter { font-weight: 400; }
  .chg, .checks, .hist { list-style: none; margin: 0; padding: 0; font-size: 13px; }
  .chg { display: grid; gap: 4px; }
  .kept > summary { cursor: pointer; }
  .kept .chg { margin-top: 6px; color: var(--muted); }
  .chg li { display: grid; grid-template-columns: 14px minmax(0, 1fr); gap: 6px; }
  .sign { font: 700 13px/1.45 var(--font-mono); color: var(--blue); }
  .where { color: var(--muted); }
  s { color: var(--muted); text-decoration-color: var(--line-strong); }
  .rx { font: 500 12px/1.4 var(--font-mono); }
  .checks { display: grid; gap: 7px; }
  .checks li { display: grid; grid-template-columns: 16px minmax(0, 1fr); gap: 8px; align-items: start; }
  .checks :global(svg) { width: 14px; height: 14px; margin-top: 2px; }
  .ok { color: var(--good); }
  .warn { color: var(--warn); }
  .info { display: grid; place-items: center; height: 18px; }
  .dot { width: 5px; height: 5px; border-radius: 99px; background: var(--line-strong); }
  .sr { position: absolute; left: -9999px; }
  .hist li { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--line-soft); align-items: baseline; }
  .hist li:last-child { border-bottom: 0; }
  .v { font: 600 12px/1 var(--font-mono); color: var(--muted); }
  .v.cur { color: var(--good); }
  .when { font-size: 12px; color: var(--muted); white-space: nowrap; }
  .meta { display: block; font-size: 12px; color: var(--muted); margin-top: 2px; }

  .plan { margin-top: 16px; }
  .plan.editing { border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
  .act-r { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .plan .panel-body { padding: 12px 16px; }
  .legend { margin: 8px 2px 0; font-size: 12px; color: var(--muted); }

  .draft-weeks { margin: 24px 0 -12px; border-bottom: 1px solid var(--line); padding-bottom: 8px; }
  .week-head { display: flex; align-items: center; gap: 12px; margin: 24px 0 12px; flex-wrap: wrap; }
  .week-head h2 { font-size: 16px; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .seg button { font: 500 13px/1 var(--font-ui); padding: 6px 12px; background: var(--well); border: 0; color: var(--muted); cursor: pointer; }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button[aria-pressed="true"] { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 var(--tab-on); }
  .seg button:disabled { cursor: default; opacity: 0.6; }
  .base { width: auto; }
  .count { font-size: 13px; }
  .ask { margin-left: auto; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
  .select-toggle, .edit-lock { margin-left: auto; }
  .select-toggle ~ .ask, .edit-lock ~ .ask { margin-left: 8px; }
  .select-toggle :global(svg) { width: 14px; height: 14px; }
  .select-toggle[aria-pressed="true"] { background: var(--hover-ink); color: var(--on-ink); border-color: var(--hover-ink); }
  .edit-lock { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
  .edit-lock :global(svg) { width: 12px; height: 12px; }
  .ask :global(svg) { width: 14px; height: 14px; }

  .day { display: grid; grid-template-columns: minmax(0, 1fr); border: 1px solid var(--line); border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
  /* Wraps on the card's own width, not the viewport: the session keeps at
     least 520px (its wide, column-aligned layout) before the aside drops
     below it. The inset rule draws whichever edge faces the session. */
  .day.has-why { display: flex; flex-wrap: wrap; }
  .day.has-why .day-main { flex: 1 1 520px; }
  .day.has-why .why { flex: 1 0 300px; border-left: 0; box-shadow: -1px -1px 0 var(--line); }
  .day :global(.session-body) { --row-pad-l: 24px; }
  /* the day article is already the card: the session inside drops its own frame */
  .day :global(.session) { border: 0; border-radius: 0; }
  .day-main { min-width: 0; }
  .note-slot { padding: 0 14px 14px 24px; }
  .why { border-left: 1px solid var(--line); background: var(--well); padding: 12px 16px; font-size: 13px; line-height: 1.55; }
  .why h4 { font: 600 12px/1 var(--font-ui); color: var(--muted); margin-bottom: 8px; display: flex; gap: 6px; align-items: center; }
  .why h4 :global(svg) { width: 13px; height: 13px; }
  .md :global(p) { margin: 0 0 8px; }
  .md :global(p:last-child) { margin: 0; }
  .md :global(ul) { margin: 0 0 8px; padding-left: 18px; }

  .cmp-day { margin-bottom: 16px; }
  .track { font: 500 11px/1 var(--font-mono); color: var(--muted); white-space: nowrap; }
  table.cmp { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }
  table.cmp th { font: 600 12px/1.2 var(--font-ui); color: var(--muted); text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); }
  table.cmp td { padding: 8px 12px; border-bottom: 1px solid var(--line-soft); vertical-align: top; }
  table.cmp tr:last-child td { border-bottom: 0; }
  table.cmp .before { color: var(--muted); }
  table.cmp .rx { display: block; margin-top: 2px; color: var(--muted); }
  table.cmp mark { background: var(--pulse-now-bg); color: var(--ink); border-radius: 4px; padding: 0 3px; }
  .none { padding: 10px 14px; margin: 0; color: var(--muted); font-size: 13px; }

  .more { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
  .more details { border: 1px solid var(--line); border-radius: 6px; }
  .more summary { padding: 10px 14px; cursor: pointer; font: 600 13px/1.2 var(--font-ui); display: flex; gap: 8px; align-items: center; }
  .more summary .subtle { font-weight: 400; }
  .prose { padding: 0 16px 12px; font-size: 13px; line-height: 1.6; max-width: 68ch; }
  .client .prose { background: var(--well); margin: 0 12px 12px; padding: 12px 14px; border-radius: 6px; }

  .mbar { display: none; }
  @media (max-width: 1000px) {
    .band { grid-template-columns: 1fr; }
    .band > section + section { border-left: 0; border-top: 1px solid var(--line); }

    .more { grid-template-columns: 1fr; }
  }
  @media (max-width: 700px) {
    .rv-actions { display: none; }
    .mbar { display: block; position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; background: var(--surface); border-top: 1px solid var(--line); padding: 10px 16px 12px; box-shadow: var(--shadow-overlay-up); }
    .mbar .row :global(.btn) { flex: 1; justify-content: center; min-height: 36px; }
    .mbar .lock, .mbar .paused { margin-top: 6px; }
    .ask { margin-left: 0; }
    .more { margin-bottom: 120px; }
  }
</style>
