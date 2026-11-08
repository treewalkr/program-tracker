<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import VersionLink from './VersionLink.svelte';

  const { Story } = defineMeta({
    title: 'Domain/VersionLink',
    component: VersionLink,
    parameters: {
      docs: {
        description: {
          component:
            "The build in the sidebar's account row (\"Demo data · v0.1.9+42a93f5\"). Links to What's new; a blue unread dot follows it until this browser has opened the page for the newest release.",
        },
      },
    },
  });
</script>

<Story name="Seen" args={{ build: '0.1.9+42a93f5' }} />
<Story name="New release" args={{ build: '0.1.9+42a93f5', fresh: true }} />
