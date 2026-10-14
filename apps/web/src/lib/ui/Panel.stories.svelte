<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Panel from './Panel.svelte';

  const { Story } = defineMeta({
    title: 'UI/Panel',
    component: Panel,
    parameters: {
      docs: {
        description: {
          component:
            'Primer Box — canvas-white surface, hairline border, 6px radius, optional Well Gray head with title + counter + `act` link. Wrap tables in `panel-body tight` inside children.',
        },
      },
    },
  });
</script>

<Story name="With head" asChild>
  <div style="max-width: 480px;">
    <Panel title="Current program" count="Block A · v3">
      {#snippet act()}<a class="act" href="/programs/1">Open builder</a>{/snippet}
      <div class="panel-body">Panel body — 16px padding.</div>
    </Panel>
  </div>
</Story>

<Story name="Plain" asChild>
  <div style="max-width: 480px;">
    <Panel>
      <div class="panel-body">No head, just the body.</div>
    </Panel>
  </div>
</Story>

<Story name="Tight table body" asChild>
  <div style="max-width: 520px;">
    <Panel title="Exercises" count="719 total">
      <div class="panel-body tight">
        <table class="sheet">
          <thead><tr><th>Exercise</th><th class="r">Best e1RM</th></tr></thead>
          <tbody>
            <tr><td><a class="rowlink" href="/exercises/1">Back squat</a></td><td class="r">142.5</td></tr>
            <tr><td><a class="rowlink" href="/exercises/2">Bench press</a></td><td class="r">97.5</td></tr>
          </tbody>
        </table>
      </div>
    </Panel>
  </div>
</Story>
