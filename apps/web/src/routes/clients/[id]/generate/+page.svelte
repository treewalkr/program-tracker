<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { selectExamples, typicalGenerationSeconds } from "@pt/shared";
  import type { ClientDto, ExerciseDto, GenerationDto, InstructionTemplateDto, ProgramDto, ProgramExampleDto, ProgramPhasingDto, ProviderDto } from "$lib/api/types";
  import { generationPhase, isLivePending, POLL_INTERVAL_MS } from "$lib/generation";
  import { blockPulse, pulseSummary } from "$lib/metrics";
  import { weekOf } from "$lib/signals";
  import { effectivePreferences } from "$lib/preferences";
  import DraftReview from "$lib/components/DraftReview.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import ProviderPicker from "$lib/components/ProviderPicker.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";
  import GeneratingState from "$lib/ui/GeneratingState.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let catalogById = $state(new Map<string, ExerciseDto>());
  let providers = $state<ProviderDto[]>([]);
  let providerId = $state("zai");
  let model = $state("");
  let effort = $state("");
  const provider = $derived(providers.find((p) => p.id === providerId) ?? null);
  let instructions = $state("");
  let direction = $state("");
  let weekMode = $state<number | null>(null);
  let templates = $state<InstructionTemplateDto[]>([]);
  let learned = $state<string | null>(null);
  let periodContext = $state<string | null>(null);
  let selected = $state<string[]>([]);
  let tplName = $state("");
  let savingTpl = $state(false);
  let phase = $state<"form" | "generating" | "review" | "failed">("form");
  let failReason = $state<string | null>(null);
  let cancelling = $state(false);
  let cancelledNote = $state<"block" | "revision" | null>(null);
  let gen = $state<GenerationDto | null>(null);
  let allGens = $state<GenerationDto[]>([]);
  let examples = $state<ProgramExampleDto[]>([]);
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
        allGens = allGens.map((g) => (g.id === row.id ? row : g));
        if (row.status === "cancelled") {
          onGenerationCancelled(row);
          return;
        }
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

  function onGenerationCancelled(row: GenerationDto) {
    stopPolling();
    const parent = row.parentGenerationId
      ? allGens.find((g) => g.id === row.parentGenerationId && g.draft) ?? null
      : null;
    if (parent) {
      gen = parent;
      phase = "review";
      cancelledNote = "revision";
    } else {
      gen = row;
      phase = "form";
      cancelledNote = "block";
    }
  }

  async function cancelRunning() {
    if (cancelling) return;
    cancelling = true;
    try {
      let target = gen?.status === "pending" ? gen : null;
      if (!target) {
        const gens = await api.generations(id);
        allGens = gens;
        target = gens.find((g) => isLivePending(g)) ?? null;
      }
      if (!target) {
        return;
      }
      const row = await api.cancelGeneration(target.id);
      if (allGens.some((g) => g.id === row.id)) {
        allGens = allGens.map((g) => (g.id === row.id ? row : g));
      } else {
        allGens = [row, ...allGens];
      }
      onGenerationCancelled(row);
    } catch {
      // swallow error, held POST / poll drives phase
    } finally {
      cancelling = false;
    }
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
  async function start() {
    startedAtIso = new Date().toISOString();
    phase = "generating";
    cancelledNote = null;
    try {
      const row = await api.generate({
        clientId: id,
        basedOnProgramId: current?.id ?? null,
        targetWeek: weekMode ?? undefined,
        direction: weekMode ? undefined : direction.trim() || undefined,
        providerId,
        model: model || undefined,
        effort: effort || undefined,
        instructions: mergedInstructions || undefined,
      });
      allGens = [row, ...allGens.filter((g) => g.id !== row.id)];
      if (row.status === "cancelled") {
        onGenerationCancelled(row);
        return;
      }
      gen = row;
      const nextPhase = generationPhase(row);
      if (nextPhase === "failed") {
        failReason = row.error ?? null;
      }
      phase = nextPhase;
    } catch (err) {
      try {
        const gens = await api.generations(id);
        allGens = gens;
        const latest = gens[0] ?? null;
        if (latest?.status === "cancelled") {
          onGenerationCancelled(latest);
          return;
        }
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

  /** Save an edited block plan as the next version (no AI) and show it. */
  async function savePlan(phasing: ProgramPhasingDto) {
    if (!gen) return;
    const child = await api.savePhasing(gen.id, phasing);
    allGens = [child, ...allGens.filter((g) => g.id !== child.id)];
    gen = child;
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

  async function reject(reason: string) {
    if (!gen) return;
    rejecting = true;
    try {
      gen = await api.rejectGeneration(gen.id, reason || undefined);
    } finally {
      rejecting = false;
    }
  }

  function reset() {
    stopPolling();
    gen = null;
    newProgram = null;
    failReason = null;
    cancelledNote = null;
    phase = "form";
  }

  const matchedExamples = $derived(
    selectExamples(
      examples,
      { goals: client?.goals ?? null, daysPerWeek: client?.daysPerWeek ?? null },
      { excludeProgramId: current?.id ?? null, limit: 2 }
    )
  );

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
    const prefs = await api.preferences();
    learned = effectivePreferences(prefs, id);
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
    examples = await api.examples();
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
        {#if cancelledNote === "block"}
          <Note tone="warn" role="status">Generation cancelled — nothing was drafted.</Note>
        {/if}
        <ProviderPicker {providers} bind:providerId bind:model bind:effort idPrefix="g" />
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
        {#if learned}
          <div>
            <p class="label">Learned preferences <span class="subtle">— distilled from your feedback, auto-injected into every draft</span></p>
            <pre class="merged">{learned}</pre>
          </div>
        {/if}
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
        {#if matchedExamples.length > 0}
          <div>
            <p class="label">Example library <span class="subtle">— injected automatically, matched by goal + days/week</span></p>
            <p class="subtle">{matchedExamples.length} example program{matchedExamples.length === 1 ? "" : "s"} from your library will shape this draft.</p>
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
      <div class="panel-body stack">
        <GeneratingState
          providerLabel={providers.find((p) => p.id === (gen?.providerId ?? providerId))?.label ?? providerId}
          model={gen?.model || model || provider?.model || ""}
          expectedSeconds={typicalGenerationSeconds(gen?.providerId ?? providerId)}
          startedAt={gen?.createdAt ?? startedAtIso}
        />
        <Button variant="ghost" onclick={cancelRunning} disabled={cancelling}>
          {cancelling ? "Cancelling…" : "Cancel generation"}
        </Button>
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
  <DraftReview
    {gen}
    gens={allGens}
    {client}
    {current}
    {catalogById}
    {newProgram}
    {approving}
    {rejecting}
    revisionCancelled={cancelledNote === "revision"}
    onapprove={approve}
    onreject={reject}
    onreset={reset}
    onsaveplan={savePlan}
  />
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
  .stack { display: flex; flex-direction: column; gap: 14px; }
  :global(.flash) { margin: 0 0 16px; }




</style>
