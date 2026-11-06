<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import type { ChatProposalDto } from '$lib/api/types';
  import ChatProposal from './ChatProposal.svelte';

  const { Story } = defineMeta({
    title: 'Domain/ChatProposal',
    component: ChatProposal,
    parameters: {
      docs: {
        description: {
          component:
            'A proposed draft change from a chat turn. Nothing is rebuilt until the trainer presses Build (the one green action); Adjust hands the request back to the composer. Settles to Building / Built / Not built.',
        },
      },
    },
  });

  const proposal: ChatProposalDto = {
    summary: 'Swap the Session 3 primary for a paused back squat.',
    changes: [
      { day: 3, slot: 2, kind: 'swap', from: 'Front Squat', to: 'Paused Back Squat', detail: '5×5 @RPE 7–8 · rest 180s' },
    ],
    parentGenerationId: 'g3',
    builtGenerationId: null,
  };
  const noop = () => {};
</script>

<Story name="Open" args={{ proposal, status: 'open', onbuild: noop, onadjust: noop }} />
<Story name="Building" args={{ proposal, status: 'building', elapsed: '0:42' }} />
<Story name="Built" args={{ proposal: { ...proposal, builtGenerationId: 'g4' }, status: 'built' }} />
<Story name="Superseded" args={{ proposal, status: 'superseded' }} />
