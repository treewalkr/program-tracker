<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { api } from "$lib/api";
  import type { ClientDto, GenerationDto, InstructionTemplateDto, ProgramDto, ProviderDto } from "$lib/api/types";
  import { blockPulse, pulseSummary } from "$lib/metrics";
  import { weekOf } from "$lib/signals";
  import SetChips from "$lib/components/SetChips.svelte";
  import StatusPill from "$lib/components/StatusPill.svelte";

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
  <div class="skeleton" style="height:140px"></div>
{:else}
  <div class="page-head">
    <div>
      <p class="crumb"><a href={`/clients/${id}`}>{client.name}</a> / Generate</p>
      <h1>✦ Draft next block with AI</h1>
      <p class="sub">
        Reads {client.name.split(" ")[0]}'s profile, {current ? `"${current.name}"` : "no program yet"}, and 8 weeks of logged sets.
      </p>
    </div>
  </div>

  {#if phase === "form"}
    <section class="panel narrow">
      <div class="panel-head"><h2>Generation settings</h2></div>
      <form
        class="panel-body stack"
        onsubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <div>
          <label class="label" for="g-provider">Provider</label>
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
        </div>
        {#if provider && provider.models.length > 1}
          <div>
            <label class="label" for="g-model">Model</label>
            <select class="select" id="g-model" bind:value={model}>
              <option value="">{provider.model} · default</option>
              {#each provider.models as m (m)}
                {#if m !== provider.model}
                  <option value={m}>{m}</option>
                {/if}
              {/each}
            </select>
          </div>
        {/if}
        <div>
          <label class="label" for="g-based">
            Based on
          </label>
          <input class="input" id="g-based" disabled value={current ? `${current.name} (active, v${current.version})` : "Cold start — no previous program"} />
        </div>
        <div>
          <span class="label">Instruction templates <span class="subtle">— your standing rules, reusable across clients</span></span>
          <div class="tpl-list">
            {#each templates as t (t.id)}
              <button
                type="button"
                class="tpl"
                class:active={selected.includes(t.id)}
                title={t.content}
                onclick={() => toggleTemplate(t.id)}
              >
                {#if selected.includes(t.id)}✓{/if}
                {t.name}
              </button>
            {/each}
            {#if templates.length === 0}<span class="subtle">No templates yet — write a note below and save it as one.</span>{/if}
            <a class="manage" href="/templates">Manage templates →</a>
          </div>
        </div>
        <div>
          <label class="label" for="g-instructions">
            This generation <span class="subtle">— optional one-off note</span>
          </label>
          <textarea
            class="textarea"
            id="g-instructions"
            rows="3"
            placeholder="e.g. Add a second weekly squat day, she loved split squats. Keep chin-up volume."
            bind:value={instructions}
            maxlength="2000"
          ></textarea>
        </div>
        {#if instructions.trim()}
          <div class="save-tpl">
            <input class="input" placeholder="Template name, e.g. ‘Deload policy’" bind:value={tplName} maxlength="80" />
            <button type="button" class="btn ghost small" onclick={saveAsTemplate} disabled={savingTpl || !tplName.trim()}>
              {savingTpl ? "Saving…" : "Save note as template"}
            </button>
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
          <p class="lim-note">
            Limitations always apply, regardless of instructions: “{client.limitations}”
          </p>
        {/if}
        <button class="btn" type="submit">✦ Generate draft</button>
        <p class="subtle">Nothing goes live — the draft waits for your review.</p>
      </form>
    </section>

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

  {:else if phase === "failed"}
    <section class="panel narrow">
      <div class="panel-body">
        <p class="err">Generation failed. Provider error or the draft failed validation.</p>
        <button class="btn ghost" onclick={() => (phase = "form")}>Back to settings</button>
      </div>
    </section>

  {:else if gen?.draft}
    <div class="review-cols">
      <section class="panel">
        <div class="panel-head">
          <h2>✦ {gen.draft.name}</h2>
          <StatusPill status={gen.status} />
        </div>
        <div class="panel-body stack">
          <div>
            <p class="label">Why this draft — for you</p>
            <p class="rationale">{gen.draft.rationale}</p>
          </div>
          <hr class="divider" />
          <div>
            <p class="label">What the client reads</p>
            <p>{gen.draft.clientSummary}</p>
          </div>
          <hr class="divider" />
          <div class="actions-row">
            {#if gen.status === "rejected"}
              <p class="discarded">Discarded — this draft won't be used.</p>
              <button class="btn" onclick={reset}>Draft again</button>
              <a class="btn ghost" href={`/clients/${id}`}>Back to client</a>
            {:else}
              <button class="btn" onclick={approve} disabled={approving || !!newProgram}>
                {approving ? "Approving…" : newProgram ? "Approved ✓" : "Approve as draft program"}
              </button>
              <button class="btn danger" onclick={reject} disabled={!!newProgram || rejecting}>
                {rejecting ? "Rejecting…" : "Reject"}
              </button>
            {/if}
          </div>
          {#if newProgram}
            <p class="ok">
              Approved. “{newProgram.name}” is now a draft program — edit it, then activate when ready.
            </p>
            <div class="actions-row">
              <a class="btn" href={`/programs/${newProgram.id}`}>Open in builder</a>
              <a class="btn ghost" href={`/clients/${id}`}>Back to client</a>
            </div>
          {/if}
        </div>
      </section>

      <div class="side-col">
        {#if diff.length > 0}
          <section class="panel">
            <div class="panel-head"><h2>Changes vs current</h2></div>
            <table class="sheet">
              <tbody>
                {#each diff as d (d.exercise)}
                  <tr>
                    <td><strong>{d.exercise}</strong></td>
                    <td><span class="pill {d.change === 'added' ? 'good' : d.change === 'removed' ? 'bad' : d.change === 'changed' ? 'warn' : 'neutral'}">{d.change}</span></td>
                    <td class="num">{d.detail}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/if}

        <section class="panel" style="margin-top:18px">
          <div class="panel-head"><h2>Draft sessions</h2></div>
          <div class="panel-body sessions">
            {#each gen.draft.sessions as s, si (si)}
              <div class="session">
                <h3>{s.name}</h3>
                {#each s.exercises as e, ei (ei)}
                  <div class="exrow">
                    <span class="exname">{draftName(e)}</span>
                    <SetChips sets={e.prescribedSets} />
                  </div>
                {/each}
              </div>
            {/each}
          </div>
        </section>
      </div>
    </div>
  {/if}
{/if}

<style>
  .crumb { margin: 0 0 4px; font-size: 13px; color: var(--faint); }
  .crumb a:hover { text-decoration: underline; }

  .tpl-list { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
  .tpl {
    font: 600 12.5px var(--font-ui);
    color: var(--muted);
    background: var(--surface);
    border: 1px solid var(--line);
    border-radius: 99px;
    padding: 3px 11px;
    cursor: pointer;
  }
  .tpl:hover { border-color: var(--line-strong); }
  .tpl.active { background: var(--ink); color: #fff; border-color: var(--ink); }
  .manage { font: 600 12.5px var(--font-ui); color: var(--muted); margin-left: auto; }
  .manage:hover { color: var(--ink); }
  .save-tpl { display: flex; gap: 8px; }
  .save-tpl .input { flex: 1; }
  .btn.small { padding: 4px 10px; font-size: 13px; }
  .merged {
    margin: 0;
    font: 12.5px/1.55 var(--font-mono);
    background: var(--paper, #fff);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 10px 12px;
    white-space: pre-wrap;
    color: var(--muted);
  }
  .merged.ctx { color: #55558c; border-color: #dedee8; }

  .narrow { max-width: 560px; }
  .stack { display: flex; flex-direction: column; gap: 14px; }
  .lim-note {
    margin: 0;
    font-size: 13px;
    color: var(--bad);
    background: var(--bad-bg);
    border-radius: var(--radius);
    padding: 8px 12px;
  }

  .steps { padding: 22px 18px; }
  .step { display: flex; align-items: center; gap: 10px; color: var(--faint); padding: 5px 0; }
  .step .dot { width: 9px; height: 9px; border-radius: 99px; background: var(--line-strong); }
  .step.active { color: var(--ink); font-weight: 600; }
  .step.active .dot { background: var(--ink); }
  .step.done { color: var(--good); }
  .step.done .dot { background: var(--good); }

  .review-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
  .side-col { display: flex; flex-direction: column; }

  .rationale { white-space: pre-wrap; }
  .actions-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  .ok { color: var(--good); font-weight: 600; }
  .err { color: var(--bad); font-weight: 600; }
  .discarded { color: var(--bad); font-weight: 600; margin: 0; }

  .sessions { display: flex; flex-direction: column; }
  .session { padding: 10px 0; border-bottom: 1px solid var(--line); }
  .session:last-child { border-bottom: none; }
  .exrow { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 4px 0; flex-wrap: wrap; }
  .exname { font-weight: 600; }

  td.num { font-size: 12.5px; color: var(--muted); }

  @media (max-width: 900px) {
    .review-cols { grid-template-columns: 1fr; }
  }
</style>
