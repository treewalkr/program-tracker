<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Field from './Field.svelte';

  const { Story } = defineMeta({
    title: 'UI/Field',
    component: Field,
    parameters: {
      docs: {
        description: {
          component:
            'Label + control + error wrapper. The control stays a plain `.input`/`.select`/`.textarea` element passed as children, so binding and ids stay at the call site.',
        },
      },
    },
  });
</script>

<script>
  let name = $state('');
</script>

<Story name="Text input" asChild>
  <div class="narrow">
    <Field label="Name" htmlFor="s-name">
      <input class="input" id="s-name" placeholder="Alex Rivera" bind:value={name} />
    </Field>
  </div>
  <style>
    .narrow { max-width: 360px; }
  </style>
</Story>

<Story name="With hint" asChild>
  <div class="narrow">
    <Field label="Limitations" htmlFor="s-lim" hint="treated as hard constraints by the AI">
      <textarea class="textarea" id="s-lim" rows="2" placeholder="Left knee — no deep flexion under load"></textarea>
    </Field>
  </div>
  <style>
    .narrow { max-width: 360px; }
  </style>
</Story>

<Story name="With error" asChild>
  <div class="narrow">
    <Field label="Email" htmlFor="s-email" error="Enter a valid email address.">
      <input class="input" id="s-email" value="not-an-email" />
    </Field>
  </div>
  <style>
    .narrow { max-width: 360px; }
  </style>
</Story>

<Story name="Grouped (form grid)" asChild>
  <form class="grid" onsubmit={(e) => e.preventDefault()}>
    <Field label="Training days per week" htmlFor="s-days">
      <select class="select" id="s-days">
        {#each [1, 2, 3, 4, 5, 6] as d}<option value={d}>{d}</option>{/each}
      </select>
    </Field>
    <Field label="Which days" hint="drives the weekly plan grid">
      <div style="display: flex; gap: 6px;">
        {#each ['Mon', 'Tue', 'Wed'] as d}<button type="button" class="tchip" class:on={d === 'Mon'} aria-pressed={d === 'Mon'}>{d}</button>{/each}
      </div>
    </Field>
  </form>
  <style>
    .grid { display: grid; gap: 14px; max-width: 420px; }
  </style>
</Story>
