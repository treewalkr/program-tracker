<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import LeaveGuard from './LeaveGuard.svelte';
  import type { LeaveGuard as Guard } from '$lib/leaveGuard.svelte';

  const { Story } = defineMeta({
    title: 'UI/LeaveGuard',
    component: LeaveGuard,
    parameters: {
      docs: {
        description: {
          component:
            'Unsaved-changes dialog shown when navigating away. "Keep editing" is the safe default; "Save and leave" appears only when the page can save.',
        },
      },
    },
  });

  const fake = (canSave: boolean, busy = false): Guard => ({
    open: true,
    busy,
    canSave,
    stay() {},
    leave: async () => {},
    saveAndLeave: async () => {},
  });
</script>

<Story name="With save" asChild>
  <LeaveGuard guard={fake(true)} title="Save your program changes?" body="You have edits that haven't been saved. Saving creates a new version; leaving drops them." />
</Story>

<Story name="Saving" asChild>
  <LeaveGuard guard={fake(true, true)} title="Save your program changes?" body="You have edits that haven't been saved. Saving creates a new version; leaving drops them." />
</Story>

<Story name="Leave or stay" asChild>
  <LeaveGuard guard={fake(false)} title="Leave with unsaved chains?" body="2 chains have edits that haven't been saved. Leaving drops them." />
</Story>
