<script lang="ts">
  import {
    applyDraftEdit,
    draftEditNote,
    draftEditRevisionMessage,
    type AiProgramDraft,
    type DraftEditOp,
  } from "@pt/shared";
  import type { AiDraftDto, ChatMessageDto, DraftEditResultDto, GenerationDto } from "$lib/api/types";
  import { draftPreviewModel, versionView } from "$lib/chatRefine";
  import { revisionChain } from "$lib/generation";
  import { DraftEditor } from "$lib/draftEditor.svelte";
  import DraftPreview from "../DraftPreview.svelte";

  /**
   * Story harness: the chat draft pane with hand edits on, backed by a local
   * fake of the edit route that replays the same shared ops. Edits stack up
   * as versions; the edit notes the AI would read list underneath.
   */
  interface Props {
    /** Start in select mode with these rows ticked ("day:slot"). */
    selected?: string[];
    /** Show a build running (editing locked). */
    building?: boolean;
  }

  let { selected = [], building = false }: Props = $props();

  const set = (n: number, reps: number, rpe: number) => ({ setNumber: n, type: "working" as const, reps, amrap: false, targetRpe: rpe, restSeconds: 90 });
  const sets = (k: number, reps: number, rpe = 8) => Array.from({ length: k }, (_, i) => set(i + 1, reps, rpe));
  const ex = (name: string, role: string, k: number, reps: number, group?: string) => ({
    exerciseName: name,
    role: role as "primary",
    prescribedSets: sets(k, reps),
    ...(group ? { group } : {}),
  });

  const draft: AiDraftDto = {
    name: "Block 3 — strength",
    rationale: "",
    clientSummary: "",
    sessions: [
      {
        name: "Lower A — Back Squat",
        kind: "lifting",
        exercises: [
          ex("Box Jump", "power", 3, 3),
          ex("Barbell Back Squat", "primary", 5, 5),
          ex("Barbell Hack Squat", "strength", 3, 8),
          ex("Romanian Deadlift", "strength", 3, 8),
          ex("Seated Leg Curl", "accessory", 3, 10, "A"),
          ex("Leg Extension", "accessory", 3, 12, "A"),
          ex("Plank", "core", 3, 1),
        ],
      },
      {
        name: "Upper — Bench focus",
        kind: "lifting",
        exercises: [
          ex("Barbell Bench Press", "primary", 5, 5),
          ex("Chest-Supported Row", "strength", 4, 8),
          ex("Lat Pulldown", "accessory", 3, 12, "A"),
          ex("Cable Pushdown", "accessory", 3, 15, "A"),
          ex("Face Pull", "accessory", 3, 15),
        ],
      },
      { name: "Zone 2 run", kind: "cardio", exercises: [], cardio: { modality: "run", durationMin: 35, hrZone: 2 } },
    ],
  };

  const v1: GenerationDto = {
    id: "g-1",
    clientId: "cl-story",
    basedOnProgramId: null,
    kind: "block",
    targetWeek: null,
    providerId: "mock",
    model: "mock",
    status: "validated",
    draft,
    error: null,
    parentGenerationId: null,
    revisionMessage: null,
    instructions: null,
    rejectReason: null,
    approvedProgramId: null,
    exampleProgramIds: [],
    createdAt: new Date().toISOString(),
  };

  let gens = $state<GenerationDto[]>([v1]);
  let notes = $state<ChatMessageDto[]>([]);
  let view = $state<number | null>(null);
  let n = 1;

  /** The edit route, in memory: same ops, same wording. */
  const fakeApi = {
    async editDraft(id: string, ops: DraftEditOp[]): Promise<DraftEditResultDto> {
      await new Promise((r) => setTimeout(r, 200));
      const parent = gens.find((g) => g.id === id)!;
      const res = applyDraftEdit(parent.draft as AiProgramDraft, ops);
      if (!res.changed) throw new Error("the draft is unchanged");
      const generation: GenerationDto = {
        ...parent,
        id: `g-${++n}`,
        draft: res.draft,
        parentGenerationId: parent.id,
        revisionMessage: draftEditRevisionMessage(res.changes),
        manualEdit: true,
        createdAt: new Date().toISOString(),
      };
      const version = revisionChain([generation, ...gens], generation.id).length;
      const message: ChatMessageDto = {
        id: `m-${n}`,
        role: "trainer",
        kind: "edit",
        content: draftEditNote(version, res.changes),
        generationId: generation.id,
        createdAt: generation.createdAt,
      };
      return { generation, message, undo: [res.inverse] };
    },
  };

  const preview = $derived(draftPreviewModel(gens, building, new Map()));
  const latest = $derived(preview.version);
  const shown = $derived(view !== null && view <= latest ? view : latest);
  const vview = $derived(preview.target ? versionView(gens, preview.target.id, shown, new Map()) : null);

  const editor = new DraftEditor({
    api: fakeApi,
    target: () => (building ? null : preview.target),
    onsaved: ({ generation, message }) => {
      gens = [generation, ...gens];
      notes = [...notes, message];
      view = null;
    },
  });
  // svelte-ignore state_referenced_locally
  if (selected.length) {
    editor.setSelecting(true);
    editor.selected = [...selected];
  }
</script>

<div class="frame">
  {#if vview}
    <DraftPreview
      view={vview}
      {latest}
      building={building ? { next: latest + 1, elapsed: "0:42" } : null}
      reviewHref="/clients/cl-story/generate"
      onview={(v) => (view = v)}
      open
      {editor}
    />
  {/if}
  {#if notes.length}
    <ol class="notes" aria-label="What the AI is told">
      {#each notes as m (m.id)}<li>{m.content}</li>{/each}
    </ol>
  {/if}
</div>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    gap: 12px;
    height: 820px;
    max-width: 560px;
  }
  .notes {
    flex: none;
    margin: 0;
    padding: 8px 8px 8px 28px;
    font-size: 12px;
    color: var(--muted);
  }
</style>
