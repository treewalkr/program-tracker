<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { computeHrZones, profileZones } from '@pt/shared';
  import ClientHrProfile from './ClientHrProfile.svelte';
  import type { HrProfileDto, HrProfileInputDto } from '$lib/api/types';

  const { Story } = defineMeta({
    title: 'Domain/ClientHrProfile',
    component: ClientHrProfile,
    parameters: {
      docs: {
        description: {
          component:
            "The member's heart-rate zones on their settings. Versioned, never edited in place: \"New version\" copies the current inputs, the method is a Segmented choice, and the zone table previews live. A version starts on a date, so earlier sessions keep the zones they were prescribed against.",
        },
      },
    },
  });

  const today = '2026-11-22';
  const v = (version: number, effectiveFrom: string, method: 'hrmax' | 'karvonen', restingHr: number | null): HrProfileDto => ({
    id: `hr-${version}`,
    clientId: 'cl-nok',
    version,
    effectiveFrom,
    method,
    restingHr,
    maxHr: 188,
    maxHrTestedOn: '2026-09-28',
    lthr: null,
    zones: computeHrZones(method, { restingHr, maxHr: 188 })!,
    createdAt: `${effectiveFrom}T09:00:00.000Z`,
  });
  /** v3 starts before v2 (a lab test entered on its test date): v2 stays in effect, history lists by start. */
  const backdated = (): HrProfileDto[] => [...two, { ...v(3, '2026-11-01', 'hrmax', null), id: 'hr-3' }];
  const two = [v(1, '2026-10-12', 'hrmax', null), v(2, '2026-11-12', 'karvonen', 58)];
  const save = async (input: HrProfileInputDto): Promise<HrProfileDto> => ({ ...two[1], id: 'hr-3', version: 3, ...input, restingHr: input.restingHr ?? null, maxHr: input.maxHr ?? null, maxHrTestedOn: input.maxHrTestedOn ?? null, lthr: input.lthr ?? null, zones: profileZones(input)! });
</script>

<Story name="Two versions" asChild>
  <div style="max-width: 760px"><ClientHrProfile versions={two} {today} onsave={save} /></div>
</Story>

<Story name="Backdated version" asChild>
  <div style="max-width: 760px"><ClientHrProfile versions={backdated()} {today} onsave={save} /></div>
</Story>

<Story name="No zones yet" asChild>
  <div style="max-width: 760px"><ClientHrProfile versions={[]} {today} onsave={save} /></div>
</Story>

<Story name="Loading" asChild>
  <div style="max-width: 760px"><ClientHrProfile versions={null} {today} onsave={save} /></div>
</Story>
