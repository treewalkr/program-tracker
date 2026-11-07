<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import GeneratingState from './GeneratingState.svelte';

  const { Story } = defineMeta({
    title: 'UI/GeneratingState',
    component: GeneratingState,
    parameters: {
      docs: {
        description: {
          component:
            'Time-scaled progress state during AI draft generation. Displays provider meta, elapsed timer, capped progress bar, and server survival reassurance.',
        },
      },
    },
  });
</script>

{#snippet template(args: Record<string, any>)}
  <div style="max-width: 560px;">
    <div class="panel" style="padding: 22px 18px;">
      <GeneratingState
        startedAt={args.startedAt ?? new Date(Date.now() - 3 * 60_000).toISOString()}
        providerLabel={args.providerLabel ?? 'Z.ai GLM'}
        model={args.model ?? 'glm-5.3-flash'}
        expectedSeconds={args.expectedSeconds ?? 210}
        {...args}
      />
    </div>
  </div>
{/snippet}

<Story
  name="Default (3 min elapsed)"
  {template}
  args={{
    startedAt: new Date(Date.now() - 3 * 60_000).toISOString(),
    providerLabel: 'Z.ai GLM',
    model: 'glm-5.3-flash',
    expectedSeconds: 210,
  }}
/>
