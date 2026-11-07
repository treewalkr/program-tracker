<script lang="ts">
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { api } from "$lib/api";
  import { CLIENT_MESSAGE_MAX_CHARS } from "@pt/shared";
  import { loggedBlockWeeks } from "$lib/messageWeeks";
  import type { ClientDto, ClientMessageDto, ProgramDto, SessionLogDto } from "$lib/api/types";
  import { fmtDate } from "$lib/format";
  import StatusPill from "$lib/components/StatusPill.svelte";
  import CopyButton from "$lib/components/CopyButton.svelte";
  import Verdict from "$lib/components/Verdict.svelte";
  import DirChip from "$lib/components/DirChip.svelte";
  import Note from "$lib/ui/Note.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import Button from "$lib/ui/Button.svelte";
  import ConfirmButton from "$lib/ui/ConfirmButton.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Panel from "$lib/ui/Panel.svelte";
  import EmptyState from "$lib/ui/EmptyState.svelte";
  import Skeleton from "$lib/ui/Skeleton.svelte";

  const id = $derived(page.params.id ?? "");
  const paramWeek = $derived(new URLSearchParams(page.url.search).get("week"));

  let client = $state<ClientDto | null>(null);
  let current = $state<ProgramDto | null>(null);
  let logs = $state<SessionLogDto[]>([]);
  let messages = $state<ClientMessageDto[]>([]);
  let loading = $state(true);

  let selectedWeek = $state<number | null>(null);
  let draftMsg = $state<ClientMessageDto | null>(null);
  let text = $state("");
  let drafting = $state(false);
  let draftError = $state<string | null>(null);
  let approving = $state(false);
  let actionError = $state<string | null>(null);

  const signalLogs = $derived(
    logs.map((l) => ({
      programId: l.programId,
      date: l.date,
      kind: l.kind,
      cardio: l.cardio ?? null,
      sets: l.sets.map((s) => ({
        exerciseId: s.exerciseId,
        type: s.type,
        weightKg: s.weightKg ?? null,
        reps: s.reps,
        rpe: s.rpe ?? null,
      })),
    }))
  );

  /** Block weeks of the current program that have logged sessions. */
  const loggedWeeks = $derived(current ? loggedBlockWeeks(current, signalLogs) : []);

  const firstName = $derived(client?.name.split(" ")[0] ?? "");

  onMount(async () => {
    try {
      const [detail, logRows, msgs] = await Promise.all([
        api.client(id),
        api.sessionLogs(id),
        api.clientMessages(id),
      ]);
      client = detail.client;
      current = detail.currentProgram;
      logs = logRows;
      messages = msgs;
      const pw = paramWeek ? Number(paramWeek) : NaN;
      selectedWeek = Number.isInteger(pw) && pw >= 1 ? pw : (loggedWeeks.at(-1) ?? null);
    } finally {
      loading = false;
    }
  });

  function pickWeek(week: number) {
    if (week === selectedWeek) return;
    selectedWeek = week;
    draftMsg = null;
    text = "";
    draftError = null;
    actionError = null;
  }

  async function draft() {
    if (!current || selectedWeek == null) return;
    drafting = true;
    draftError = null;
    actionError = null;
    try {
      draftMsg = await api.generateClientMessage({
        clientId: id,
        programId: current.id,
        week: selectedWeek,
      });
      text = draftMsg.draft?.message ?? "";
    } catch (err) {
      draftError = (err as Error).message || "Drafting failed — try again.";
    } finally {
      drafting = false;
    }
  }

  /** Copying the approved text is the trainer actually using it — a positive signal. */
  function copied(messageId: string) {
    void api
      .recordLlmSignal({ subjectKind: "client_message", subjectId: messageId, signal: "client_message_copied" })
      .catch(() => {});
  }

  async function approve() {
    if (!draftMsg) return;
    approving = true;
    actionError = null;
    try {
      draftMsg = await api.approveClientMessage(draftMsg.id, text);
      messages = await api.clientMessages(id);
    } catch (err) {
      actionError = (err as Error).message || "Approve failed — try again.";
    } finally {
      approving = false;
    }
  }

  async function reject() {
    if (!draftMsg) return;
    actionError = null;
    try {
      draftMsg = await api.rejectClientMessage(draftMsg.id);
      messages = await api.clientMessages(id);
    } catch (err) {
      actionError = (err as Error).message || "Reject failed — try again.";
    }
  }

  async function refreshHistory() {
    messages = await api.clientMessages(id);
  }

  const stats = $derived(draftMsg?.stats ?? null);
  const charCount = $derived(`${text.length}/${CLIENT_MESSAGE_MAX_CHARS}`);
