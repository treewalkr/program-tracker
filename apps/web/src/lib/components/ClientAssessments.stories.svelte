<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { cooperVo2, VO2_FORMULAS } from '@pt/shared';
  import ClientAssessments from './ClientAssessments.svelte';
  import type { AssessmentDto, AssessmentInput } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/ClientAssessments',
    component: ClientAssessments,
    parameters: {
      docs: {
        description: {
          component:
            "The member's VO₂max field tests. The protocol is a Select 07 (described options); the inputs change with it, and the estimate updates live from the shared formula (labelled estimated, with its formula version). History charts one protocol at a time in LiftChart, with a Segmented switch when there's more than one.",
        },
      },
    },
  });

  const cooper = (id: string, testedOn: string, distanceM: number) =>
    ({ id, clientId: 'cl-nok', protocol: 'cooper_12min', formulaVersion: VO2_FORMULAS.cooper_12min.version, testedOn, inputs: { distanceM }, result: cooperVo2(distanceM), notes: null, createdAt: `${testedOn}T09:00:00Z`, updatedAt: `${testedOn}T09:00:00Z` }) as AssessmentDto;
  const three = [cooper('a1', '2026-09-22', 2350), cooper('a2', '2026-10-20', 2480), cooper('a3', '2026-11-21', 2560)];
  const nok = { firstName: 'Nok', sex: 'female' as const, birthDate: '1991-04-12', weightKg: 61.5 };
  const create = async (input: AssessmentInput) => ({ ...three[2], id: 'new', ...input, result: 46.1 }) as AssessmentDto;
  const remove = async () => {};
</script>

<script lang="ts">
  // Saves and deletes really change the list, so the "Saved" note can be seen to clear when its test is deleted.
  let live = $state<AssessmentDto[]>([...three]);
  let n = 0;
  const createLive = async (input: AssessmentInput) => {
    const row = { ...three[2], id: `live-${++n}`, ...input, result: 46.1 } as AssessmentDto;
    live = [...live, row];
    return row;
  };
  const removeLive = async (id: string) => {
    live = live.filter((a) => a.id !== id);
  };
</script>

<Story name="Save, then delete" asChild>
  <ClientAssessments member={nok} assessments={live} today="2026-11-22" oncreate={createLive} ondelete={removeLive} />
</Story>

<Story name="Three Cooper tests" asChild>
  <ClientAssessments member={nok} assessments={three} today="2026-11-22" oncreate={create} ondelete={remove} />
</Story>

<Story name="First test" asChild>
  <ClientAssessments member={nok} assessments={[]} today="2026-11-22" oncreate={create} ondelete={remove} />
</Story>

<Story name="No sex recorded" asChild>
  <ClientAssessments member={{ ...nok, sex: null }} assessments={[]} today="2026-11-22" oncreate={create} ondelete={remove} />
</Story>
