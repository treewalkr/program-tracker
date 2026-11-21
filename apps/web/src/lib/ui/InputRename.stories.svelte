<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputRename from './InputRename.svelte';
  import Panel from './Panel.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/06 Inline rename',
    component: InputRename,
    parameters: {
      docs: {
        description: {
          component:
            'Rename a heading in place: program, phase, session. At rest, the title and a quiet pencil ("Rename program") that turns fully visible on hover or focus, and always on touch. Editing swaps in a field at the same size and weight so nothing jumps, with Save (default — green stays for the review verb) and Cancel. Enter saves, Esc cancels, an empty name is blocked; focus returns to the pencil.',
        },
      },
    },
  });

  /** Clear the field and press Enter, to show the empty-name error. */
  async function submitEmpty({ canvasElement }: { canvasElement: HTMLElement }) {
    const input = await waitFor(() => canvasElement.querySelector('input'));
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }

  async function waitFor<T>(find: () => T | null): Promise<T> {
    for (let i = 0; i < 50; i++) {
      const found = find();
      if (found) return found;
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error('not found');
  }
</script>

<script lang="ts">
  let program = $state('Off-season strength block');
  let editing = $state(true);
  let editingEmpty = $state(true);
  let session = $state('Lower A · squat focus');
  let edited = $state('Hypertrophy phase');
</script>

<Story name="Page title at rest" asChild>
  <InputRename bind:value={program} thing="program" size="title" tag="h1" />
</Story>

<Story name="Editing" asChild>
  <div style="max-width: 520px"><InputRename bind:value={edited} thing="phase" size="title" bind:editing /></div>
</Story>

<Story name="Empty error" asChild play={submitEmpty}>
  <div style="max-width: 520px"><InputRename value="Hypertrophy phase" thing="phase" size="title" bind:editing={editingEmpty} /></div>
</Story>

<Story name="Row size in a panel head" asChild>
  <div style="max-width: 560px">
    <Panel>
      <div class="panel-head">
        <InputRename bind:value={session} thing="session" size="row" tag="h2" />
        <span class="counter">5 exercises</span>
      </div>
      <div class="panel-body" style="font-size: 13px; color: var(--muted)">Back squat · Romanian deadlift · Split squat · Leg curl · Plank</div>
    </Panel>
  </div>
</Story>
