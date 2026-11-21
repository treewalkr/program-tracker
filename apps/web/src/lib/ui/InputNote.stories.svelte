<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputNote from './InputNote.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/05 Note box',
    component: InputNote,
    parameters: {
      docs: {
        description: {
          component:
            'Several lines: notes, limitations, a reject reason. A Primer comment box: the textarea grows with the text from `rows` (3) up to `maxRows` (10), then scrolls; a foot strip under a hairline carries the hint on the left and a mono `n / max` count on the right. Focus rings the whole box. Enter adds a line; Tab leaves.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let limits = $state('Left knee: no deep flexion under load since the 2024 meniscus repair.');
  let reason = $state(
    'Week 3 jumps from 4 to 6 working sets on squat and adds a second heavy day. She is coming back from a two-week break and her sleep has been poor, so keep week 3 at 4 sets and move the heavy single to week 4.',
  );
  let blank = $state('');
</script>

<Story name="Limitations with hint" asChild>
  <div style="max-width: 480px"><InputNote label="Limitations" bind:value={limits} hint="The AI avoids anything listed here." /></div>
</Story>

<Story name="Near the limit" asChild>
  <div style="max-width: 480px"><InputNote label="Reason for changes" bind:value={reason} maxlength={240} hint="Sent to the AI with the redraft." /></div>
</Story>

<Story name="Error" asChild>
  <div style="max-width: 480px"><InputNote label="Reason for changes" bind:value={blank} placeholder="What should change, and why?" error="Say what to change so the redraft can fix it." /></div>
</Story>

<Story name="Read-only" asChild>
  <div style="max-width: 480px"><InputNote label="Client's note" value="Felt strong today. Hips tight on the last two sets of RDLs." readonly hint="Written by the client in the portal." /></div>
</Story>

<Story name="Disabled" asChild>
  <div style="max-width: 480px"><InputNote label="Limitations" value="None known." disabled /></div>
</Story>
