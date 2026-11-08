<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ModelSettings from './ModelSettings.svelte';
  import type { ProviderDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/ModelSettings',
    component: ModelSettings,
    parameters: {
      docs: {
        description: {
          component:
            'One-line model summary (model · effort effort) that opens the provider/model/effort picker in a popover. Escape closes and returns focus to the trigger. Empty selection = provider default.',
        },
      },
    },
  });

  const deepseek: ProviderDto = {
    id: 'deepseek',
    label: 'DeepSeek',
    model: 'deepseek-flash',
    models: ['deepseek-flash', 'deepseek-v4-pro'],
    configured: true,
    effortLevels: ['low', 'high', 'max'],
    defaultEffort: 'max',
  };
  const mock: ProviderDto = {
    id: 'mock',
    label: 'Mock (canned draft)',
    model: 'mock-draft-v1',
    models: ['mock-draft-v1'],
    configured: true,
  };
</script>

<Story name="Default" args={{ providers: [deepseek, mock], providerId: 'deepseek', model: '', effort: '' }} />
