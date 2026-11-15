<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import DraftNotice from './DraftNotice.svelte';
  import type { DraftNotice as Notice } from '$lib/generationWatch.svelte';

  const ready: Notice = { id: 'g1', tone: 'ready', clientId: 'c1', clientName: 'Maya Chen', title: 'Maya’s draft is ready', reason: null, href: '#' };
  const week: Notice = { id: 'g2', tone: 'ready', clientId: 'c2', clientName: 'Ada Ross', title: 'Ada’s week 3 is ready', reason: null, href: '#' };
  const failed: Notice = {
    id: 'g3',
    tone: 'failed',
    clientId: 'c3',
    clientName: 'James Park',
    title: 'James’ draft failed',
    reason: 'The provider timed out after 4 minutes.',
    href: '#',
  };
  const more: Notice[] = [
    { ...ready, id: 'g4', title: 'Lee’s filled weeks are ready' },
    { ...ready, id: 'g5', title: 'Sam’s new version is ready' },
  ];

  const { Story } = defineMeta({
    title: 'Components/DraftNotice',
    component: DraftNotice,
    args: { onopen: () => {}, ondismiss: () => {}, ondismissall: () => {} },
    parameters: {
      layout: 'fullscreen',
      docs: {
        description: {
          component:
            'App-wide stack for AI drafts that finished or failed while the trainer was elsewhere. Lamp + title + evidence line (Signal Row grammar) on a floating overlay box; stays until dismissed; past three, older notices fold into "+N more". Bottom-right above the Feedback launcher, top on phones.',
        },
      },
    },
  });
</script>

<Story name="Ready" args={{ notices: [ready] }} />
<Story name="Week ready" args={{ notices: [week] }} />
<Story name="Failed" args={{ notices: [failed] }} />
<Story name="Mixed" args={{ notices: [ready, failed] }} />
<Story name="Folded (+2 more)" args={{ notices: [week, ready, failed, ...more] }} />
<Story name="Phone" args={{ notices: [ready, failed] }} globals={{ viewport: { value: 'narrow' } }} />
