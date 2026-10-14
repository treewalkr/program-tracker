<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Pill from './Pill.svelte';

  const { Story } = defineMeta({
    title: 'UI/Pill',
    component: Pill,
    parameters: {
      docs: {
        description: {
          component:
            'Primer Label — ink-on-tint status pill. Domain statuses map onto these four tones (see Domain/StatusPill).',
        },
      },
    },
  });
</script>

<Story name="Good" args={{ tone: 'good' }}>active</Story>
<Story name="Warn" args={{ tone: 'warn' }}>paused</Story>
<Story name="Bad" args={{ tone: 'bad' }}>rejected</Story>
<Story name="Neutral" args={{ tone: 'neutral' }}>draft</Story>
