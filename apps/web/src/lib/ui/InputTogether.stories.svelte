<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputField from './InputField.svelte';
  import InputUnit from './InputUnit.svelte';
  import InputSearch from './InputSearch.svelte';
  import InputCell from './InputCell.svelte';
  import InputNote from './InputNote.svelte';
  import InputRename from './InputRename.svelte';
  import InputTags from './InputTags.svelte';
  import InputDiff from './InputDiff.svelte';
  import InputCopy from './InputCopy.svelte';
  import InputDate from './InputDate.svelte';
  import SelectField from './SelectField.svelte';
  import SelectPrefixed from './SelectPrefixed.svelte';
  import SelectCell from './SelectCell.svelte';
  import SelectStepper from './SelectStepper.svelte';
  import Button from './Button.svelte';
  import Panel from './Panel.svelte';
  import Icon from './Icon.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/00 Together',
    parameters: {
      docs: {
        description: {
          component:
            'The proof the inputs get along with the selects and buttons: one 12px label, one 32px box (40px under 720px), one focus ring. A client profile form, a list toolbar, a log row in a panel, and a panel head with settings. Labels and box edges line up across columns.',
        },
      },
    },
  });

  const goals = [
    { value: 'strength', label: 'Strength' },
    { value: 'hypertrophy', label: 'Hypertrophy' },
    { value: 'power', label: 'Power' },
    { value: 'general', label: 'General fitness' },
  ];
  const sorts = [
    { value: 'recent', label: 'Recently active' },
    { value: 'name', label: 'Name' },
    { value: 'due', label: 'Review due' },
  ];
  const roles = [
    { value: 'main', label: 'Main' },
    { value: 'secondary', label: 'Secondary' },
    { value: 'accessory', label: 'Accessory' },
  ];
  const reps = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15];
  const today = '2026-11-21';
  const th = 'text-align: left; padding: 6px 16px; font: 500 11px var(--font-ui); color: var(--muted); border-bottom: 1px solid var(--line)';
  const td = 'padding: 8px 16px; border-bottom: 1px solid var(--line-soft); vertical-align: middle';
</script>

<script lang="ts">
  let name = $state('Ann Rattanakul');
  let email = $state('ann@example.com');
  let goal = $state<string | undefined>('strength');
  let bodyweight = $state<number | null>(62.5);
  let start = $state('2026-11-23');
  let limits = $state('Left knee: no deep flexion under load.');

  let query = $state('');
  let sort = $state<string | undefined>('recent');

  let log = $state([
    { name: 'Back squat', note: 'Felt quick off the floor', role: 'main' as string | undefined, reps: 5, kg: 102.5 as number | null, plan: 100 },
    { name: 'Romanian deadlift', note: '', role: 'secondary' as string | undefined, reps: 8, kg: 80 as number | null, plan: 80 },
  ]);

  let session = $state('Lower A · squat focus');
  let aliases = $state(['Back squat', 'BB squat']);
</script>

<Story name="Client profile form" asChild>
  <form class="tg-form" onsubmit={(e) => e.preventDefault()}>
    <InputField label="Name" bind:value={name} autocomplete="name" required />
    <InputField label="Email" type="email" bind:value={email} autocomplete="email" hint="The portal link goes to this address." />
    <SelectField label="Primary goal" options={goals} bind:value={goal} maxWidth="none" />
    <InputUnit label="Bodyweight" unit="kg" bind:value={bodyweight} step={0.5} min={30} max={250} />
    <InputDate label="Week 1 starts" bind:value={start} {today} mondayOnly />
    <div class="wide"><InputNote label="Limitations" bind:value={limits} hint="The AI avoids anything listed here." /></div>
    <div class="wide acts">
      <Button variant="primary" type="submit">Save</Button>
      <Button type="button">Cancel</Button>
    </div>
  </form>
</Story>

<Story name="List toolbar" asChild>
  <div class="tg-bar">
    <div class="s"><InputSearch label="Search clients" bind:value={query} shortcut="/" count={query ? '3 of 19' : undefined} /></div>
    <div class="p"><SelectPrefixed prefix="Sort" options={sorts} bind:value={sort} /></div>
    <div class="b"><Button>{#snippet icon()}<Icon name="plus" />{/snippet}New client</Button></div>
  </div>
</Story>

<Story name="Log table row" asChild>
  <div style="max-width: 900px">
    <Panel title="Lower A" count="Thu 19 Nov">
      <div style="overflow-x: auto">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px">
          <thead>
            <tr>
              <th style={th}>Exercise</th>
              <th style={th}>Note</th>
              <th style={th}>Role</th>
              <th style={th}>Reps</th>
              <th style={th}>kg vs plan</th>
            </tr>
          </thead>
          <tbody>
            {#each log as r (r.name)}
              <tr>
                <td style="{td}; white-space: nowrap; font-weight: 600">{r.name}</td>
                <td style="{td}; min-width: 200px; width: 100%"><InputCell label="Note for {r.name}" bind:value={r.note} placeholder="Add note" /></td>
                <td style={td}><SelectCell label="Role for {r.name}" options={roles} bind:value={r.role} /></td>
                <td style={td}><SelectStepper label="Reps for {r.name}" values={reps} bind:value={r.reps} unit="reps" /></td>
                <td style="{td}; min-width: 280px"><InputDiff label="Load for {r.name}" bind:value={r.kg} baseline={r.plan} unit="kg" step={2.5} hideLabel /></td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </Panel>
  </div>
</Story>

<Story name="Panel head and settings" asChild>
  <div style="max-width: 560px">
    <Panel>
      <div class="panel-head">
        <InputRename bind:value={session} thing="session" size="row" tag="h2" />
        <span class="counter">5 exercises</span>
      </div>
      <div class="panel-body tg-stack">
        <InputCopy label="Portal link" value="https://pt.pinroj.com/portal/c/ann-rattanakul?k=7f3a92c4e1b04d6f9a2e5b7c8d1f0a3b" hint="Send it in LINE." />
        <InputTags label="Also called" bind:tags={aliases} hint="Search finds the exercise by any of these." />
      </div>
    </Panel>
  </div>
</Story>

<style>
  .tg-form {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px 20px;
    align-items: start;
    max-width: var(--measure-form);
  }
  .wide { grid-column: 1 / -1; }
  .acts { display: flex; gap: 8px; }
  .tg-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; max-width: 760px; }
  .tg-bar .s { flex: 1 1 240px; max-width: 320px; }
  .tg-bar .p { width: 220px; }
  .tg-bar .b { margin-left: auto; }
  .tg-stack { display: grid; gap: 16px; }
  @media (max-width: 720px) {
    .tg-form { grid-template-columns: minmax(0, 1fr); }
    .tg-bar .s { max-width: none; flex-basis: 100%; }
    .tg-bar .p { flex: 1; }
  }
</style>
