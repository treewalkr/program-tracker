<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ProviderPicker from './ProviderPicker.svelte';
  import type { ProviderDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/ProviderPicker',
    component: ProviderPicker,
    parameters: {
      docs: {
        description: {
          component:
            'Provider / model / thinking-effort selection. Provider dropdown shows the provider name only; model select hides on single-model providers; effort select hides when the provider takes no effort parameter (glm-4.x thinking is disabled). Empty selection = provider default.',
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
    defaultEffort: 'high',
  };
  const mock: ProviderDto = {
    id: 'mock',
    label: 'Mock (canned draft)',
    model: 'mock-draft-v1',
    models: ['mock-draft-v1'],
    configured: true,
  };
</script>

<Story name="With effort levels" args={{ providers: [deepseek, mock], providerId: 'deepseek', model: '', effort: '' }} />

<Story name="Single model, no effort" args={{ providers: [mock], providerId: 'mock', model: '', effort: '' }} />
