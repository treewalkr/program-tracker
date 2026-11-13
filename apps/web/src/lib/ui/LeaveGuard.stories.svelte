<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import LeaveGuard from './LeaveGuard.svelte';
  import type { Asker, AskOptions } from '$lib/leaveGuard.svelte';

  const { Story } = defineMeta({
    title: 'UI/LeaveGuard',
    component: LeaveGuard,
    parameters: {
      docs: {
        description: {
          component:
            "The page's one confirm dialog, in place of the browser's confirm(). The safe choice is the primary button on the right and takes focus, Esc and backdrop clicks; the asked-about action is a quiet button on the left, red when it drops work; an optional third choice sits between.",
        },
      },
    },
  });

  const fake = (request: AskOptions, busy = false): Asker => ({
    request,
    open: true,
    busy,
    ask: async () => 'cancel',
    answer: async () => {},
  });

  const programLeave: AskOptions = {
    title: 'Save your program changes?',
    body: "You have edits that haven't been saved. Saving creates a new version; leaving drops them.",
    confirmLabel: 'Leave without saving',
    cancelLabel: 'Keep editing',
    alt: { label: 'Save and leave', busyLabel: 'Saving…' },
  };
</script>

<Story name="Leave, with save" asChild>
  <LeaveGuard guard={fake(programLeave)} />
</Story>

<Story name="Leave, saving" asChild>
  <LeaveGuard guard={fake(programLeave, true)} />
</Story>

<Story name="Leave or stay" asChild>
  <LeaveGuard
    guard={fake({
      title: 'Leave with unsaved chains?',
      body: "2 chains have edits that haven't been saved. Leaving drops them.",
      confirmLabel: 'Leave without saving',
      cancelLabel: 'Keep editing',
    })}
  />
</Story>

<Story name="Discard, keep draft" asChild>
  <LeaveGuard
    guard={fake({
      title: 'Switch sessions?',
      body: "The sets you've entered for Lower A aren't saved. Keep them as a draft on this device to pick up later, or discard them.",
      confirmLabel: 'Discard sets',
      cancelLabel: 'Stay here',
      alt: { label: 'Keep draft' },
    })}
  />
</Story>

<Story name="Destructive confirm" asChild>
  <LeaveGuard
    guard={fake({
      title: 'Skip Back squat?',
      body: 'The extra sets you entered for it will be dropped.',
      confirmLabel: 'Skip and drop sets',
      cancelLabel: 'Cancel',
    })}
  />
</Story>

<Story name="Neutral confirm" asChild>
  <LeaveGuard
    guard={fake({
      title: 'Start a new template?',
      body: 'Your current template is saved; this opens a blank one.',
      confirmLabel: 'Start new',
      danger: false,
    })}
  />
</Story>
