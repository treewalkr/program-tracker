<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputTags from './InputTags.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/07 Tag input',
    component: InputTags,
    parameters: {
      docs: {
        description: {
          component:
            'Several free-typed values: aliases, equipment, cues. Same box and blue tokens as Select 10, so typed and picked values read as one family. Enter or comma adds; a paste splits on commas and new lines; Backspace on the empty field removes the last tag. A duplicate (any case) isn\'t added — the existing token flashes and the hint reads "Already added". Each × is "Remove {tag}"; adds and removals are announced. Values chosen from a list stay Select 10.',
        },
      },
    },
  });

  /** Type a duplicate and press Enter, to show the flash and the hint. */
  async function typeDuplicate({ canvasElement }: { canvasElement: HTMLElement }) {
    let input: HTMLInputElement | null = null;
    for (let i = 0; i < 50 && !input; i++) {
      input = canvasElement.querySelector('input');
      if (!input) await new Promise((r) => setTimeout(r, 20));
    }
    if (!input) return;
    input.focus();
    input.value = 'back squat';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
</script>

<script lang="ts">
  let aliases = $state(['Back squat', 'BB squat', 'High-bar squat']);
  let dup = $state(['Back squat', 'BB squat', 'High-bar squat']);
  let none = $state<string[]>([]);
  let cues = $state(['Brace', 'Knees out', 'Chest up', 'Drive the floor', 'Sit between']);
</script>

<Story name="Aliases" asChild>
  <div style="max-width: 420px"><InputTags label="Also called" bind:tags={aliases} hint="Search finds the exercise by any of these." /></div>
</Story>

<Story name="Empty" asChild>
  <div style="max-width: 420px"><InputTags label="Equipment" bind:tags={none} placeholder="Barbell, rack, bench…" optional /></div>
</Story>

<Story name="Duplicate typed" asChild play={typeDuplicate}>
  <div style="max-width: 420px"><InputTags label="Also called" bind:tags={dup} hint="Search finds the exercise by any of these." /></div>
</Story>

<Story name="At max" asChild>
  <div style="max-width: 420px"><InputTags label="Coaching cues" bind:tags={cues} max={5} /></div>
</Story>

<Story name="Disabled" asChild>
  <div style="max-width: 420px"><InputTags label="Also called" tags={['Back squat', 'BB squat']} disabled /></div>
</Story>
