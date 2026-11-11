<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import DraftPreview from './DraftPreview.svelte';
  import { versionRows, versionView } from '$lib/chatRefine';
  import { revisionChain } from '$lib/generation';
  import { diffDrafts, unproposedChanges } from '@pt/shared';
  import type { AiDraftDto, GenerationDto } from '$lib/api/types';
  import DraftEditStory from './stories/DraftEditStory.svelte';

  const { Story } = defineMeta({
    title: 'Domain/DraftPreview',
    component: DraftPreview,
    parameters: {
      docs: {
        description: {
          component:
            'Draft pane beside the chat: compact version switcher (newest first; who made each version and what changed), slot change marks against the previous version (amber = not in the proposal), building banner with elapsed time + Cancel (the current version stays visible, dimmed), footer link to the review page — no approve control here. Collapses to its head row under 980px.',
        },
      },
    },
  });

  const set = (reps: number, kg = 100) => ({ setNumber: 1, type: 'working' as const, reps, amrap: false, targetWeightKg: kg });

  const session = (name: string, reps = 5) => ({
    name,
    exercises: [{ exerciseId: 'ex-squat', exerciseName: 'Back Squat', role: 'primary' as const, prescribedSets: [set(reps)] }],
  });

  const baseDraft: AiDraftDto = {
    name: 'Block 2 — base build',
    rationale: 'Base volume before intensity.',
    clientSummary: 'Three lifting days.',
    sessions: [session('Day A'), session('Day B'), session('Day C')],
  };

  let seq = 0;
  const gen = (overrides: Partial<GenerationDto> = {}): GenerationDto => {
    seq += 1;
    return {
      id: `g-${seq}`,
      clientId: 'cl-maya',
      basedOnProgramId: null,
      kind: 'block',
      targetWeek: null,
      providerId: 'mock',
      model: 'mock',
      status: 'validated',
      draft: baseDraft,
      error: null,
      parentGenerationId: null,
      revisionMessage: null,
      instructions: null,
      rejectReason: null,
      approvedProgramId: null,
      exampleProgramIds: [],
      createdAt: new Date().toISOString(),
      ...overrides,
    };
  };

  const catalogById = new Map([['ex-squat', { movementPattern: 'squat' }]]);

  const v1 = gen();
  // v2: heavier day A, lighter day B.
  const v2 = gen({
    parentGenerationId: v1.id,
    draft: {
      ...baseDraft,
      sessions: [session('Day A', 5), session('Day B', 3), session('Day C')],
    },
  });
  const gens = [v2, v1];
  const latestView = versionView(gens, v2.id, 2, catalogById)!;
  const firstView = versionView(gens, v2.id, 1, catalogById)!;
  // Pretend the proposal only asked for day A: day B's edit is a surprise.
  const surprise = unproposedChanges(diffDrafts(v1.draft!, v2.draft!), {
    changes: [{ day: 1, slot: 1, kind: 'edit' }],
  });
  const history = versionRows(revisionChain(gens, v2.id));

  // A long history: AI builds between runs of folded hand edits.
  const long: GenerationDto[] = [v1];
  const steps: [boolean, string][] = [
    [false, 'Heavier squats on day A'],
    [true, 'Edited by you: moved Back Squat up in Session 1; superset A in Session 2: Back Squat + Plank'],
    [false, 'Swap the curls for hammer curls'],
    [true, 'Edited by you: moved Back Squat to Session 3 …and 4 more'],
    [true, 'Edited by you: changes undone'],
    [false, 'Add a core finisher to every session'],
    [false, 'Lighter week 4'],
    [true, 'Edited by you: took Back Squat out of superset A in Session 2'],
  ];
  for (const [i, [manualEdit, revisionMessage]] of steps.entries()) {
    const prev = long[long.length - 1];
    long.push(
      gen({
        parentGenerationId: prev.id,
        manualEdit,
        revisionMessage,
        draft: { ...baseDraft, sessions: [session('Day A', manualEdit ? 5 : 5 + (i % 3)), session('Day B'), session('Day C')] },
      })
    );
  }
  const longGens = [...long].reverse();
  const lastId = long[long.length - 1].id;
  const longHistory = versionRows(revisionChain(longGens, lastId));
  const longLatest = versionView(longGens, lastId, long.length, catalogById)!;
  const longOlder = versionView(longGens, lastId, 4, catalogById)!;
  const href = '/clients/cl-maya/generate';
  const noop = () => {};
</script>

<Story name="Latest" args={{ view: latestView, latest: 2, history, reviewHref: href, onview: noop }} />
<Story name="Older version" args={{ view: firstView, latest: 2, history, reviewHref: href, onview: noop }} />
<Story name="Building" args={{ view: latestView, latest: 2, history, building: { next: 3, elapsed: '0:42' }, reviewHref: href, onview: noop, oncancel: noop }} />
<Story name="With surprise" args={{ view: latestView, latest: 2, history, unproposed: surprise, reviewHref: href, onview: noop }} />
<!-- The switcher with nine versions: open it to see who made each one and what changed. -->
<Story name="Many versions" args={{ view: longLatest, latest: long.length, history: longHistory, reviewHref: href, onview: noop }} />
<Story name="Many versions, older shown" args={{ view: longOlder, latest: long.length, history: longHistory, reviewHref: href, onview: noop }} />
<Story name="Many versions, building" args={{ view: longLatest, latest: long.length, history: longHistory, building: { next: long.length + 1, elapsed: '0:18' }, reviewHref: href, onview: noop, oncancel: noop }} />

<!-- Hand edits: ⋯ per row (move, superset, leave, move to session), Select mode with its bar, and the Undo toast.
     Edits apply in memory; the lines under the pane are the notes the AI reads. -->
<Story name="Editable" asChild>
  <DraftEditStory />
</Story>
<Story name="Editable selecting" asChild>
  <DraftEditStory selected={['1:5', '1:7']} />
</Story>
<Story name="Editable locked while building" asChild>
  <DraftEditStory building />
</Story>
