<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import type { ClientDto, GenerationDto, InstructionTemplateDto, ProgramDto, ProviderDto } from "$lib/api/types";
  import { blockPulse, pulseSummary } from "$lib/metrics";
  import { weekOf } from "$lib/signals";
  import SetChips from "$lib/components/SetChips.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import ToggleChip from "$lib/ui/ToggleChip.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import Crumbs from "$lib/ui/Crumbs.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import Field from "$lib/ui/Field.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  const id = $derived(page.params.id ?? "");

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let providers = $state<ProviderDto[]>([]);
  let providerId = $state("zai");
  let model = $state("");
  const provider = $derived(providers.find((p) => p.id === providerId) ?? null);
  let instructions = $state("");
  let templates = $state<InstructionTemplateDto[]>([]);
  let periodContext = $state<string | null>(null);
  let selected = $state<string[]>([]);
  let tplName = $state("");
  let savingTpl = $state(false);
  let phase = $state<"form" | "generating" | "review" | "failed">("form");
  let failReason = $state<string | null>(null);
  let gen = $state<GenerationDto | null>(null);
  let newProgram = $state<ProgramDto | null>(null);
  let approving = $state(false);
  let rejecting = $state(false);

  const generatingSteps = [
    "Reading client profile and limitations",
    "Summarising 8 weeks of logged sets",
    "Comparing against the current program",
    "Drafting the next block",
  ];
  let step = $state(0);

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

  interface DiffRow {
    exercise: string;
    change: "kept" | "added" | "removed" | "changed";
    detail: string;
  }

  const diff = $derived.by<DiffRow[]>(() => {
    if (!current || !gen?.draft) return [];
    const setsOf = (ex: { prescribedSets: { reps: number; amrap: boolean }[] }) =>
      ex.prescribedSets.map((s) => `${s.reps}${s.amrap ? "+" : ""}`).join("/");
    const key = (name: string) => name.toLowerCase();

    const currentEx = new Map<string, { name: string; sets: string; sessions: string[] }>();
    for (const s of current.sessions) {
      for (const e of s.exercises) {
        const name = e.exerciseName ?? e.exerciseId;
        const existing = currentEx.get(key(name));
        if (existing) {
          existing.sessions.push(s.name);
          existing.sets = setsOf(e);
        } else {
          currentEx.set(key(name), { name, sets: setsOf(e), sessions: [s.name] });
        }
      }
    }

    const draftEx = new Map<string, { name: string; sets: string }>();
    for (const s of gen.draft.sessions) {
      for (const e of s.exercises) {
        const n = draftName(e);
        draftEx.set(key(n), { name: n, sets: setsOf(e) });
      }
    }

    const rows: DiffRow[] = [];
    for (const [, { name, sets }] of draftEx) {
      const before = currentEx.get(name);
      if (!before) rows.push({ exercise: name, change: "added", detail: `new — ${sets}` });
      else if (before.sets !== sets)
        rows.push({ exercise: name, change: "changed", detail: `${before.sets} → ${sets}` });
      else rows.push({ exercise: name, change: "kept", detail: sets });
    }
    for (const [name, info] of currentEx) {
      if (!draftEx.has(name)) rows.push({ exercise: name, change: "removed", detail: `was ${info.sets} (${info.sessions.join(", ")})` });
    }
    return rows;
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
    phase = "generating";
    step = 0;
    const ticker = setInterval(() => {
      step = Math.min(step + 1, generatingSteps.length - 1);
    }, 550);
    try {
      gen = await api.generate({
        clientId: id,
        basedOnProgramId: current?.id ?? null,
        providerId,
        model: model || undefined,
        instructions: mergedInstructions || undefined,
      });
      phase = "review";
    } catch (err) {
      failReason = (err as Error).message || null;
      phase = "failed";
    } finally {
      clearInterval(ticker);
    }
  }

  async function approve() {
    if (!gen) return;
    approving = true;
    try {
      newProgram = await api.approveGeneration(gen.id);
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
    gen = null;
    newProgram = null;
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
    const detail = await api.client(id);
    client = detail.client;
    current = detail.currentProgram;
    providers = (await api.providers()).filter((p) => p.configured);
    if (providers.length) providerId = providers[0].id;
    templates = await api.instructionTemplates();
    if (current) {
      const logs = await api.sessionLogs(id);
      const pulse = blockPulse(current, logs);
      const w = weekOf(current, logs);
      const directive = current.phasing?.weeks?.find((x) => x.week === w)?.directive ?? null;
      const summary = pulseSummary(pulse);
      const bits = [`week ${w} of ${current.phasing?.plannedWeeks ?? "?"}`];
      if (directive) bits.push(`directive ${directive}`);
      if (summary) bits.push(summary);
      periodContext = bits.join(" · ");
    }
    // Phase-signal handoff: ?tpl=<templateId>&note=<prefill>
    const params = new URLSearchParams(page.url.search);
    const note = params.get("note");
    const tpl = params.get("tpl");
    if (note) instructions = note;
    if (tpl && templates.some((t) => t.id === tpl)) selected = [tpl];
  });
</script>

<svelte:head><title>Generate program · Program Tracker</title></svelte:head>

{#if client === null}
  <Skeleton h="140px" />
{:else if phase === "form" || phase === "generating" || phase === "failed"}
  <PageHead
    title="Draft next block with AI"
    sub={`Reads ${client.name.split(" ")[0]}'s profile, ${current ? `“${current.name}”` : "no program yet"}, and 8 weeks of logged sets.`}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: "Generate" }]}
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
          <input class="input" id="g-based" disabled value={current ? `${current.name} (active, v${current.version})` : "Cold start — no previous program"} />
        </Field>
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
      <div class="panel-body stack steps">
        {#each generatingSteps as s, i (s)}
          <div class="step" class:done={i < step} class:active={i === step}>
            <span class="dot"></span> {s}
          </div>
        {/each}
      </div>
    </section>

  {:else}
    <section class="panel narrow">
      <div class="panel-body stack">
        <p class="err">Generation failed. {failReason ?? "Provider error or the draft failed validation."}</p>
        <Button variant="ghost" onclick={() => (phase = "form")}>Back to settings</Button>
      </div>
    </section>
  {/if}

{:else if gen?.draft}
  <Crumbs items={[{ href: "/clients", label: "Clients" }, { href: `/clients/${id}`, label: client.name }, { label: "AI draft" }]} />
  <div class="page-head">
    <div>
      <div class="title-row">
        <h1>Draft — next block</h1>
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
        <Button variant="danger" onclick={reject} disabled={rejecting}>
          {rejecting ? "Rejecting…" : "Reject"}
        </Button>
        <Button variant="primary" onclick={approve} disabled={approving}>
          {#snippet icon()}<Icon name="check" />{/snippet}
          {approving ? "Approving…" : "Approve as draft program"}
        </Button>
      {/if}
    </div>
  </div>

  {#if newProgram}
    <Note tone="ok" class="flash">Approved. “{newProgram.name}” is now a draft program — edit it, then activate when ready.</Note>
  {:else if gen.status === "rejected"}
    <Note tone="bad">Discarded — this draft won't be used.</Note>
  {/if}

  <div class="review-cols">
    <div>
      <Panel title="Why this block" count="trainer-facing rationale">
        <div class="panel-body rationale">{gen.draft.rationale}</div>
      </Panel>

      <div class="clientreads">
        <div class="edit-note">what {client.name.split(" ")[0]} reads</div>
        {gen.draft.clientSummary}
      </div>
    </div>

    <div>
      {#if diff.length > 0}
        <Panel title="Changes vs current" count={`${diff.length} exercises reviewed`}>
          <div class="panel-body">
            <div class="diff">
              <div class="diff-cell"><div class="n muted">{diffCounts.kept}</div><div class="l">kept</div></div>
              <div class="diff-cell"><div class="n green">{diffCounts.added}</div><div class="l">added</div></div>
              <div class="diff-cell"><div class="n red">{diffCounts.removed}</div><div class="l">removed</div></div>
              <div class="diff-cell"><div class="n blue">{diffCounts.changed}</div><div class="l">changed</div></div>
            </div>
            {#each diff as d (d.exercise)}
              {#if d.change !== "kept"}
                <div class="chg {d.change === 'added' ? 'add' : d.change === 'removed' ? 'rm' : 'ch'}">
                  <span class="pm" aria-hidden="true">{d.change === "added" ? "+" : d.change === "removed" ? "−" : "~"}</span>
                  <span class="nm">{d.exercise}</span>
                  <span class="detail">{d.detail}</span>
                </div>
              {/if}
            {/each}
          </div>
        </Panel>
      {/if}

      <div class="mt-16">
        <Panel title="Draft sessions" count={`${gen.draft.sessions.length} days`}>
          {#each gen.draft.sessions as s, si (si)}
            <div class="session">
              <div class="session-head"><h3>{s.name}</h3></div>
              <div class="session-body">
                {#each s.exercises as e, ei (ei)}
                  <div class="exrow">
                    <div class="ex">{draftName(e) || "Unmapped exercise"}</div>
                    <SetChips sets={e.prescribedSets} />
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        </Panel>
      </div>
    </div>
  </div>

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

  .steps { padding: 22px 18px; }
  .step { display: flex; align-items: center; gap: 10px; color: var(--faint); padding: 5px 0; font-size: 14px; }
  .step .dot { width: 8px; height: 8px; border-radius: 99px; background: var(--line-strong); }
  .step.active { color: var(--ink); font-weight: 600; }
  .step.active .dot { background: var(--ink); }
  .step.done { color: var(--good); }
  .step.done .dot { background: var(--good); }

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

  .diff { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px; }
  .diff-cell { border: 1px solid var(--line); border-radius: 6px; padding: 10px 12px; background: var(--surface); }
  .diff-cell .n { font: 600 20px/1 var(--font-mono); }
  .diff-cell .n.muted { color: var(--muted); }
  .diff-cell .n.green { color: var(--good); }
  .diff-cell .n.red { color: var(--bad); }
  .diff-cell .n.blue { color: var(--blue); }
  .diff-cell .l { font: 400 12px/1.3 var(--font-ui); color: var(--muted); margin-top: 5px; }

  .chg {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 8px 2px;
    border-bottom: 1px solid var(--line-soft);
    font-size: 13.5px;
  }
  .chg:last-child { border-bottom: none; }
  .chg .pm { font: 700 13px/1 var(--font-mono); width: 14px; flex: none; }
  .chg.add .pm { color: var(--good); }
  .chg.rm .pm { color: var(--bad); }
  .chg.ch .pm { color: var(--blue); }
  .chg.add .nm { color: var(--good); }
  .chg.rm .nm { color: var(--bad); }
  .chg .detail { color: var(--muted); font: 400 12px/1.4 var(--font-mono); margin-left: auto; white-space: nowrap; }

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
