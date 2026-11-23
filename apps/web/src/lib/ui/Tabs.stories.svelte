<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Tabs from './Tabs.svelte';

  const { Story } = defineMeta({
    title: 'UI/Tabs',
    component: Tabs,
    parameters: {
      docs: {
        description: {
          component:
            'Orange-underline tabs (Tab Coral — the system\'s only warm flourish). Tabs carry counters citing their evidence; disabled tabs dim to 50%. Keyboard: one tab stop on the selected tab; ←/→ move (wrapping), Home/End jump to the ends, disabled tabs are skipped. Arrows select as they move unless `activation="manual"`, where Enter/Space selects — use that when a switch navigates.',
        },
      },
    },
  });
</script>

<script>
  let tab = $state('program');
  let manualTab = $state('program');
  const items = [
    { id: 'program', label: 'Program', count: '4 days' },
    { id: 'pulse', label: 'Pulse', count: '8 wks' },
    { id: 'history', label: 'History', count: '8 wks' },
    { id: 'settings', label: 'Settings' },
  ];
</script>

<Story name="Client sections" asChild>
  <div>
    <Tabs items={items} value={tab} onchange={(id) => (tab = id)} label="Client sections" />
    <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} class="body">
      {tab} panel content
    </div>
  </div>
</Story>

<Story name="Disabled tab" asChild>
  <Tabs
    items={[
      { id: 'program', label: 'Program', count: '4 days' },
      { id: 'pulse', label: 'Pulse', count: '0 wks', disabled: true },
    ]}
    value="program"
  />
</Story>

<Story name="Manual activation" asChild>
  <div>
    <Tabs
      items={items}
      value={manualTab}
      onchange={(id) => (manualTab = id)}
      label="Client sections (manual)"
      idPrefix="manual"
      activation="manual"
    />
    <div id={`panel-${manualTab}`} role="tabpanel" aria-labelledby={`manual-${manualTab}`} class="body">
      Arrows move focus; Enter or Space opens {manualTab}
    </div>
  </div>
</Story>

<style>
  .body {
    padding: 16px;
    color: var(--muted);
    font-size: 14px;
  }
</style>
