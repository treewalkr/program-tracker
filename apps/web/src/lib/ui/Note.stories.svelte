<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Note from './Note.svelte';

  const { Story } = defineMeta({
    title: 'UI/Note',
    component: Note,
    parameters: {
      docs: {
        description: {
          component:
            'Flash/notice note — colored ink on its soft tint with a matching edge (Ink-on-Tint Rule). Consolidates flash-ok/flash-bad, the limitations note, and the demo banner.',
        },
      },
    },
  });
</script>

{#snippet template(args: Record<string, any>)}
  <Note {...args}>Approved — the draft is now editable as a program.</Note>
{/snippet}

<Story name="Ok" {template} args={{ tone: 'ok' }} />
<Story name="Bad" {template} args={{ tone: 'bad' }} />
<Story name="Warn (demo banner)" asChild>
  <Note tone="warn" role="note">Demo mode — every number on screen is mock data. Nothing is saved.</Note>
</Story>
