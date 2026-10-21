<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import { EXERCISE_ROLES } from '@pt/shared';
  import RoleChip from './RoleChip.svelte';

  const { Story } = defineMeta({
    title: 'Domain/RoleChip',
    component: RoleChip,
    parameters: {
      docs: {
        description: {
          component:
            'Session-slot chip for an exercise — Power / Primary / Str / Aux / Core in the trainer’s own shorthand. Neutral well pill; the primary lift reads in default ink. Hover for the full description.',
        },
      },
    },
  });
</script>

<Story name="Power" args={{ role: 'power' }} />
<Story name="Primary" args={{ role: 'primary' }} />
<Story name="Strength" args={{ role: 'strength' }} />
<Story name="Accessory" args={{ role: 'accessory' }} />
<Story name="Core" args={{ role: 'core' }} />

<Story name="Session order" asChild>
  <div style="display: flex; flex-wrap: wrap; gap: 5px;">
    {#each EXERCISE_ROLES as role (role)}
      <RoleChip {role} />
    {/each}
  </div>
</Story>

<Story name="In an exercise row" asChild>
  <div class="session" style="max-width: 420px;">
    <div class="session-body">
      <div class="exrow"><div class="ex"><RoleChip role="primary" /> Back Squat</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="strength" /> Romanian Deadlift</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="accessory" /> Leg Curl</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="core" /> Plank</div></div>
      <div class="exrow"><div class="ex">Unlabelled (older program)</div></div>
    </div>
  </div>
</Story>
