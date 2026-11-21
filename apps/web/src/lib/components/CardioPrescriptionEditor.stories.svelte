<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { CARDIO_TEMPLATE_PRESETS, computeHrZones, fromCardioTemplate, cardioTemplatePreset, MODALITY_PRESETS, type CardioPrescription } from '@pt/shared';
  import CardioPrescriptionEditor from './CardioPrescriptionEditor.svelte';
  import type { CardioTemplatesDto, ModalityDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/CardioPrescriptionEditor',
    component: CardioPrescriptionEditor,
    parameters: {
      docs: {
        description: {
          component:
            'The cardio part of the session editor: template chips (a copy lands in the session), the modality (Select 06), the session RPE target (Select 05), steady-block targets or the interval builder, and the workload line the program save checks. Zones show in bpm when the member has an HR profile.',
        },
      },
    },
  });

  const modalities: ModalityDto[] = MODALITY_PRESETS.map((m) => ({ id: `md-${m.key}`, name: m.name, metric: m.metric, presetKey: m.key, archivedAt: null, usedIn: 0 }));
  const templates: CardioTemplatesDto = {
    presets: CARDIO_TEMPLATE_PRESETS.map((p) => ({ ...p, hidden: false })),
    templates: [
      { id: 'ct-1', trainerId: 'me', name: 'Hill repeats', prescription: { targetRpe: 8, durationMin: 40 }, basedOn: null, archivedAt: null, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' },
    ],
  };
  const zones = computeHrZones('karvonen', { restingHr: 58, maxHr: 188 });
  const save = async (input: { name: string }) => ({ ...templates.templates[0], id: 'ct-new', name: input.name });
</script>

<script lang="ts">
  let intervals = $state<CardioPrescription>({ ...fromCardioTemplate(cardioTemplatePreset('intervals')!, 'Running'), modalityId: 'md-running' });
  let steady = $state<CardioPrescription>({ modality: 'Cycling', durationMin: 60, hrZone: 2, targetRpe: 3 });
  let legacy = $state<CardioPrescription>({ modality: 'Cardio Zone 2–3', intensity: '40–60 min steady' });
</script>

<Story name="Intervals with bpm" asChild>
  <div style="max-width: 760px"><CardioPrescriptionEditor bind:cardio={intervals} {modalities} {templates} {zones} onsavetemplate={save} /></div>
</Story>

<Story name="Steady block, no HR profile" asChild>
  <div style="max-width: 760px"><CardioPrescriptionEditor bind:cardio={steady} {modalities} {templates} /></div>
</Story>

<Story name="Older session with no workload" asChild>
  <div style="max-width: 760px"><CardioPrescriptionEditor bind:cardio={legacy} {modalities} {templates} /></div>
</Story>
