<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import RevisionThread from './RevisionThread.svelte';

  const { Story } = defineMeta({
    title: 'Domain/RevisionThread',
    component: RevisionThread,
    parameters: {
      docs: {
        description: {
          component: 'Renders the revision thread entries: v2..vN with trainer messages and timestamps.',
        },
      },
    },
  });
</script>

{#snippet template(args: { entries: { version: number; message: string; createdAt: string }[] })}
  <div style="max-width: 400px; padding: 16px;">
    <RevisionThread {...args} />
  </div>
{/snippet}

<Story
  name="Single Revision"
  {template}
  args={{
    entries: [
      {
        version: 2,
        message: 'Swap Day 2 bench for incline DB press; cut one RDL set.',
        createdAt: '2026-10-31T10:15:00Z',
      },
    ],
  }}
/>

<Story
  name="Multiple Revisions"
  {template}
  args={{
    entries: [
      {
        version: 2,
        message: 'Swap Day 2 bench for incline DB press; cut one RDL set.',
        createdAt: '2026-10-31T10:15:00Z',
      },
      {
        version: 3,
        message: 'Add a 3rd set to lateral raises.',
        createdAt: '2026-10-31T10:22:00Z',
      },
    ],
  }}
/>