</script>

{#if loading}
  <PageHead title="Message client" crumbs={[{ href: `/clients/${id}`, label: "Client" }, { label: "Message" }]} />
  <Skeleton h="18px" w="40%" />
  <div class="mt-16"><Skeleton h="220px" w="100%" /></div>
{:else if !client}
  <EmptyState>Client not found.</EmptyState>
{:else if !current}
  <PageHead
    title={`Message ${firstName}`}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: "Message" }]}
    sub="Turn a logged training week into a short message the client can read on LINE."
  />
  <EmptyState>
    <p>No active program — messages summarize a program week.</p>
    {#snippet actions()}
      <Button href={`/clients/${id}`}>Back to client</Button>
    {/snippet}
  </EmptyState>
{:else if loggedWeeks.length === 0}
  <PageHead
    title={`Message ${firstName}`}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: "Message" }]}
    sub={`“${current.name}” · week summaries from logged sessions`}
  />
  <EmptyState>
    <p>No logged sessions yet — log a week first.</p>
    {#snippet actions()}
      <Button href={`/clients/${id}`}>Back to client</Button>
    {/snippet}
  </EmptyState>
{:else}
  <PageHead
    title={`Message ${firstName}`}
    crumbs={[{ href: `/clients/${id}`, label: client.name }, { label: "Message" }]}
    sub={`“${current.name}” · AI drafts from logged data, you approve, then copy into LINE`}
  />

  <div class="weekbar" role="group" aria-label="Week with logged sessions">
    <span class="weekbar-label">logged weeks</span>
    {#each loggedWeeks as w (w)}
      <button
        type="button"
        class="tchip"
        class:on={selectedWeek === w}
        aria-pressed={selectedWeek === w}
        onclick={() => pickWeek(w)}
      >
        W{w}
      </button>
    {/each}
    <div class="weekbar-actions">
      <Button variant="primary" onclick={draft} disabled={drafting || selectedWeek == null}>
        {#snippet icon()}<Icon name="sparkle" />{/snippet}
        {drafting ? "Drafting…" : draftMsg?.status === "approved" ? "Draft again" : "Draft message"}
      </Button>
    </div>
  </div>

  {#if draftError}
    <Note tone="bad" class="flash" role="alert">{draftError}</Note>
  {/if}
  {#if actionError}
    <Note tone="bad" class="flash" role="alert">{actionError}</Note>
  {/if}

  {#if draftMsg?.status === "validated" && draftMsg.draft}
    <div class="review-cols">
      <div>
        <Panel title="Draft message" count="what {firstName} reads">
          <div class="panel-body">
            <textarea
              class="msg-edit"
              bind:value={text}
              maxlength={CLIENT_MESSAGE_MAX_CHARS}
              rows="10"
              aria-label="Message text — edit before approving"
            ></textarea>
            <div class="edit-foot">
              <span class="char-count">{charCount}</span>
              <span class="edit-hint">edits become the final text on approve</span>
            </div>
            <div class="actions">
              <Button variant="primary" onclick={approve} disabled={approving || !text.trim()}>
                {approving ? "Approving…" : "Approve"}
              </Button>
              <ConfirmButton label="Reject" onconfirm={reject} />
              <span class="rate"><Verdict subjectKind="client_message" subjectId={draftMsg.id} noun="draft message" /></span>
            </div>
          </div>
        </Panel>
      </div>
      <div>
        <Panel title="What the AI saw" count={`week ${draftMsg.week} · computed stats`}>
          <div class="panel-body stats">
            {#if stats}
              <p>
                <strong>{stats.sessionsLogged}/{stats.sessionsPlanned ?? "?"} sessions</strong>
                {stats.adherencePct != null ? ` (${stats.adherencePct}% adherence)` : ""}
              </p>
              <p>
                {stats.overallVolume}kg lifted · {stats.sets} sets
                {stats.avgRpe != null ? ` · avg RPE ${stats.avgRpe}` : ""}
                {stats.overallVolumeDelta != null
                  ? ` · ${stats.overallVolumeDelta >= 0 ? "+" : ""}${stats.overallVolumeDelta}% vs last week`
                  : ""}
              </p>
              {#if stats.prs.length > 0}
                <ul class="pr-list">
                  {#each stats.prs as pr (pr.exerciseId)}
                    <li>
                      {pr.exerciseName} {pr.weightKg}kg × {pr.reps}
                      <span class="subtle">(best {pr.e1rm}kg est. 1RM, was {pr.prevBest}kg)</span>
                    </li>
                  {/each}
                </ul>
              {:else}
                <p class="subtle">No new bests this week.</p>
              {/if}
              {#if stats.nextWeek}
                <p>
                  Next week:
                  {#if stats.nextWeek.directive}<DirChip directive={stats.nextWeek.directive}>{stats.nextWeek.directive}</DirChip>{/if}
                  {#if stats.nextWeek.target}
                    {@const sign = stats.nextWeek.target.deltaPercent >= 0 ? "+" : ""}
                    <span class="subtle">
                      target {sign}{stats.nextWeek.target.deltaPercent}% {stats.nextWeek.target.metric.replace("_", " ")}
                    </span>
                  {/if}
                </p>
              {:else}
                <p class="subtle">Final week of the block — no next week planned.</p>
              {/if}
            {/if}
          </div>
        </Panel>
      </div>
    </div>
  {:else if draftMsg?.status === "approved"}
    <Note tone="ok" class="flash" role="status">Approved — copy it into LINE when you're ready.</Note>
    <div class="clientreads">
      <div class="edit-note">final message · week {draftMsg.week}</div>
      <p class="final-text">{draftMsg.finalText}</p>
      <div class="final-actions">
        <CopyButton text={draftMsg.finalText ?? ""} oncopy={() => copied(draftMsg!.id)} />
        <Button small onclick={draft} disabled={drafting}>{drafting ? "Drafting…" : "Draft another"}</Button>
        <span class="rate"><Verdict subjectKind="client_message" subjectId={draftMsg.id} noun="draft message" /></span>
      </div>
    </div>
  {:else if draftMsg?.status === "rejected"}
    <Note tone="bad" role="status">Discarded — draft again or pick another week.</Note>
  {/if}

  {#if messages.length > 0}
    <div class="mt-16">
      <Panel title="Message history" count={`${messages.length} for ${firstName}`}>
        <div class="panel-body">
          {#each messages as m (m.id)}
            <div class="hist-row">
              <div class="hist-head">
                <StatusPill status={m.status} />
                <span>week {m.week}</span>
                <span class="subtle">{fmtDate(m.createdAt)}</span>
              </div>
              {#if m.status === "approved" && m.finalText}
                <div class="hist-final">
                  <p class="final-text">{m.finalText}</p>
                  <CopyButton text={m.finalText} oncopy={() => copied(m.id)} />
                </div>
              {:else if m.error}
                <p class="subtle hist-err">{m.error}</p>
              {/if}
            </div>
          {/each}
        </div>
      </Panel>
    </div>
  {/if}
{/if}

<style>
  .weekbar {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 16px;
  }
  .weekbar-label {
    font: 500 12px/1 var(--font-ui);
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-right: 2px;
  }
  .weekbar-actions {
    margin-left: auto;
    display: flex;
    gap: 8px;
  }

  .review-cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    align-items: start;
  }

  .msg-edit {
    width: 100%;
    box-sizing: border-box;
    font: 400 14px/1.55 var(--font-body);
    padding: 11px 13px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--canvas);
    color: inherit;
    resize: vertical;
  }
  .msg-edit:focus-visible {
    outline: 2px solid var(--accent, var(--green-btn));
    outline-offset: 1px;
  }
  .edit-foot {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    margin-top: 6px;
    font: 400 12px/1.3 var(--font-ui);
    color: var(--faint);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 8px;
    margin-top: 14px;
  }
  .rate {
    margin-left: auto;
    align-self: center;
  }

  .stats p {
    margin: 0 0 8px;
    font-size: 14px;
    line-height: 1.55;
  }
  .pr-list {
    margin: 0 0 8px;
    padding-left: 18px;
    font-size: 14px;
    line-height: 1.7;
  }

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
  .final-text {
    margin: 0;
    white-space: pre-wrap;
  }
  .final-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    margin-top: 12px;
  }

  .hist-row {
    padding: 10px 0;
    border-bottom: 1px solid var(--line);
  }
  .hist-row:last-child {
    border-bottom: none;
  }
  .hist-head {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }
  .hist-final {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-top: 6px;
  }
  .hist-final .final-text {
    font-size: 13px;
    color: var(--muted);
  }
  .hist-err {
    margin: 4px 0 0;
    font-size: 12px;
    overflow-wrap: anywhere;
  }
  .subtle {
    color: var(--muted);
  }
  .mt-16 {
    margin-top: 16px;
  }
  /* flash notes render inside <Note> — margin must be global (generate-page pattern) */
  :global(.flash) { margin: 0 0 16px; }

  @media (max-width: 900px) {
    .review-cols {
      grid-template-columns: 1fr;
    }
    .hist-final {
      flex-direction: column;
    }
  }
</style>
