<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import type { SlotChange } from '@pt/shared';
  import VersionStamp from './VersionStamp.svelte';

  const { Story } = defineMeta({
    title: 'Domain/VersionStamp',
    component: VersionStamp,
    parameters: {
      docs: {
        description: {
          component:
            'Evidence line under a chat turn that produced a draft version: version tag, change count read from the drafts, and — when built from a proposal — "Built as proposed" or an amber count of changes the proposal did not ask for (opens by itself). Rows are buttons that jump to the change in the draft pane.',
        },
      },
    },
  });

  const swap: SlotChange = { day: 3, beforeSlot: 2, afterSlot: 2, kind: 'swap', exercise: 'Paused Back Squat', from: 'Front Squat', to: 'Paused Back Squat' };
  const rest: SlotChange = { day: 3, beforeSlot: 1, afterSlot: 1, kind: 'rx', exercise: '2 Handed Kettlebell Swing', from: 'rest 75s', to: 'rest 60s' };
  const added: SlotChange = { day: 2, beforeSlot: null, afterSlot: 7, kind: 'added', exercise: 'Face Pull', from: null, to: '2×15 @RPE 7 · rest 60s' };
  const base = { messageId: 'm1', generationId: 'g4', version: 4 };
</script>

<Story name="As proposed" args={{ stamp: { ...base, changes: [swap], unproposed: [] } }} />
<Story name="With surprise" args={{ stamp: { ...base, changes: [rest, swap], unproposed: [rest] } }} />
<Story name="Legacy (no proposal)" args={{ stamp: { ...base, version: 3, changes: [swap, added], unproposed: null } }} />
<Story name="No changes" args={{ stamp: { ...base, version: 2, changes: [], unproposed: null } }} />
