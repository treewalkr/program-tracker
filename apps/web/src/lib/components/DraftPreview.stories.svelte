<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import DraftPreview from './DraftPreview.svelte';
  import { draftPreviewModel } from '$lib/chatRefine';
  import type { AiDraftDto, GenerationDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/DraftPreview',
    component: DraftPreview,
    parameters: {
      docs: {
        description: {
          component:
            'Live AI-draft preview beside the chat. Version counter in the head; skeleton session cards while a refinement turn runs; "updated in vN" chips on changed sessions afterwards; footer link to the review page — no approve control here.',
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
  const idle = draftPreviewModel([v1], false, catalogById);

  const generating = draftPreviewModel([v1], true, catalogById);

  // v2: heavier day A, lighter day B — those two carry "updated in v2" chips.
  const v2 = gen({
    parentGenerationId: v1.id,
    draft: {
      ...baseDraft,
      sessions: [session('Day A', 5), session('Day B', 3), session('Day C')],
    },
  });
  const updated = draftPreviewModel([v2, v1], false, catalogById);
</script>

<Story name="Idle" args={{ model: idle, reviewHref: '/clients/cl-maya/generate' }} />
<Story name="Generating" args={{ model: generating, reviewHref: '/clients/cl-maya/generate' }} />
<Story name="Updated" args={{ model: updated, reviewHref: '/clients/cl-maya/generate' }} />
