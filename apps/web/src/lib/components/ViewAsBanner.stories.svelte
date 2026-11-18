<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import ViewAsBanner from './ViewAsBanner.svelte';
  import type { Impersonator } from '$lib/api/auth';

  const NOW = Date.parse('2026-11-18T10:00:00Z');
  const at = (min: number) => new Date(NOW + min * 60_000).toISOString();
  const view: Impersonator = {
    actor: { id: 'a', name: 'Rali', email: 'rali@x.test', avatarUrl: null },
    trainer: { id: 'k', name: 'Kai Tan', email: 'kai@x.test', avatarUrl: null },
    ticket: { id: 't', number: 12, handle: 'FB-012' },
    until: at(24),
    writesUntil: null,
    ended: null,
  };

  const { Story } = defineMeta({
    title: 'Components/ViewAsBanner',
    component: ViewAsBanner,
    args: {
      view,
      now: NOW,
      locale: 'en',
      onstop: () => {},
      onlock: () => {},
      onallow: async () => {},
    },
    parameters: {
      layout: 'fullscreen',
      docs: {
        description: {
          component:
            'The bar across the top of the app while the admin views it as a trainer. Read-only is Inverted Ink; Allow edits (type the first name) turns it Attention Amber for 10 minutes; an ended view drops to a quiet well with the way back. Never dismissible. Wraps to two lines under 720px.',
        },
      },
    },
  });
</script>

<Story name="Read-only" />
<Story name="Read-only (Thai)" args={{ locale: 'th' }} />
<Story name="No ticket" args={{ view: { ...view, ticket: null } }} />
<Story name="Edits on" args={{ view: { ...view, writesUntil: at(9) } }} />
<Story name="Edits on (Thai)" args={{ view: { ...view, writesUntil: at(9) }, locale: 'th' }} />
<Story name="Ended" args={{ view: { ...view, ended: 'expired' } }} />
<Story name="Ended (Thai)" args={{ view: { ...view, ended: 'flag_off' }, locale: 'th' }} />
<Story name="Stopping" args={{ busy: true }} />
<Story name="Error" args={{ error: 'read-only while viewing as Kai' }} />
