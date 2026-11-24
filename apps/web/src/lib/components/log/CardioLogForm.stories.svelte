<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { cardioTemplatePreset, fromCardioTemplate, MODALITY_PRESETS } from '@pt/shared';
  import CardioLogForm from './CardioLogForm.svelte';
  import { cardioFormOf, emptyCardioForm, type CardioForm } from '$lib/cardioForm';

  const { Story } = defineMeta({
    title: 'Domain/CardioLogForm',
    component: CardioLogForm,
    parameters: {
      docs: {
        description: {
          component:
            'The cardio log, shared by the trainer’s log page (`sheet`) and the member portal (`touch`). Duration and session RPE are required; distance, heart rate and pain are optional; calories and per-interval results fold away. Pace and session load are calculated, never typed. "Didn’t do it" records a skip with its reason instead.',
        },
      },
    },
  });

  const modalities = MODALITY_PRESETS.map((m) => ({ name: m.name, metric: m.metric }));
  const intervals = fromCardioTemplate(cardioTemplatePreset('intervals')!, 'Running');
</script>

<script lang="ts">
  let fresh = $state<CardioForm>(cardioFormOf({ modality: 'Running', durationMin: 40 }));
  let filled = $state<CardioForm>({ ...emptyCardioForm('Running'), durationSec: 2110, rpe: 7, distanceKm: 5.2, avgHr: 151, maxHr: 176 });
  let reps = $state<CardioForm>({ ...cardioFormOf(intervals), rpe: 8 });
  let missing = $state<CardioForm>(cardioFormOf({ modality: 'Cycling', durationMin: 60 }));
  let skipped = $state<CardioForm>({ ...emptyCardioForm('Cycling'), skipped: 'time' });
  let touch = $state<CardioForm>(cardioFormOf({ modality: 'Run', durationMin: 30 }));
  let ride = $state<CardioForm>({ ...emptyCardioForm('Cycling'), durationSec: 3690, rpe: 4, distanceKm: 25.3 });
</script>

<Story name="From the plan" asChild>
  <div class="panel" style="max-width: 860px"><CardioLogForm bind:value={fresh} {modalities} metric="pace" /></div>
</Story>

<Story name="Filled (pace and load)" asChild>
  <div class="panel" style="max-width: 860px"><CardioLogForm bind:value={filled} {modalities} metric="pace" /></div>
</Story>

<Story name="Intervals (open the fold)" asChild>
  <div class="panel" style="max-width: 860px"><CardioLogForm bind:value={reps} {modalities} metric="pace" /></div>
</Story>

<Story name="RPE missing" asChild>
  <div class="panel" style="max-width: 860px"><CardioLogForm bind:value={missing} {modalities} metric="speed" problem="rpe" /></div>
</Story>

<!-- A ride's calculated line says "Speed" (a row's says "Split"), as the coach's review does. -->
<Story name="Ride (speed)" asChild>
  <div class="panel" style="max-width: 860px"><CardioLogForm bind:value={ride} {modalities} metric="speed" /></div>
</Story>

<Story name="Skipped" asChild>
  <div class="panel" style="max-width: 860px"><CardioLogForm bind:value={skipped} {modalities} /></div>
</Story>

<Story name="Portal (touch)" asChild>
  <div style="max-width: 390px; padding: 16px"><CardioLogForm bind:value={touch} variant="touch" metric="pace" /></div>
</Story>
