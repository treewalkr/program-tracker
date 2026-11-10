<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { dayIntensityLevels } from '@pt/shared';
  import WeekGrid, { type ClientStrip, type StripDay, type StripSession } from './WeekGrid.svelte';
  import Panel from '$lib/ui/Panel.svelte';
  import { exceptionOrder, stripWeeks, weekTally } from '$lib/overview';
  import type { ClientDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/WeekGrid',
    component: WeekGrid,
    parameters: {
      docs: {
        description: {
          component:
            'Contributions grid: five past weeks as squares shaded by logged volume vs the client\'s usual day (done-1 → done-4; red edge = missed, hairline = planned), then this week as labelled cells (green = done, blue ring = due today, red = missed, grey = upcoming). Rows sort missed → due today → on track; clients with nothing this week collapse into one line. Hover/focus a day for its sessions; click (tap) pins it, with Log links for due sessions.',
        },
      },
    },
  });

  // Week of Mon 2026-10-12 … Sun 2026-10-18, today Thursday; history from Sep 7.
  const today = '2026-10-15';
  const weeks = stripWeeks(new Date(2026, 9, 15, 9));

  /** Deterministic noise so stories don't shift between renders. */
  function rng(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  interface Spec {
    id: string;
    name: string;
    /** weekday (1=Mon) → session names placed that day */
    plan?: Record<number, string[]>;
    program?: string | null;
    /** 0–1 chance a past session was skipped */
    skip?: number;
    /** Force every past and today's session logged / missed. */
    all?: 'logged' | 'missed';
    cardio?: ClientStrip['cardio'];
    unscheduled?: number;
    status?: ClientDto['status'];
    seed?: number;
  }

  function strip(spec: Spec): ClientStrip {
    const r = rng(spec.seed ?? spec.id.length * 7919);
    const plan = spec.plan ?? {};
    const days: StripDay[][] = weeks.map((w) =>
      w.map((date, i): StripDay => {
        const names = plan[i + 1] ?? [];
        const sessions: StripSession[] = names.map((name, k) => {
          const id = `${spec.id}-${i + 1}-${k}`;
          let status: StripSession['status'] =
            date > today ? 'upcoming' : date === today ? 'today' : r() < (spec.skip ?? 0.15) ? 'missed' : 'logged';
          if (spec.all && date <= today) status = spec.all;
          return { id, name, status, planned: true };
        });
        const logged = sessions.some((s) => s.status === 'logged');
        const worst = (['missed', 'today', 'upcoming', 'logged'] as const).find((st) => sessions.some((s) => s.status === st));
        return {
          date,
          weekday: i + 1,
          status: worst ?? 'rest',
          sessions,
          volume: logged ? { basis: 'tonnage' as const, amount: Math.round(2500 + r() * 4000) } : null,
          level: 0,
          openSessionId: sessions.find((s) => s.status !== 'logged')?.id ?? undefined,
        };
      })
    );
    const flat = days.flat();
    dayIntensityLevels(flat.map((d) => d.volume)).forEach((l, i) => (flat[i].level = l));
    const now = days[days.length - 1];
    const exception: ClientStrip['exception'] = now.some((d) => d.status === 'missed')
      ? 'missed'
      : now.some((d) => d.status === 'today')
        ? 'today'
        : now.some((d) => d.sessions.length) || spec.unscheduled
          ? 'on-track'
          : 'none';
    const client: ClientDto = {
      id: spec.id,
      name: spec.name,
      email: `${spec.id}@example.com`,
      status: spec.status ?? 'active',
      goals: null,
      limitations: null,
      sessionsPerWeek: Object.values(plan).flat().length || null,
      trainingDays: Object.keys(plan).map(Number),
    };
    return {
      client,
      program: spec.program === undefined ? 'Strength Base B' : spec.program,
      weeks: days,
      unscheduled: spec.unscheduled ?? 0,
      cardio: spec.cardio ?? null,
      exception,
    };
  }

  const three = exceptionOrder([
    strip({ id: 'maya', name: 'Maya Chen', plan: { 1: ['Upper'], 2: ['Lower'], 4: ['Full body', 'Zone 2 bike'] }, unscheduled: 1, cardio: { done: 40, target: 120, unitLabel: 'min' } }),
    strip({ id: 'jonas', name: 'Jonas Berg', program: 'Hypertrophy Wave', plan: { 1: ['Push'], 3: ['Pull'], 5: ['Legs'], 6: ['Conditioning'] }, all: undefined, skip: 0.3, seed: 3 }),
    strip({ id: 'priya', name: 'Priya Nair', program: null, status: 'paused' }),
  ]);

  const NAMES = [
    'Ava Lindqvist', 'Ben Okafor', 'Chloé Martin', 'Dev Patel', 'Elif Kaya', 'Femi Adeyemi', 'Grace Liu', 'Hugo Moreau',
    'Isla Murphy', 'Jae-won Park', 'Kofi Mensah', 'Lena Fischer', 'Mateo Rossi', 'Nora Haddad', 'Omar Siddiqui', 'Pia Nyström',
    'Quinn Taylor', 'Rosa Jiménez', 'Sven Holm', 'Tara Singh', 'Umar Farouk', 'Vera Novak', 'Wen Zhao', 'Ximena Ruiz', 'Yusuf Demir',
  ];
  const PLANS: Record<number, string[]>[] = [
    { 1: ['Upper'], 3: ['Lower'], 5: ['Full body'] },
    { 2: ['Push'], 4: ['Pull'], 6: ['Legs'] },
    { 1: ['Lower — squat'], 4: ['Upper — press'] },
    { 1: ['Strength A'], 2: ['Zone 2 run'], 4: ['Strength B'], 7: ['Long ride'] },
  ];
  const many = exceptionOrder(
    NAMES.map((name, i) =>
      i % 9 === 8
        ? strip({ id: `c${i}`, name, program: null })
        : strip({ id: `c${i}`, name, plan: PLANS[i % PLANS.length], skip: (i % 5) * 0.08, seed: i + 1 })
    )
  );

  const noProgram = [
    strip({ id: 'priya', name: 'Priya Nair', program: null, status: 'paused' }),
    strip({ id: 'sam', name: 'Sam Ortiz', program: null }),
  ];

  const allLogged = exceptionOrder([
    strip({ id: 'maya', name: 'Maya Chen', plan: { 1: ['Upper'], 2: ['Lower'], 4: ['Full body'] }, all: 'logged' }),
    strip({ id: 'jonas', name: 'Jonas Berg', plan: { 1: ['Push'], 3: ['Pull'], 5: ['Legs'] }, all: 'logged', seed: 11 }),
  ]);

  const allMissed = exceptionOrder([
    strip({ id: 'maya', name: 'Maya Chen', plan: { 1: ['Upper'], 2: ['Lower'], 4: ['Full body'] }, all: 'missed' }),
    strip({ id: 'jonas', name: 'Jonas Berg', plan: { 1: ['Push'], 3: ['Pull'], 5: ['Legs'] }, all: 'missed', seed: 11 }),
  ]);

  const multi = exceptionOrder([
    strip({ id: 'nat', name: 'Nattapong W.', plan: { 1: ['Back / Biceps', 'Zone 2 run'], 2: ['Core / VO2max', 'Mobility'], 4: ['Chest / Triceps', 'Intervals', 'Stretch'] }, cardio: { done: 35, target: 180, unitLabel: 'min' } }),
    strip({ id: 'maya', name: 'Maya Chen', plan: { 3: ['Full body', 'Zone 2 bike'], 5: ['Upper', 'Lower'] }, seed: 5 }),
  ]);

  const countOf = (strips: ClientStrip[]) => {
    const t = weekTally(strips);
    return [t.dueToday ? `${t.dueToday} due today` : null, t.missed ? `${t.missed} missed` : null].filter(Boolean).join(' · ') || (t.planned ? 'all on track' : undefined);
  };
</script>

{#snippet template(args: { strips: ClientStrip[]; today: string })}
  <div style="max-width: 1140px;">
    <Panel title="Training week" count={countOf(args.strips)}>
      <WeekGrid {...args} />
    </Panel>
  </div>
{/snippet}

{#snippet narrow(args: { strips: ClientStrip[]; today: string })}
  <div style="max-width: 360px;">
    <Panel title="Training week" count={countOf(args.strips)}>
      <WeekGrid {...args} />
    </Panel>
  </div>
{/snippet}

<Story name="Three clients" {template} args={{ strips: three, today }} />

<Story name="25 clients" exportName="TwentyFiveClients" {template} args={{ strips: many, today }} />

<Story name="No program" {template} args={{ strips: noProgram, today }} />

<Story name="All logged" {template} args={{ strips: allLogged, today }} />

<Story name="All missed" {template} args={{ strips: allMissed, today }} />

<Story name="Multi-session days" {template} args={{ strips: multi, today }} />

<Story name="Narrow" template={narrow} args={{ strips: three, today }} />
