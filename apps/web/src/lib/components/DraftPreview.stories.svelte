<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import DraftPreview from './DraftPreview.svelte';
  import { versionView } from '$lib/chatRefine';
  import { diffDrafts, unproposedChanges } from '@pt/shared';
  import type { AiDraftDto, GenerationDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/DraftPreview',
    component: DraftPreview,
    parameters: {
      docs: {
        description: {
          component:
            'Draft pane beside the chat: version switcher, slot change marks against the previous version (amber = not in the proposal), building banner with elapsed time + Cancel (the current version stays visible, dimmed), footer link to the review page — no approve control here. Collapses to its head row under 980px.',
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
  const href = '/clients/cl-maya/generate';
  const noop = () => {};
</script>

<Story name="Latest" args={{ view: latestView, latest: 2, reviewHref: href, onview: noop }} />
<Story name="Older version" args={{ view: firstView, latest: 2, reviewHref: href, onview: noop }} />
<Story name="Building" args={{ view: latestView, latest: 2, building: { next: 3, elapsed: '0:42' }, reviewHref: href, onview: noop, oncancel: noop }} />
<Story name="With surprise" args={{ view: latestView, latest: 2, unproposed: surprise, reviewHref: href, onview: noop }} />
