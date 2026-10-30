<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { sortExercisesByRole, typicalGenerationSeconds } from "@pt/shared";
  import type { ClientDto, ExerciseDto, GenerationDto, InstructionTemplateDto, ProgramDto, ProviderDto } from "$lib/api/types";
  import { generationPhase, isLivePending, POLL_INTERVAL_MS, revisionChain } from "$lib/generation";
  import { diffSources, draftToDiffSource, programToDiffSource, type DiffRow } from "$lib/draftDiff";
  import { blockPulse, pulseSummary } from "$lib/metrics";
  import { weekOf } from "$lib/signals";
  import SessionCard from "$lib/components/SessionCard.svelte";
  import RevisionThread from "$lib/components/RevisionThread.svelte";
  import DiffTiles from "$lib/components/DiffTiles.svelte";
  import ChangeRow from "$lib/components/ChangeRow.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import GeneratingState from "$lib/ui/GeneratingState.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let catalogById = $state(new Map<string, ExerciseDto>());
  let providers = $state<ProviderDto[]>([]);
  let providerId = $state("zai");
  let model = $state("");
  const provider = $derived(providers.find((p) => p.id === providerId) ?? null);
  let instructions = $state("");
  let direction = $state("");
  let weekMode = $state<number | null>(null);
  let templates = $state<InstructionTemplateDto[]>([]);
  let periodContext = $state<string | null>(null);
  let selected = $state<string[]>([]);
  let tplName = $state("");
  let savingTpl = $state(false);
  let phase = $state<"form" | "generating" | "review" | "failed">("form");
  let failReason = $state<string | null>(null);
  let gen = $state<GenerationDto | null>(null);
  let allGens = $state<GenerationDto[]>([]);
  let revisionNote = $state("");
  let revising = $state(false);
  let reviseError = $state<string | null>(null);
  let newProgram = $state<ProgramDto | null>(null);
  let approving = $state(false);
  let rejecting = $state(false);
  let startedAtIso = $state("");
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function startPolling(genId: string) {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const row = await api.generation(genId);
        gen = row;
        const nextPhase = generationPhase(row);
        if (nextPhase !== "generating") {
          stopPolling();
          if (nextPhase === "failed") {
            failReason = row.error ?? null;
          }
          phase = nextPhase;
        }
      } catch {
        // a failed poll request keeps waiting (next tick)
      }
    }, POLL_INTERVAL_MS);
  }

  onDestroy(() => {
    stopPolling();
  });

  const selectedTemplates = $derived(
    selected.map((id) => templates.find((t) => t.id === id)).filter((t) => t !== undefined)
  );
  /** What the provider actually receives: standing templates first, then the one-off note. */
  const mergedInstructions = $derived(
    [...selectedTemplates.map((t) => t.content), instructions]
      .filter(Boolean)
      .join("\n\n")
  );

  const draftName = (ex: { exerciseId?: string; exerciseName?: string }) =>
    ex.exerciseName ?? "";

  const plannedWeeks = $derived(current?.phasing?.plannedWeeks ?? current?.weeks.length ?? 4);
  const activeTargetWeek = $derived(gen?.kind === "week" ? gen.targetWeek ?? weekMode : null);

  const chain = $derived(revisionChain(allGens, gen?.id ?? ""));

  const diffTitle = $derived(
    chain.length > 1 && chain[chain.length - 2]?.draft
      ? "Changes vs previous draft"
      : "Changes vs current"
  );

  const diff = $derived.by<DiffRow[]>(() => {
    if (!gen?.draft) return [];
    if (chain.length > 1) {
      const parentGen = chain[chain.length - 2];
      if (parentGen?.draft) {
        return diffSources(draftToDiffSource(parentGen.draft), draftToDiffSource(gen.draft));
      }
    }
    if (!current) return [];
    const targetW = gen.kind === "week" ? gen.targetWeek ?? weekMode : weekMode;
    const baseSource = targetW != null ? programToDiffSource(current, targetW) : programToDiffSource(current);
    return diffSources(baseSource, draftToDiffSource(gen.draft));
  });

  const diffCounts = $derived({
    kept: diff.filter((d) => d.change === "kept").length,
    added: diff.filter((d) => d.change === "added").length,
    removed: diff.filter((d) => d.change === "removed").length,
    changed: diff.filter((d) => d.change === "changed").length,
  });

  const genWhen = $derived.by(() => {
    if (!gen) return "";
    const mins = Math.floor((Date.now() - new Date(gen.createdAt).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins} min ago`;
    return new Date(gen.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  });

  async function start() {
    startedAtIso = new Date().toISOString();
    phase = "generating";
    try {
      gen = await api.generate({
        clientId: id,
        basedOnProgramId: current?.id ?? null,
        targetWeek: weekMode ?? undefined,
        direction: weekMode ? undefined : direction.trim() || undefined,
        providerId,
        model: model || undefined,
        instructions: mergedInstructions || undefined,
      });
      allGens = [gen, ...allGens];
      phase = "review";
    } catch (err) {
      try {
        const gens = await api.generations(id);
        const latest = gens[0] ?? null;
        if (isLivePending(latest)) {
          gen = latest;
          phase = "generating";
          startPolling(latest.id);
          return;
        }
        failReason = latest?.error ?? (err as Error).message ?? null;
      } catch {
        failReason = (err as Error).message || null;
      }
      phase = "failed";
    }
  }

  async function revise() {
    if (!gen) return;
    const note = revisionNote.trim();
    if (!note) return;

    startedAtIso = new Date().toISOString();
    phase = "generating";
    revising = true;
    reviseError = null;

    try {
      const child = await api.reviseGeneration(gen.id, note);
      gen = child;
      allGens = [child, ...allGens];
      const nextPhase = generationPhase(child);
      if (nextPhase === "failed") {
        failReason = child.error;
      }
      phase = nextPhase;
      revisionNote = "";
      reviseError = null;
    } catch (err) {
      try {
        const gens = await api.generations(id);
        allGens = gens;
        const pendingChild = gens.find((g) => g.parentGenerationId === gen?.id && isLivePending(g));
        if (pendingChild) {
          gen = pendingChild;
          phase = "generating";
          startPolling(pendingChild.id);
          return;
        }
        const failedChild = gens.find(
          (g) =>
            g.parentGenerationId === gen?.id &&
            (g.status === "failed_validation" || g.status === "failed_provider")
        );
        if (failedChild) {
          gen = failedChild;
          failReason = failedChild.error;
          phase = "failed";
          return;
        }
        phase = "review";
        reviseError = (err as Error).message || "Revision failed";
      } catch {
        phase = "review";
        reviseError = (err as Error).message || "Revision failed";
      }
    } finally {
      revising = false;
    }
  }

  async function approve() {
    if (!gen) return;
    approving = true;
    try {
      newProgram = await api.approveGeneration(gen.id);
      gen = { ...gen, status: "approved" }; // backend flips it; keep the pill in sync
    } finally {
      approving = false;
    }
  }

  async function reject() {
    if (!gen) return;
    rejecting = true;
    try {
      gen = await api.rejectGeneration(gen.id);
    } finally {
      rejecting = false;
    }
  }

  function reset() {
    stopPolling();
    gen = null;
    revisionNote = "";
    reviseError = null;
    newProgram = null;
    failReason = null;
    phase = "form";
  }

  async function saveAsTemplate() {
    if (!instructions.trim() || !tplName.trim()) return;
    savingTpl = true;
    try {
      const tpl = await api.createInstructionTemplate({ name: tplName.trim(), content: instructions.trim() });
      templates = [...templates, tpl];
      tplName = "";
      instructions = "";
      selected = [...selected, tpl.id];
    } finally {
      savingTpl = false;
    }
  }

  function toggleTemplate(id2: string) {
    selected = selected.includes(id2) ? selected.filter((s) => s !== id2) : [...selected, id2];
  }

  onMount(async () => {
    const [detail, exList] = await Promise.all([api.client(id), api.exercises()]);
    catalogById = new Map(exList.map((e) => [e.id, e]));
    client = detail.client;
    current = detail.currentProgram;
    providers = (await api.providers()).filter((p) => p.configured);
    if (providers.length) providerId = providers[0].id;
    templates = await api.instructionTemplates();

    // Phase-signal handoff: ?tpl=<templateId>&note=<prefill>&week=<targetWeek>
    const params = new URLSearchParams(page.url.search);
    const note = params.get("note");
    const tpl = params.get("tpl");
    if (note) instructions = note;
    if (tpl && templates.some((t) => t.id === tpl)) selected = [tpl];

    const weekParam = params.get("week");
    const parsedWeek = weekParam ? Number.parseInt(weekParam, 10) : NaN;
    if (
      current &&
      current.status === "active" &&
      !Number.isNaN(parsedWeek) &&
      parsedWeek >= 2 &&
      parsedWeek <= current.weeks.length
    ) {
      weekMode = parsedWeek;
    } else {
      weekMode = null;
    }

    if (current) {
      const logs = await api.sessionLogs(id);
      const pulse = blockPulse(current, logs);
      const w = weekMode ?? weekOf(current, logs);
      const currentPlan = current.phasing?.weeks?.find((x) => x.week === w) ?? null;
      const directive = currentPlan?.directive ?? null;
      const target = currentPlan?.target ?? null;
      const summary = pulseSummary(pulse);
      const bits = [`week ${w} of ${current.phasing?.plannedWeeks ?? current.weeks.length}`];
      if (directive) bits.push(`directive ${directive}`);
      if (target) {
        const metricLabels: Record<string, string> = {
          overall_volume: "overall volume",
          rep_volume: "rep volume",
          intensity: "intensity",
        };
        const label = metricLabels[target.metric] ?? target.metric.replace("_", " ");
        const sign = target.deltaPercent >= 0 ? "+" : "";
        bits.push(`target ${label} ${sign}${target.deltaPercent}%`);
      }
      if (!weekMode && summary) bits.push(summary);
      periodContext = bits.join(" · ");
    }

    const gens = await api.generations(id);
    allGens = gens;
    const latest = gens[0] ?? null;
    const initialPhase = generationPhase(latest);
    if (initialPhase === "generating" || initialPhase === "review" || initialPhase === "failed") {
      gen = latest;
      phase = initialPhase;
      if (initialPhase === "failed") {
        failReason = latest.error;
      } else if (initialPhase === "generating") {
        startPolling(latest.id);
      }
    }
  });
</script>

<svelte:head><title>Generate program · Program Tracker</title></svelte:head>

{#if client === null}
  <Skeleton h="140px" />
{:else if phase !== "review" || !gen?.draft}
  <PageHead
    title={weekMode ? `Draft week ${weekMode} with AI` : "Draft next block with AI"}
    sub={weekMode
      ? `Re-drafts week ${weekMode} of ${plannedWeeks} from this week's logs — the pre-drafted week ${weekMode} is replaced on approval.`
      : `Reads ${client.name.split(" ")[0]}'s profile, ${current ? `“${current.name}”` : "no program yet"}, and 8 weeks of logged sets.`}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: weekMode ? `Draft week ${weekMode}` : "Generate" }]}
  />

  {#if phase === "form"}
    <Panel class="narrow" title="Generation settings">
      <form
        class="panel-body stack"
        onsubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <Field label="Provider" htmlFor="g-provider">
          <select
            class="select"
            id="g-provider"
            bind:value={providerId}
            onchange={() => (model = "")}
          >
            {#each providers as p (p.id)}
              <option value={p.id}>{p.label} · {p.model}</option>
            {/each}
          </select>
        </Field>
        {#if provider && provider.models.length > 1}
          <Field label="Model" htmlFor="g-model">
            <select class="select" id="g-model" bind:value={model}>
              <option value="">{provider.model} · default</option>
              {#each provider.models as m (m)}
                {#if m !== provider.model}
                  <option value={m}>{m}</option>
                {/if}
              {/each}
            </select>
          </Field>
        {/if}
        <Field label="Based on" htmlFor="g-based">
          <input
            class="input"
            id="g-based"
            disabled
            value={weekMode && current
              ? `${current.name} · week ${weekMode} of ${plannedWeeks}`
              : current
              ? `${current.name} (active, v${current.version})`
              : "Cold start — no previous program"}
          />
        </Field>
        {#if weekMode}
          {#if current?.direction}
            <Field label="Standing direction" hint="block-level steer — applies to this weekly draft">
              <input class="input" disabled value={current.direction} />
            </Field>
          {/if}
        {:else}
          <Field
            label="Standing direction"
            hint="saved with the new block — every weekly generation follows it"
            htmlFor="g-direction"
          >
            <textarea
              class="textarea"
              id="g-direction"
              rows="2"
              placeholder="e.g. Build squat volume; keep upper body at maintenance."
              bind:value={direction}
              maxlength="500"
            ></textarea>
          </Field>
        {/if}
        <div>
          <Field label="Instruction templates" hint="your standing rules, reusable across clients">
          <div class="tpl-list">
            {#each templates as t (t.id)}
              <ToggleChip
                on={selected.includes(t.id)}
                title={t.content}
                onclick={() => toggleTemplate(t.id)}
              >
                {#if selected.includes(t.id)}<Icon name="check" />{/if}
                {t.name}
              </ToggleChip>
            {/each}
            {#if templates.length === 0}<span class="subtle">No templates yet — write a note below and save it as one.</span>{/if}
            <a class="manage" href="/templates">Manage templates →</a>
          </div>
          </Field>
        </div>
        <Field label="This generation" hint="optional one-off note" htmlFor="g-instructions">
          <textarea
            class="textarea"
            id="g-instructions"
            rows="3"
            placeholder="e.g. Add a second weekly squat day, she loved split squats. Keep chin-up volume."
            bind:value={instructions}
            maxlength="2000"
          ></textarea>
        </Field>
        {#if instructions.trim()}
          <div class="save-tpl">
            <input class="input" placeholder="Template name, e.g. ‘Deload policy’" bind:value={tplName} maxlength="80" />
            <Button variant="ghost" small onclick={saveAsTemplate} disabled={savingTpl || !tplName.trim()}>
              {savingTpl ? "Saving…" : "Save note as template"}
            </Button>
          </div>
        {/if}
        {#if periodContext}
          <div>
            <p class="label">Periodization context <span class="subtle">— injected automatically, read-only</span></p>
            <pre class="merged ctx">{periodContext}</pre>
          </div>
        {/if}
        {#if mergedInstructions}
          <div>
            <p class="label">AI receives <span class="subtle">— templates + note, always after profile and history</span></p>
            <pre class="merged">{mergedInstructions}</pre>
          </div>
        {/if}
        {#if client.limitations}
          <Note tone="bad">Limitations always apply, regardless of instructions: “{client.limitations}”</Note>
        {/if}
        <Button variant="primary" type="submit">
          {#snippet icon()}<Icon name="sparkle" />{/snippet}
          Generate draft
        </Button>
        <p class="subtle">Nothing goes live — the draft waits for your review.</p>
      </form>
    </Panel>

  {:else if phase === "generating"}
    <section class="panel narrow">
      <div class="panel-body">
        <GeneratingState
          providerLabel={providers.find((p) => p.id === (gen?.providerId ?? providerId))?.label ?? providerId}
          model={gen?.model || model || provider?.model || ""}
          expectedSeconds={typicalGenerationSeconds(gen?.providerId ?? providerId)}
          startedAt={gen?.createdAt ?? startedAtIso}
        />
      </div>
    </section>

  {:else}
    <section class="panel narrow">
      <div class="panel-body stack">
        <p class="err">Generation failed. {failReason ?? "Provider error or the draft failed validation."}</p>
        {#if gen?.parentGenerationId}
          <Button
            variant="ghost"
            onclick={() => {
              const parent = allGens.find((g) => g.id === gen?.parentGenerationId) ?? null;
              if (parent) {
                gen = parent;
                phase = "review";
              } else {
                phase = "form";
              }
            }}
          >
            Back to previous draft
          </Button>
        {:else}
          <Button variant="ghost" onclick={() => (phase = "form")}>Back to settings</Button>
        {/if}
      </div>
    </section>
  {/if}

{:else if gen?.draft}
  <Crumbs items={[{ href: "/clients", label: "Clients" }, { href: `/clients/${id}`, label: client.name }, { label: "AI draft" }]} />
  <div class="page-head">
    <div>
      <div class="title-row">
        <h1>{gen.kind === "week" ? `Draft — week ${gen.targetWeek ?? weekMode}` : "Draft — next block"}</h1>
        <StatusPill status={gen.status} />
      </div>
      <div class="gen-meta">
        <span><span class="dot" aria-hidden="true"></span>generated {genWhen}</span>
        <span class="mono">{gen.model}</span>
        <span>from {current ? `“${current.name}” · 8-wk history` : "cold start"}</span>
      </div>
    </div>
    <div class="head-actions">
      {#if gen.status === "rejected"}
        <Button onclick={reset}>Draft again</Button>
        <Button variant="ghost" href={`/clients/${id}`}>Back to client</Button>
      {:else if newProgram}
        <Button variant="primary" href={`/programs/${newProgram.id}`}>
          {#snippet icon()}<Icon name="layers" />{/snippet}
          Open in builder
        </Button>
        <Button href={`/clients/${id}`}>Back to client</Button>
      {:else}
        <ConfirmButton label="Reject" confirmLabel="Really reject?" variant="danger" onconfirm={reject} disabled={rejecting} />
        <Button variant="primary" onclick={approve} disabled={approving}>
          {#snippet icon()}<Icon name="check" />{/snippet}
          {approving ? "Approving…" : "Approve as draft program"}
        </Button>
      {/if}
    </div>
  </div>

  {#if newProgram}
    {#if gen.kind === "week"}
      <Note tone="ok" class="flash" role="status"
        >Week {gen.targetWeek ?? weekMode} replaced in “{newProgram.name}” (v{newProgram.version}) — the rest of the block is untouched.</Note
      >
    {:else}
      <Note tone="ok" class="flash" role="status">Approved. “{newProgram.name}” is now a draft program — edit it, then activate when ready.</Note>
    {/if}
  {:else if gen.status === "rejected"}
    <Note tone="bad" role="status">Discarded — this draft won't be used.</Note>
  {/if}

  <div class="review-cols">
    <div>
      <Panel title="Why this block" count="trainer-facing rationale">
        <div class="panel-body rationale">{gen.draft.rationale}</div>
      </Panel>

      {#if chain.length > 1}
        <div class="mt-16">
          <RevisionThread
            entries={chain.slice(1).map((g, i) => ({
              version: i + 2,
              message: g.revisionMessage ?? "",
              createdAt: g.createdAt,
            }))}
          />
        </div>
      {/if}

      <div class="clientreads">
        <div class="edit-note">what {client.name.split(" ")[0]} reads</div>
        {gen.draft.clientSummary}
      </div>
    </div>

    <div>
      {#if diff.length > 0}
        <Panel title={diffTitle} count={`${diff.length} exercises reviewed`}>
          <div class="panel-body">
            <DiffTiles kept={diffCounts.kept} added={diffCounts.added} removed={diffCounts.removed} changed={diffCounts.changed} />
            {#each diff as d (d.exercise)}
              {#if d.change !== "kept"}
                <ChangeRow change={d.change} exercise={d.exercise} detail={d.detail} />
              {/if}
            {/each}
          </div>
        </Panel>
      {/if}

      <div class="mt-16">
        <Panel title={`Draft sessions${activeTargetWeek ? ` · week ${activeTargetWeek}` : ""}`} count={`${gen.draft.sessions.length} days`}>
          {#each gen.draft.sessions as s, si (si)}
            <!-- approve sorts by role, so review shows the order that will be saved -->
            <SessionCard
              name={s.name}
              kind={s.kind}
              cardio={s.cardio}
              exercises={sortExercisesByRole(s.exercises).map((e) => ({
                name: draftName(e),
                role: e.role,
                movementPattern: e.exerciseId ? catalogById.get(e.exerciseId)?.movementPattern ?? null : null,
                sets: e.prescribedSets,
              }))}
            />
          {/each}
        </Panel>
      </div>
    </div>
  </div>

  {#if gen.status === "validated" && !newProgram}
    <div class="mt-16">
      <Panel title="Revise this draft">
        <div class="panel-body stack">
          <Field
            label="Revision note"
            htmlFor="g-revision"
            hint="The AI gets this draft plus your note — everything else stays."
          >
            <textarea
              class="textarea"
              id="g-revision"
              rows="2"
              maxlength="2000"
              placeholder="e.g. Swap day 2 bench for incline DB press; cut one RDL set."
              bind:value={revisionNote}
            ></textarea>
          </Field>
          {#if reviseError}
            <Note tone="bad">{reviseError}</Note>
          {/if}
          <div>
            <Button
              variant="primary"
              onclick={revise}
              disabled={!revisionNote.trim() || revising}
            >
              {revising ? "Revising…" : "Revise draft"}
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  {/if}

  {#if gen.status !== "rejected" && !newProgram}
    <div class="approve-note">
      <Icon name="lock" />
      <span>Approving creates a <strong>draft</strong> — nothing reaches {client.name.split(" ")[0]} until you edit and activate it. The AI never touches anything the client sees.</span>
    </div>
  {/if}
{/if}

<style>
  .tpl-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .manage { font: 500 12px var(--font-ui); color: var(--muted); margin-left: auto; }
  .manage:hover { color: var(--ink); }
  .save-tpl { display: flex; gap: 8px; }
  .save-tpl .input { flex: 1; }

  .merged {
    margin: 0;
    font: 12px/1.6 var(--font-mono);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 10px 12px;
    white-space: pre-wrap;
    color: var(--ink);
  }
  .merged.ctx { color: var(--blue); }

  .narrow { max-width: 560px; }
  .mt-16 { margin-top: 16px; }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  :global(.flash) { margin: 0 0 16px; }

  .title-row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .gen-meta {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    font: 400 13px/1 var(--font-ui);
    color: var(--muted);
    margin-top: 8px;
  }
  .gen-meta span { display: inline-flex; align-items: center; gap: 6px; }
  .gen-meta .dot { width: 7px; height: 7px; border-radius: 99px; background: var(--green-btn); }

  .review-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  .rationale { white-space: pre-wrap; font-size: 14px; line-height: 1.6; }

  .clientreads {
    margin-top: 16px;
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 13px 15px;
    font-size: 14px;
    line-height: 1.55;
  }
  .clientreads .edit-note {
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .approve-note {
    display: flex;
    gap: 11px;
    align-items: flex-start;
    margin-top: 18px;
    padding: 13px 15px;
    border: 1px solid var(--line);
    border-left: 6px solid var(--green-btn);
    border-radius: 6px;
    background: var(--well);
    color: var(--muted);
    font-size: 13px;
    line-height: 1.55;
  }
  .approve-note :global(svg) { width: 15px; height: 15px; stroke: var(--muted); fill: none; stroke-width: 1.6; flex: none; margin-top: 1px; stroke-linecap: round; stroke-linejoin: round; }

  @media (max-width: 900px) {
    .review-cols { grid-template-columns: 1fr; }
  }
</style>
