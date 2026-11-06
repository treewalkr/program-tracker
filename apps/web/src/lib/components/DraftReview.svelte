<script lang="ts">
  import { diffDraftSlots, sortExercisesByRole, type SlotChange } from "@pt/shared";
  import type { ClientDto, ExerciseDto, GenerationDto, ProgramDto, ProgramPhasingDto } from "$lib/api/types";
  import { revisionChain } from "$lib/generation";
  import { renderMarkdown } from "$lib/chatRefine";
  import {
    ago,
    defaultPlan,
    draftSessionTags,
    historyEntries,
    planChanges,
    rationaleByDay,
    reviewChecks,
    type PlanChange,
  } from "$lib/draftReview";
  import SessionCard, { type SlotMark } from "./SessionCard.svelte";
  import BlockPlanStrip from "./BlockPlanStrip.svelte";
  import BlockPlanEditor from "./BlockPlanEditor.svelte";
  import StatusPill from "./StatusPill.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";

  /**
   * Review an AI draft and decide. Top: what changed since the previous
   * version (read from the drafts), automatic checks, how the draft evolved,
   * and Approve with its reassurance. Then the block plan (editable by hand —
   * saving creates the next version), then the week: each session beside its own
   * reasoning, or before/after against any earlier version.
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
  }: Props = $props();

  let rejectOpen = $state(false);
  let rejectReason = $state("");
  let editing = $state(false);
  let planSaving = $state(false);
  let planError = $state<string | null>(null);
  let week = $state(1);
  let mode = $state<"sessions" | "compare">("sessions");
  let base = $state<number | null>(null);

  const draft = $derived(gen.draft!);
  const chain = $derived(revisionChain(gens, gen.id));
  const version = $derived(chain.length);
  const prev = $derived(chain.length >= 2 ? chain[chain.length - 2] : null);
  const firstName = $derived(client.name.split(" ")[0]);
  const isWeek = $derived(gen.kind === "week");
  const decided = $derived(newProgram !== null || gen.status === "rejected" || gen.status === "approved");
  const canEdit = $derived(gen.status === "validated" && !newProgram && !isWeek);

  const slotChanges = $derived(prev?.draft ? diffDraftSlots(prev.draft, draft) : []);
  const plan = $derived(draft.phasing ?? null);
  const planDelta = $derived(prev?.draft ? planChanges(prev.draft.phasing ?? null, plan) : []);
  const changedWeeks = $derived(new Set(planDelta.map((c) => c.week).filter((w): w is number => w !== null)));
  const checks = $derived(reviewChecks(draft, client.sessionsPerWeek, catalogById));
  const noDeload = $derived(!isWeek && plan !== null && !(plan.weeks ?? []).some((w) => w.directive === "deload"));
  const why = $derived(rationaleByDay(draft.rationale, draft.sessions.length, draft.sessions.map((s) => s.kind)));

  const history = $derived(
    historyEntries(chain)
      .map((h, i) => {
        const before = i > 0 ? chain[i - 1].draft : null;
        const after = h.generation.draft;
        const n = before && after ? diffDraftSlots(before, after).length + planChanges(before.phasing ?? null, after.phasing ?? null).length : 0;
        return { ...h, changes: n };
      })
      .reverse()
  );

  const baseVersion = $derived(base !== null && base < version ? base : Math.max(1, version - 1));
  const baseGen = $derived(chain[baseVersion - 1] ?? null);
  const compareChanges = $derived(baseGen?.draft ? diffDraftSlots(baseGen.draft, draft) : []);

  /** Slot marks for the sessions view, keyed per day by the slot in this version. */
  const marksByDay = $derived.by(() => {
    const days: Map<number, SlotMark>[] = draft.sessions.map(() => new Map());
    for (const c of slotChanges) {
      if (c.afterSlot == null) continue;
      days[c.day - 1]?.set(c.afterSlot, { kind: "changed", was: c.kind === "swap" || c.kind === "rx" ? c.from : null });
    }
    return days;
  });

  /** "Session N" / "Cardio N" per draft session — drafts carry no weekdays. */
  const tags = $derived(draftSessionTags(draft.sessions));

  const cards = $derived(
    draft.sessions.map((s) => ({
      name: s.name,
      kind: s.kind ?? "lifting",
      cardio: s.cardio ?? null,
      exercises: sortExercisesByRole(s.exercises.map((e, i) => ({ ...e, slot: i + 1 }))).map((e) => ({
        name: e.exerciseName ?? "",
        role: e.role,
        movementPattern: e.exerciseId ? catalogById.get(e.exerciseId)?.movementPattern ?? null : null,
        sets: e.prescribedSets,
        slot: e.slot,
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
        {#snippet icon()}<Icon name="check" />{/snippet}{approving ? "Approving…" : `Approve v${version} as draft program`}
      </Button>
    </div>
    {#if editing}
      <span class="paused">Finish editing the plan to approve.</span>
    {:else}
      <span class="lock"><Icon name="lock" />Creates a draft program. {firstName} sees nothing until you activate it.</span>
    {/if}
  {/if}
{/snippet}

<Crumbs items={[{ href: "/clients", label: "Clients" }, { href: `/clients/${client.id}`, label: client.name }, { label: "Draft review" }]} />
<div class="rv-head">
  <div class="rv-title">
    <h1>
      {isWeek ? `${firstName}'s week ${gen.targetWeek ?? ""} draft` : `${firstName}'s next block`}
      <span class="vtag">v{version}</span>
      <StatusPill status={gen.status} />
    </h1>
    <p class="sub">
      <span>{draft.name.replace(/\s*\(rev\. \d+\)$/, "")}</span>
      <span>·</span>
      {#if gen.manualEdit}
        <span>plan edited by you · sessions by <span class="mono">{gen.model}</span></span>
      {:else}
        <span>drafted by <span class="mono">{gen.model}</span>{gen.effort ? ` (${gen.effort} effort)` : ""}</span>
      {/if}
      <span>·</span>
      <span>{ago(gen.createdAt)}</span>
      <span>·</span>
      <span>from {current ? `“${current.name}” + 8 weeks of logs` : "cold start"}</span>
      {#if gen.exampleProgramIds.length > 0}<span>· shaped by {plural(gen.exampleProgramIds.length, "example program")}</span>{/if}
    </p>
  </div>
  <div class="rv-actions">{@render actions()}</div>
</div>

{#if revisionCancelled}<Note tone="warn" role="status">Revision cancelled — the previous draft is untouched.</Note>{/if}
{#if newProgram}
  <Note tone="ok" class="flash" role="status">
    {isWeek
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
      <h3>Since v{version - 1} <span class="counter">{plural(slotChanges.length + planDelta.length, "change")}</span></h3>
      {#if slotChanges.length + planDelta.length === 0}
        <p class="subtle m0">No changes.</p>
      {:else}
        <ul class="chg">
          {#each slotChanges.slice(0, 5) as c, i (i)}
            <li>
              <span class="sign" aria-hidden="true">{c.kind === "added" ? "+" : c.kind === "removed" ? "−" : "~"}</span>
              <span>
                <span class="where">{tags[c.day - 1] ?? `Session ${c.day}`} ·</span>
                {#if c.kind === "swap"}<s>{c.from}</s> → {c.to}
                {:else if c.kind === "rx"}{c.exercise} <span class="rx"><s>{c.from}</s> → {c.to}</span>
                {:else}{changeText(c)} <span class="rx">{c.to ?? c.from}</span>{/if}
              </span>
            </li>
          {/each}
          {#each planDelta as c, i (i)}
            {@const p = planLine(c)}
            <li><span class="sign" aria-hidden="true">~</span><span><span class="where">{p.where} ·</span> {#if p.from}<s>{p.from}</s> → {/if}{p.to}</span></li>
          {/each}
        </ul>
        {#if slotChanges.length > 5}<p class="subtle m0 mt6">+ {slotChanges.length - 5} more — see Compare below</p>{/if}
        <p class="subtle m0 mt10">{gen.manualEdit ? `Plan only — sessions are identical to v${version - 1}.` : "Read from the drafts, not from the AI's description."}</p>
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
          phasing={plan ?? defaultPlan(4)}
          nextVersion={version + 1}
          saving={planSaving}
          error={planError}
          onsave={savePlan}
          oncancel={() => (editing = false)}
        />
      {:else if plan}
        <BlockPlanStrip phasing={plan} bind:selected={week} changed={changedWeeks} />
        <p class="legend">Bars: volume index chained from each week's target (W1 = 100). Load index under each week.</p>
      {:else}
        <p class="subtle m0">This draft has no block plan.</p>
      {/if}
    </div>
  </section>
{/if}

<div class="week-head">
  <h2>The week</h2>
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
    <strong class="count">{plural(compareChanges.length, "change")}</strong>
  {:else}
    <span class="subtle">{plural(draft.sessions.length, "session")} · {draft.sessions.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e.prescribedSets.length, 0), 0)} working sets</span>
  {/if}
  {#if gen.status === "validated" && !newProgram}
    <a class="ask" href={`/clients/${client.id}/chat`}><Icon name="sparkle" />Ask for exercise changes in Draft chat →</a>
  {/if}
</div>

{#if mode === "sessions" || version < 2}
  {#each cards as s, i (i)}
    <article class="day">
      <SessionCard name={s.name} tag={tags[i]} kind={s.kind} cardio={s.cardio} exercises={s.exercises} marks={marksByDay[i]} />
      <aside class="why">
        <h4><Icon name="sparkle" />Why this session</h4>
        {#if why.days[i].length}
          {#each why.days[i] as b, j (j)}<div class="md">{@html renderMarkdown(b)}</div>{/each}
        {:else}
          <p class="subtle">No session-specific reasoning in this draft.</p>
        {/if}
      </aside>
    </article>
  {/each}
{:else}
  {#each draft.sessions as s, di (di)}
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
                  {:else if c.kind === "removed"}<s>{c.exercise}</s> <span class="rx">{c.from}</span>
                  {:else}{c.exercise} <span class="rx">{c.from}</span>{/if}
                </td>
                <td class="after">
                  {#if c.kind === "removed"}<span class="subtle">removed</span>
                  {:else if c.kind === "swap"}<strong>{c.to}</strong>
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

{#if !decided}<div class="mbar">{@render actions()}</div>{/if}

<style>
  .rv-head { display: flex; align-items: flex-start; gap: 16px; margin: 4px 0 16px; flex-wrap: wrap; }
  .rv-title { min-width: 0; }
  .rv-head h1 { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .sub { font-size: 13px; color: var(--muted); margin: 6px 0 0; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .mono { font-family: var(--font-mono); color: var(--ink); }
  .rv-actions { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
  .row { display: flex; gap: 8px; flex-wrap: wrap; }
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
  .plan.editing { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(9, 105, 218, 0.15); }
  .act-r { margin-left: auto; display: flex; gap: 8px; align-items: center; }
  .plan .panel-body { padding: 12px 16px; }
  .legend { margin: 8px 2px 0; font-size: 12px; color: var(--muted); }

  .week-head { display: flex; align-items: center; gap: 12px; margin: 24px 0 12px; flex-wrap: wrap; }
  .week-head h2 { font-size: 16px; }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
  .seg button { font: 500 13px/1 var(--font-ui); padding: 6px 12px; background: var(--well); border: 0; color: var(--muted); cursor: pointer; }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button[aria-pressed="true"] { background: var(--surface); color: var(--ink); font-weight: 600; box-shadow: inset 0 -2px 0 #fd8c73; }
  .seg button:disabled { cursor: default; opacity: 0.6; }
  .base { width: auto; }
  .count { font-size: 13px; }
  .ask { margin-left: auto; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
  .ask :global(svg) { width: 14px; height: 14px; }

  .day { display: grid; grid-template-columns: minmax(0, 1fr) 300px; border: 1px solid var(--line); border-radius: 6px; margin-bottom: 16px; overflow: hidden; }
  .day :global(.session-body) { padding-left: 24px; }
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
    .day { grid-template-columns: 1fr; }
    .why { border-left: 0; border-top: 1px solid var(--line); }
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
