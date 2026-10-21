<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import WeekGrid, { type ClientRow, type WeekEntry } from './WeekGrid.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import type { ClientDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/WeekGrid',
    component: WeekGrid,
    parameters: {
      docs: {
        description: {
          component:
            'Contributions-style training-week grid. Green = logged, blue ring = due today, red = missed, grey = upcoming. Columns before `today` dim in the header.',
        },
      },
    },
  });

  // Week of Mon 2026-10-12 … Sun 2026-10-18, today Thursday.
  const weekDates = ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18'];
  const today = '2026-10-15';

  const client = (id: string, name: string, days: number[], status: ClientDto['status'] = 'active'): ClientDto => ({
    id,
    name,
    email: `${id}@example.com`,
    status,
    goals: null,
    limitations: null,
    daysPerWeek: days.length,
    trainingDays: days,
  });

  const entry = (day: number, clientId: string, sessionName: string, status: WeekEntry['status']): WeekEntry => ({
    day,
    clientId,
    sessionName,
    status,
  });

  const rows: ClientRow[] = [
    {
      client: client('maya', 'Maya Chen', [1, 2, 4]),
      program: 'Strength Base B',
      entries: new Map([
        [1, entry(1, 'maya', 'Day 1 — Upper', 'logged')],
        [2, entry(2, 'maya', 'Day 2 — Lower', 'logged')],
        [4, entry(4, 'maya', 'Day 3 — Full-body', 'today')],
      ]),
    },
    {
      client: client('jonas', 'Jonas Berg', [1, 3, 5, 6]),
      program: 'Hypertrophy Wave',
      entries: new Map([
        [1, entry(1, 'jonas', 'Push', 'logged')],
        [3, entry(3, 'jonas', 'Pull', 'due')],
        [5, entry(5, 'jonas', 'Legs', 'upcoming')],
        [6, entry(6, 'jonas', 'Conditioning', 'upcoming')],
      ]),
    },
    {
      client: client('priya', 'Priya Nair', [], 'paused'),
      program: null,
      entries: new Map(),
    },
  ];

  const currentNames: Record<string, string> = { maya: 'Strength Base B', jonas: 'Hypertrophy Wave', priya: '—' };
</script>

{#snippet template(args: { rows: ClientRow[]; weekDates: string[]; today: string; currentNames: Record<string, string> })}
  <div style="max-width: 760px;">
    <Panel title="Training week" count="3 of 7 logged">
      <WeekGrid {...args} />
    </Panel>
  </div>
{/snippet}

<Story name="Mixed week" {template} args={{ rows, weekDates, today, currentNames }} />
