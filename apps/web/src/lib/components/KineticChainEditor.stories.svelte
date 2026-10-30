<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import KineticChainEditor from './KineticChainEditor.svelte';
  import type { KineticChainDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/KineticChainEditor',
    component: KineticChainEditor,
    parameters: {
      docs: {
        description: {
          component:
            'Trainer-maintained kinetic chain muscle group editor. Multi-select toggle chips over CHAIN_MUSCLE_GROUPS with per-row save action.',
        },
      },
    },
  });
</script>

<script lang="ts">
  const sampleChain: KineticChainDto = {
    id: 'chain-deep-longitudinal',
    name: 'Deep Longitudinal',
    muscleGroups: ['back', 'hamstrings', 'calves'],
    sortOrder: 2,
  };

  async function mockSave(groups: string[]) {
    await new Promise((r) => setTimeout(r, 400));
    sampleChain.muscleGroups = groups;
  }
</script>

<Story name="Deep Longitudinal" asChild>
  <KineticChainEditor chain={sampleChain} onSave={mockSave} />
</Story>
