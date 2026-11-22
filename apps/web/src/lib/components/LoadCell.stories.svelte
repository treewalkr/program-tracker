<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import LoadCell, { type LoadCellText, type LoadMode } from './LoadCell.svelte';
  import LogStepper from './LogStepper.svelte';
  import type { Cell } from '$lib/logSheet';

  const { Story } = defineMeta({
    title: 'Domain/LoadCell',
    component: LoadCell,
    parameters: {
      docs: {
        description: {
          component:
            "One set's load on the member's log: the external weight held or added. **BW** means none (a quiet Bodyweight box, nothing to fill in); **kg** is the log stepper. The switch sits top-right in both modes, so the cell keeps its height and focus stays put. On a bodyweight move kg reads **Added kg** (a vest, a belt). Shown beside a reps cell at phone width, as on the page; the switches work.",
        },
      },
    },
  });

  type Demo = { mode: LoadMode; kg: Cell; reps: Cell };

  const text = (name: string, n: number): LoadCellText => ({
    unit: 'kg',
    added: 'Added kg',
    load: 'Load',
    bodyweight: 'Bodyweight',
    bw: 'BW',
    addLoad: '+ kg',
    toBw: `${name} set ${n}: bodyweight`,
    toLoad: `${name} set ${n}: add weight`,
  });
</script>

<script lang="ts">
  let stepUp = $state<Demo>({ mode: 'bw', kg: '', reps: 10 });
  let wallBall = $state<Demo>({ mode: 'kg', kg: 9, reps: 15 });
  let pullUp = $state<Demo>({ mode: 'kg', kg: 10, reps: 6 });
  let catCamel = $state<Demo>({ mode: 'bw', kg: '', reps: 8 });
  let blank = $state<Demo>({ mode: 'kg', kg: '', reps: 15 });
</script>

{#snippet sheet(name: string, d: Demo, opts: { added?: boolean; error?: string } = {})}
  <!-- the log page's narrow sheet: LogStepper and LoadCell key their 44px rows off this container -->
  <div style="container: logform / inline-size; width: 358px; padding: 12px; background: var(--surface);">
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; gap: 10px 12px;">
      <LoadCell
        bind:value={d.kg}
        mode={d.mode}
        onmode={(m) => (d.mode = m)}
        added={opts.added}
        label={`${name} Set 1, ${opts.added ? 'Added kg' : 'kg'}`}
        text={text(name, 1)}
        step={2.5}
        min={0}
        max={600}
        error={d.mode === 'kg' && (d.kg === '' || d.kg == null) ? opts.error : undefined}
        errorId={`err-${name}`}
      />
      <LogStepper bind:value={d.reps} label={`${name} Set 1, reps`} unit="reps" step={1} min={0} max={200} inputmode="numeric" />
    </div>
  </div>
{/snippet}

<Story name="Bodyweight" asChild>
  {@render sheet('Step-up', stepUp)}
</Story>

<Story name="kg" asChild>
  {@render sheet('Wall Ball', wallBall)}
</Story>

<Story name="Added kg (bodyweight move)" asChild>
  {@render sheet('Pull-up', pullUp, { added: true })}
</Story>

<Story name="Bodyweight move at BW" asChild>
  {@render sheet('Cat camel', catCamel, { added: true })}
</Story>

<Story name="kg left blank after Save" asChild>
  {@render sheet('Wall Ball', blank, { error: 'Add the weight, or tap BW' })}
</Story>
