<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { DEFAULT_PROVIDER_ID, INSTRUCTION_PRESETS, MAX_AI_BLOCK_WEEKS, MIN_BLOCK_WEEKS, fillLockedWeeks, loggedWeeks, mentionsAlternating, selectExamples, weekRangeLabel, type SignalProgram, type WeeksChoice } from "@pt/shared";
  import type { ClientDto, DraftEditResultDto, ExerciseDto, GenerationDto, InstructionTemplateDto, ProgramDto, ProgramExampleDto, ProgramPhasingDto, ProviderDto, SessionLogDto } from "$lib/api/types";
  import { generationPhase, isLivePending, POLL_INTERVAL_MS } from "$lib/generation";
  import { blockPulse, pulseSummary } from "$lib/metrics";
  import { weekOf } from "$lib/signals";
  import { effectivePreferences } from "$lib/preferences";
  import {
    composeRequest,
    defaultBlockWeeks,
    defaultWeeksChoice,
    estimatedWaitSeconds,
    LONG_WAIT_SECONDS,
    waitLabel,
    generateSubtitle,
    generateTitle,
    instructionsPreview,
    ledgerRows,
    pendingProgram,
    recentLogCount,
    starterMode,
    STARTERS,
    summaryLine,
  } from "$lib/generateForm";
  import DraftReview from "$lib/components/DraftReview.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Segmented from "$lib/ui/Segmented.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import ModelSettings from "$lib/components/ModelSettings.svelte";
  import InputLedger from "$lib/components/InputLedger.svelte";
  import SkeletonHead from "$lib/ui/SkeletonHead.svelte";
  import SkeletonPanel from "$lib/ui/SkeletonPanel.svelte";
  import ClientLoadError from "$lib/components/ClientLoadError.svelte";
  import GeneratingState from "$lib/ui/GeneratingState.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  /** First load failed before the client arrived (e.g. 404): show that, not an endless skeleton. */
  let loadError = $state<unknown>(null);
  const onLoadError = (e: unknown) => {
    if (client !== null) throw e;
    loadError = e;
  };
  let current = $state<ProgramDto | null>(null);
  let catalogById = $state(new Map<string, ExerciseDto>());
  let providers = $state<ProviderDto[]>([]);
  let providerId = $state<string>(DEFAULT_PROVIDER_ID);
  let model = $state("");
  let effort = $state("");
  const provider = $derived(providers.find((p) => p.id === providerId) ?? null);
  let instructions = $state("");
  let keep = $state(false);
  let peek = $state(false);
  let programs = $state<ProgramDto[]>([]);
  let logs = $state<SessionLogDto[]>([]);
  let pending = $state<ProgramDto | null>(null);
  let activated = $state<ProgramDto | null>(null);
  let activating = $state(false);
  let activateError = $state<string | null>(null);
  let textareaEl = $state<HTMLTextAreaElement | null>(null);
  let weekMode = $state<number | null>(null);
  /** Block drafts: how many weeks, and same every week or A/B (the setting decides, not the note). */
  let blockWeeks = $state(4);
  let weeksChoice = $state<WeeksChoice>("same");
  const blockWeeksValid = $derived(Number.isInteger(blockWeeks) && blockWeeks >= MIN_BLOCK_WEEKS && blockWeeks <= MAX_AI_BLOCK_WEEKS);
  /** The note asks for A/B weeks while the setting says same every week: offer the switch. */
  /** Fill with AI (?fill=<programId>): the program whose remaining weeks the AI writes. */
  let fillTarget = $state<ProgramDto | null>(null);
  /** Weeks the fill keeps (the trainer's and logged ones) and the weeks it writes. */
  const fillKept = $derived(fillTarget ? fillLockedWeeks(fillTarget.weeks, loggedWeeks(fillTarget as unknown as SignalProgram, logs)) : []);
  const fillWrites = $derived(fillTarget ? fillTarget.weeks.map((w) => w.week).filter((w) => !fillKept.includes(w)) : []);
  const fillTooLong = $derived(fillTarget !== null && fillTarget.weeks.length > MAX_AI_BLOCK_WEEKS);
  const abHint = $derived(!weekMode && !fillTarget && weeksChoice === "same" && mentionsAlternating(instructions));
  const waitSeconds = $derived(estimatedWaitSeconds(providerId, weekMode ? 1 : fillTarget ? fillWrites.length : blockWeeks));
  const fasterProvider = $derived(providers.find((p) => p.id === "deepseek" && p.id !== providerId) ?? null);
  /** Built-in rules first (read-only, ids `builtin:<key>`), then the trainer's own. */
  const BUILTIN_TEMPLATES: InstructionTemplateDto[] = INSTRUCTION_PRESETS.map((p) => ({
    id: `builtin:${p.key}`,
    name: p.name,
    content: p.content,
    updatedAt: "",
  }));
  let own = $state<InstructionTemplateDto[]>([]);
  const templates = $derived([...BUILTIN_TEMPLATES, ...own]);
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
  /** The generate body: templates first, then the note — or the note as the block direction when "Keep" is ticked. */
  const request = $derived(composeRequest({ note: instructions, keep: keep && !fillTarget, weekMode, templates: selectedTemplates }));
  const recentLogs = $derived(recentLogCount(logs));

  const draftName = (ex: { exerciseId?: string; exerciseName?: string }) =>
    ex.exerciseName ?? "";

  const plannedWeeks = $derived(current?.phasing?.plannedWeeks ?? current?.weeks.length ?? 4);
  async function start() {
    activated = null;
    activateError = null;
    startedAtIso = new Date().toISOString();
    phase = "generating";
    cancelledNote = null;
    try {
      const row = fillTarget
        ? await api.fillProgram({
            clientId: id,
            programId: fillTarget.id,
            providerId,
            model: model || undefined,
            effort: effort || undefined,
            instructions: request.instructions || undefined,
          })
        : await api.generate({
        clientId: id,
        basedOnProgramId: current?.id ?? null,
        targetWeek: weekMode ?? undefined,
        plannedWeeks: weekMode ? undefined : blockWeeks,
        alternate: weekMode ? undefined : weeksChoice === "alternate",
        direction: weekMode ? undefined : request.direction || undefined,
        providerId,
        model: model || undefined,
        effort: effort || undefined,
        instructions: request.instructions || undefined,
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

  /** A hand edit saved the next version: it becomes the one under review. */
  function showEdit({ generation }: DraftEditResultDto) {
    allGens = [generation, ...allGens.filter((g) => g.id !== generation.id)];
    gen = generation;
  }

  /** A note applied as a revision: the new version becomes the one under review. */
  function showRevision(child: GenerationDto) {
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
      {
        goals: client?.goals ?? null,
        daysPerWeek: client?.sessionsPerWeek ?? null,
        level: client?.experience ?? null,
      },
      { excludeProgramId: current?.id ?? null, limit: 2 }
    )
  );

  const preview = $derived(
    instructionsPreview({
      direction: weekMode ? (current?.direction ?? "") : request.direction,
      learned,
      instructions: request.instructions,
    })
  );
  const rows = $derived(
    client
      ? ledgerRows({
          clientId: id,
          client,
          current,
          pending,
          weekMode,
          plannedWeeks,
          recentLogs,
          periodContext,
          templates: selectedTemplates,
          learned,
          matchedExamples: matchedExamples.map((e) => e.program.name),
        })
      : []
  );
  const summary = $derived(
    client ? summaryLine({ client, current, pending, recentLogs, rulesOn: selectedTemplates.length }) : []
  );

  /** Logs for every client (the ledger counts them); the block-plan line only when a program is active. */
  async function loadProgramContext() {
    logs = await api.sessionLogs(id);
    if (!current) {
      periodContext = null;
      return;
    }
    const pulse = blockPulse(current, logs);
    const w = weekMode ?? weekOf(current, logs);
    const currentPlan = current.phasing?.weeks?.find((x) => x.week === w) ?? null;
    const directive = currentPlan?.directive ?? null;
    const target = currentPlan?.target ?? null;
    const pulseLine = pulseSummary(pulse);
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
    if (!weekMode && pulseLine) bits.push(pulseLine);
    periodContext = bits.join(" · ");
  }

  /** Make the approved-but-inactive program live; the form then builds on it. */
  async function activate() {
    if (!pending || activating) return;
    activating = true;
    activateError = null;
    try {
      const p = await api.setProgramStatus(pending.id, "active");
      current = p;
      activated = p;
      pending = null;
      weekMode = null;
      cancelledNote = null;
      programs = programs.map((x) => (x.id === p.id ? p : x));
      await loadProgramContext();
    } catch (err) {
      activateError = (err as Error).message;
    } finally {
      activating = false;
    }
  }

  async function saveAsTemplate() {
    if (!instructions.trim() || !tplName.trim()) return;
    savingTpl = true;
    try {
      const tpl = await api.createInstructionTemplate({ name: tplName.trim(), content: instructions.trim() });
      own = [...own, tpl];
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

  async function firstLoad() {
    const [detail, exList] = await Promise.all([api.client(id), api.exercises()]);
    const prefs = await api.preferences();
    learned = effectivePreferences(prefs, id);
    catalogById = new Map(exList.map((e) => [e.id, e]));
    client = detail.client;
    current = detail.currentProgram;
    programs = detail.programs;
    providers = (await api.providers()).filter((p) => p.configured);
    if (providers.length) providerId = providers[0].id;
    own = await api.instructionTemplates();

    // Phase-signal handoff: ?tpl=<templateId>&note=<prefill>&week=<targetWeek>
    const params = new URLSearchParams(page.url.search);
    const note = params.get("note");
    const tpl = params.get("tpl");
    if (note) instructions = note;
    if (tpl && templates.some((t) => t.id === tpl)) selected = [tpl];

    // Fill with AI handoff from the builder or the program page: ?fill=<programId>
    const fillParam = params.get("fill");
    if (fillParam) fillTarget = programs.find((p) => p.id === fillParam) ?? (await api.program(fillParam).catch(() => null));

    const weekParam = params.get("week");
    const parsedWeek = weekParam ? Number.parseInt(weekParam, 10) : NaN;
    if (
      !fillTarget &&
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

    await loadProgramContext();
    blockWeeks = defaultBlockWeeks(current);
    weeksChoice = defaultWeeksChoice(current, await api.weeksChoice().catch(() => "same" as const));

    const gens = await api.generations(id);
    examples = await api.examples();
    allGens = gens;
    pending = pendingProgram(gens, programs);
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
  }

  onMount(() => {
    firstLoad().catch(onLoadError);
  });
</script>

<svelte:head><title>Generate program · Program Tracker</title></svelte:head>

{#if loadError}
  <ClientLoadError error={loadError} />
{:else if client === null}
  <SkeletonHead label="Loading client…" />
  <div class="skel-stack form">
    <SkeletonPanel height={140} />
    <SkeletonPanel title="What the AI reads" rows={3} trail={false} />
  </div>
{:else if phase !== "review" || !gen?.draft}
  <PageHead
    title={fillTarget
      ? `Fill “${fillTarget.name}” with AI`
      : phase === "form"
      ? generateTitle(current, weekMode)
      : weekMode ? `Draft week ${weekMode} with AI` : "Draft next block with AI"}
    sub={fillTarget
      ? fillWrites.length
        ? `Writes ${weekRangeLabel(fillWrites)} in full from your ${weekRangeLabel(fillKept)}, following the block plan. ${weekRangeLabel(fillKept)} stay${fillKept.length === 1 ? "s" : ""} exactly as ${fillKept.length === 1 ? "it is" : "they are"}.`
        : "Every week is yours or logged — nothing left to fill."
      : phase === "form"
      ? generateSubtitle({ firstName: client.name.split(" ")[0], current, weekMode, plannedWeeks, recentLogs })
      : weekMode
      ? `Re-drafts week ${weekMode} of ${plannedWeeks} from this week's logs — the pre-drafted week ${weekMode} is replaced on approval.`
      : `Reads ${client.name.split(" ")[0]}'s profile, ${current ? `“${current.name}”` : "no program yet"}, and 8 weeks of logged sets.`}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: fillTarget ? "Fill with AI" : weekMode ? `Draft week ${weekMode}` : "Generate" }]}
  />

  {#if phase === "form"}
    {@const firstName = client.name.split(" ")[0]}
    {#if activated}
      {@const p = activated}
      <div class="gf-banner done" role="status">
        <span class="lamp green" aria-hidden="true"></span>
        <div class="gf-banner-text"><strong>v{p.version} is live.</strong><span>{firstName} can see it now. New drafts build on it.</span></div>
      </div>
    {:else if pending}
      {@const p = pending}
      <div class="gf-banner" role="status">
        <span class="lamp amber" aria-hidden="true"></span>
        <div class="gf-banner-text">
          <strong>v{p.version} is approved but not active.</strong>
          <span>“{p.name}” — {firstName} can't see it yet, and new drafts can't build on it until you activate it.</span>
        </div>
        <div class="gf-banner-act">
          <Button small href="/programs/{p.id}">Open program</Button>
          <Button small type="button" onclick={activate} disabled={activating}>
            {activating ? "Activating…" : `Activate v${p.version}`}
          </Button>
        </div>
      </div>
      {#if activateError}<Note tone="bad" role="status">{activateError}</Note>{/if}
    {:else if cancelledNote === "block"}
      <div class="gf-banner warn" role="status">
        <span class="lamp gray" aria-hidden="true"></span>
        <div class="gf-banner-text"><strong>Generation cancelled.</strong><span>Nothing was drafted — your brief is kept below.</span></div>
      </div>
    {/if}

    <div class="gf-grid">
      <div class="col">
        <details class="gf-ctx">
          <summary>
            <span class="t">AI reads</span>
            {#each summary as b (b.text)}
              <span class="pt"><span class="lamp {b.lamp}" aria-hidden="true"></span>{b.text}</span>
            {/each}
            <span class="more">Details</span>
          </summary>
          <div class="body">
            <InputLedger {rows} />
            <p class="label">Your instructions as the AI gets them</p>
            <pre class="merged">{preview}</pre>
          </div>
        </details>

        <div class="starters">
          {#each STARTERS[starterMode(current, weekMode)] as s (s)}
            <button
              type="button"
              class="starter"
              onclick={() => {
                instructions = s;
                textareaEl?.focus();
              }}>{s}</button
            >
          {/each}
        </div>

        <form
          class="box"
          onsubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <label class="sr" for="g-instructions">What should this {weekMode ? "week" : "block"} do?</label>
          <textarea
            id="g-instructions"
            bind:this={textareaEl}
            bind:value={instructions}
            maxlength="2000"
            rows="4"
            placeholder="What should this {weekMode ? 'week' : 'block'} do? Optional — leave blank to draft from the inputs alone."
          ></textarea>
          {#if weekMode && current?.direction}
            <div class="standing"><strong>Block direction</strong> · {current.direction}</div>
          {:else if !weekMode && !fillTarget}
            <label class="keep" class:on={keep}>
              <input type="checkbox" bind:checked={keep} /> Keep as the block's direction — every weekly draft follows it
            </label>
          {/if}
          {#if fillTarget && fillTooLong}
            <p class="box-help bad">AI fills blocks of up to {MAX_AI_BLOCK_WEEKS} weeks; this one has {fillTarget.weeks.length}. Fill the rest by hand.</p>
          {/if}
          {#if !weekMode && !fillTarget}
            <div class="block-shape">
              <label class="len">
                <span>Block length</span>
                <input
                  class="input num"
                  type="number"
                  inputmode="numeric"
                  min={MIN_BLOCK_WEEKS}
                  max={MAX_AI_BLOCK_WEEKS}
                  bind:value={blockWeeks}
                  aria-invalid={!blockWeeksValid}
                  aria-describedby="g-len-help"
                />
                <span class="subtle">weeks</span>
              </label>
              <Segmented
                label="Weeks"
                lead="Weeks"
                value={weeksChoice}
                onchange={(v) => (weeksChoice = v)}
                items={[
                  { value: "same", label: "Same every week" },
                  { value: "alternate", label: "Alternate A/B", title: "Odd weeks run routine A, even weeks routine B. The AI writes both and progresses each." },
                ]}
              />
            </div>
            {#if !blockWeeksValid}
              <p class="box-help bad" id="g-len-help">AI drafts are {MIN_BLOCK_WEEKS}–{MAX_AI_BLOCK_WEEKS} weeks. Longer blocks: build them by hand.</p>
            {/if}
            {#if abHint}
              <div class="box-note">
                <Note tone="warn">
                  Your note mentions A/B weeks, but Weeks is set to Same every week.
                  <button type="button" class="linkish" onclick={() => (weeksChoice = "alternate")}>Turn on Alternate A/B?</button>
                </Note>
              </div>
            {/if}
          {/if}
          {#if request.directionTooLong}
            <div class="box-note">
              <Note tone="bad">A block direction is limited to 500 characters — shorten it or untick “Keep”.</Note>
            </div>
          {/if}
          <div class="rules">
            <span class="lbl">Rules</span>
            {#each templates as t (t.id)}
              <ToggleChip on={selected.includes(t.id)} title={t.content} onclick={() => toggleTemplate(t.id)}>
                {#if selected.includes(t.id)}<Icon name="check" />{/if}
                {t.name}
              </ToggleChip>
            {/each}
            <Button variant="ghost" small type="button" onclick={() => (peek = !peek)}>
              {peek ? "Hide rules" : "Read rules"}
            </Button>
            {#if own.length === 0}
              <span class="subtle">Write a note above and save it as your own rule.</span>
            {/if}
            <a class="manage" href="/templates">Manage templates →</a>
          </div>
          <div class="row">
            <ModelSettings {providers} bind:providerId bind:model bind:effort hint="Applies to this draft." />
            <span class="spacer"></span>
            {#if !weekMode}
              <span class="wait" title="One week's typical time × {fillTarget ? fillWrites.length : blockWeeks} weeks">{waitLabel(waitSeconds)}</span>
            {/if}
            <Button
              variant="primary"
              type="submit"
              disabled={request.directionTooLong || !providerId || (fillTarget ? fillTooLong || fillWrites.length === 0 : !weekMode && !blockWeeksValid)}
            >
              {#snippet icon()}<Icon name="sparkle" />{/snippet}
              {fillTarget ? `Fill ${weekRangeLabel(fillWrites)}` : weekMode ? `Draft week ${weekMode}` : "Generate draft"}
            </Button>
          </div>
        </form>
        {#if !weekMode && waitSeconds > LONG_WAIT_SECONDS && fasterProvider}
          <p class="wait-hint">
            {fillTarget ? fillWrites.length : blockWeeks} weeks on this model take {waitLabel(waitSeconds)}.
            <button type="button" class="linkish" onclick={() => (providerId = fasterProvider.id)}>Try {fasterProvider.label}</button> — usually under a minute.
          </p>
        {/if}
        <p class="safe">Nothing goes live — the draft waits for your review.</p>

        {#if peek}
          <div class="tpl-peek">
            {#each selectedTemplates as t (t.id)}
              <div><strong>{t.name}</strong><p>{t.content}</p></div>
            {:else}
              <p class="subtle">No rules on.</p>
            {/each}
          </div>
        {/if}

        {#if instructions.trim()}
          <div class="save-tpl">
            <input class="input" placeholder="Template name, e.g. ‘Deload policy’" bind:value={tplName} maxlength="80" />
            <Button variant="ghost" small type="button" onclick={saveAsTemplate} disabled={savingTpl || !tplName.trim()}>
              {savingTpl ? "Saving…" : "Save note as template"}
            </Button>
          </div>
        {/if}
        {#if client.limitations}
          <Note tone="bad">Limitations always apply, regardless of instructions: “{client.limitations}”</Note>
        {/if}
      </div>

      <aside class="gf-aside">
        <Panel title="What the AI reads">
          <div class="aside-body"><InputLedger {rows} compact /></div>
        </Panel>
        <section class="panel">
          <details class="recv">
            <summary>Your instructions as the AI gets them</summary>
            <pre class="merged">{preview}</pre>
          </details>
        </section>
      </aside>
    </div>

  {:else if phase === "generating"}
    <section class="panel narrow">
      <div class="panel-body stack">
        <GeneratingState
          providerLabel={providers.find((p) => p.id === (gen?.providerId ?? providerId))?.label ?? providerId}
          model={gen?.model || model || provider?.model || ""}
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
    onrevised={showRevision}
    oneditsaved={showEdit}
  />
{/if}


<style>
  .manage { font: 500 12px var(--font-ui); color: var(--muted); margin-left: auto; }
  .manage:hover { color: var(--ink); }
  .save-tpl { display: flex; gap: 8px; margin-top: 14px; }
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

  .narrow { max-width: var(--measure-form); }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  :global(.flash) { margin: 0 0 16px; }

  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .lamp { display: inline-block; width: 8px; height: 8px; border-radius: 99px; flex: none; }

  /* banner: approved-but-inactive / live / cancelled */
  .gf-banner {
    display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
    border: 1px solid var(--warn-line); background: var(--warn-bg);
    border-radius: 6px; padding: 12px 14px; margin-bottom: 20px;
  }
  .gf-banner.warn { background: var(--well); border-color: var(--line); }
  .gf-banner.done { background: var(--good-bg); border-color: var(--good-line); }
  .gf-banner-text { flex: 1; min-width: 240px; display: flex; flex-direction: column; gap: 2px; }
  .gf-banner-text span { color: var(--muted); font-size: 13px; }
  .gf-banner-act { display: flex; gap: 8px; }

  /* layout: composer + sticky "What the AI reads" column */
  .gf-grid { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: start; }
  .col > :global(.note) { margin-top: 14px; }
  .gf-aside { position: sticky; top: 20px; display: flex; flex-direction: column; gap: 16px; }
  .aside-body { padding: 6px 14px 10px; }
  .recv summary { cursor: pointer; font-size: 13px; color: var(--blue); padding: 10px 14px; }
  .recv pre { margin: 0 14px 12px; max-height: 260px; overflow: auto; }

  /* narrow: the column folds into a one-line summary above the box */
  .gf-ctx { display: none; border: 1px solid var(--line); border-radius: 6px; margin-bottom: 16px; }
  .gf-ctx > summary { list-style: none; cursor: pointer; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px 14px; font-size: 13px; }
  .gf-ctx > summary::-webkit-details-marker { display: none; }
  .gf-ctx .t { font-weight: 600; margin-right: 4px; }
  .gf-ctx .pt { display: inline-flex; gap: 6px; align-items: center; color: var(--muted); }
  .gf-ctx .more { margin-left: auto; color: var(--blue); }
  .gf-ctx .more::after { content: " ▾"; }
  .gf-ctx[open] .more::after { content: " ▴"; }
  .gf-ctx .body { padding: 2px 14px 12px; border-top: 1px solid var(--line-soft); display: grid; gap: 8px; }
  .gf-ctx .label { margin: 6px 0 0; }
  @media (max-width: 959px) {
    .gf-grid { grid-template-columns: 1fr; }
    .gf-aside { display: none; }
    .gf-ctx { display: block; }
  }

  /* composer */
  .starters { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 10px; }
  .starter {
    font: 400 13px/1.3 var(--font-ui); border: 1px solid var(--line); background: var(--surface);
    border-radius: 99px; padding: 6px 12px; cursor: pointer; color: var(--ink); text-align: left;
  }
  .starter:hover { border-color: var(--line-strong); background: var(--well); }

  .box { border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
  .box:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px var(--focus-ring); }
  .box textarea {
    display: block; width: 100%; border: 0; resize: vertical; min-height: 96px; padding: 12px 14px 4px;
    font: 15px/1.5 var(--font-ui); color: var(--ink); background: transparent; outline: none;
  }
  .box textarea::placeholder { color: var(--muted); }
  .block-shape { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 18px; padding: 6px 14px 10px; }
  .len { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .len > span:first-child { font-weight: 600; color: var(--ink); }
  .num { width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
  .box-help { margin: -4px 14px 10px; font-size: 12px; }
  .box-help.bad { color: var(--bad); }
  .wait { font: 500 12px/1 var(--font-mono); color: var(--muted); }
  .wait-hint { margin: 8px 2px 0; font-size: 13px; color: var(--muted); }
  .linkish { border: 0; background: none; padding: 0; font: inherit; color: var(--blue); text-decoration: underline; cursor: pointer; }
  .keep { display: flex; align-items: center; gap: 8px; padding: 4px 14px 10px; font-size: 13px; color: var(--muted); }
  .keep input { margin: 0; }
  .keep.on { color: var(--ink); }
  .standing { margin: 0 14px 10px; padding: 8px 10px; border-left: 3px solid var(--blue); background: var(--well); font-size: 13px; }
  .box-note { padding: 0 14px 10px; }
  .rules { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; padding: 10px 14px; border-top: 1px solid var(--line-soft); }
  .rules .lbl { font-size: 12px; color: var(--muted); margin-right: 2px; }
  .row { display: flex; align-items: center; gap: 8px; padding: 8px 10px 10px 8px; border-top: 1px solid var(--line-soft); flex-wrap: wrap; }
  .spacer { flex: 1; }
  .safe { color: var(--muted); font-size: 13px; margin: 10px 2px 0; }

  .tpl-peek { margin-top: 12px; display: grid; gap: 8px; }
  .tpl-peek div { font-size: 13px; border: 1px solid var(--line-soft); border-radius: 6px; padding: 8px 10px; }
  .tpl-peek strong { display: block; }
  .tpl-peek p { margin: 2px 0 0; color: var(--muted); white-space: pre-line; }
</style>
