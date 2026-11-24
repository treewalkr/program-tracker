<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputDuration from './InputDuration.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/11 Duration field',
    component: InputDuration,
    parameters: {
      docs: {
        description: {
          component:
            'A time typed as mm:ss or h:mm:ss — a cardio log’s duration, an interval’s time, a 1.5-mile finish. Phone keypads have no ":", so three or more digits get the colon from the right ("3510" → 35:10, "10530" → 1:05:30); one or two digits are minutes ("40" → 40:00). Pass `junkText` and `rangeWords` to show the messages in the page’s language. The value is whole seconds and shows back in the clock format on blur; ↑/↓ step by `step` seconds (Shift ×10). `cell` gives the Input 04 quiet-cell look for interval tables. Focus selects the time, so typing replaces a prefilled plan rather than appending to it; Enter moves to the next field (a cell just closes) and never submits the form. A number with a unit stays Input 02.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let logged = $state<number | null>(2110);
  let blank = $state<number | null>(null);
  let long = $state<number | null>(5400);
  let rep = $state<number | null>(120);
  let over = $state<number | null>(30);
  let planned = $state<number | null>(1980);
  let warmup = $state<number | null>(600);
  let submits = $state(0);
</script>

<Story name="Cardio log" asChild>
  <div style="max-width: 320px"><InputDuration label="Duration" bind:value={logged} min={60} max={18000} hint="35:10, 3510 or 40 for minutes." /></div>
</Story>

<Story name="Prefilled plan in a form" asChild>
  <!-- Tap "Time taken" and type 3510: the plan is selected, so it becomes 35:10, not 33:003510. Enter moves to Warm-up, never submits. -->
  <form style="max-width: 320px; display: grid; gap: 12px" onsubmit={(e) => { e.preventDefault(); submits += 1; }}>
    <InputDuration label="Time taken" bind:value={planned} min={1} max={18000} hint="Planned 33:00 — tap and type yours." />
    <InputDuration label="Warm-up" bind:value={warmup} min={0} max={3600} />
    <p style="font: 12px var(--font-ui); color: var(--muted); margin: 0">Form submitted {submits} times</p>
  </form>
</Story>

<Story name="Blank (required)" asChild>
  <div style="max-width: 320px"><InputDuration label="Duration" bind:value={blank} width="auto" /></div>
</Story>

<Story name="Hours" asChild>
  <div style="max-width: 320px"><InputDuration label="Long run" bind:value={long} hours width="auto" /></div>
</Story>

<Story name="Interval cell" asChild>
  <table style="font: 13px var(--font-ui); border-collapse: collapse">
    <thead><tr><th style="text-align:left; padding: 4px 12px">Type</th><th style="text-align:right; padding: 4px 12px">Time</th></tr></thead>
    <tbody><tr><td style="padding: 4px 12px">Work</td><td style="padding: 4px 12px; width: 9ch"><InputDuration label="Time for interval 2" bind:value={rep} step={15} cell /></td></tr></tbody>
  </table>
</Story>

<Story name="Out of range" asChild>
  <div style="max-width: 320px"><InputDuration label="1.5-mile time" bind:value={over} min={60} max={14400} error="Between 1:00 and 4:00:00" /></div>
</Story>

<Story name="Thai messages" asChild>
  <div style="max-width: 320px"><InputDuration label="เวลาที่ใช้" bind:value={over} min={60} max={14400} junkText="พิมพ์เวลาแบบ 35:10" rangeWords={{ between: 'ระหว่าง {min} ถึง {max}', atLeast: 'อย่างน้อย {min}', atMost: 'ไม่เกิน {max}' }} /></div>
</Story>

<Story name="Disabled" asChild>
  <div style="max-width: 320px"><InputDuration label="Duration" value={1980} disabled /></div>
</Story>
