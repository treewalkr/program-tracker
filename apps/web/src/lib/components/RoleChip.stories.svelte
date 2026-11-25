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
            'Role chip for an exercise — Prep / Plyo / Power / Primary / Secondary / Str / Supp / Aux / Core / Cond / Mob, or one of the trainer’s own labels, in their shorthand. Neutral well pill; the primary lift reads in default ink. Hover for the meaning.',
        },
      },
    },
  });
</script>

<Story name="Movement Prep" args={{ role: 'movement_prep' }} />
<Story name="Plyometric" args={{ role: 'plyometric' }} />
<Story name="Power" args={{ role: 'power' }} />
<Story name="Primary" args={{ role: 'primary' }} />
<Story name="Secondary" args={{ role: 'secondary' }} />
<Story name="Strength" args={{ role: 'strength' }} />
<Story name="Strength / Supplemental" args={{ role: 'supplemental' }} />
<Story name="Auxiliary" args={{ role: 'accessory' }} />
<Story name="Core" args={{ role: 'core' }} />
<Story name="Conditioning" args={{ role: 'conditioning' }} />
<Story name="Mobility / Recovery" args={{ role: 'mobility' }} />

<Story name="Label order" asChild>
  <div style="display: flex; flex-wrap: wrap; gap: 5px;">
    {#each EXERCISE_ROLES as role (role)}
      <RoleChip {role} />
    {/each}
  </div>
</Story>

<Story name="In an exercise row" asChild>
  <div class="session" style="max-width: 420px;">
    <div class="session-body">
      <div class="exrow"><div class="ex"><RoleChip role="movement_prep" /> Glute Activation</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="plyometric" /> Pogo Jump</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="primary" /> Back Squat</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="secondary" /> Bench Press</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="strength" /> Romanian Deadlift</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="supplemental" /> Paused Squat</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="accessory" /> Leg Curl</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="core" /> Plank</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="conditioning" /> Assault Bike</div></div>
      <div class="exrow"><div class="ex"><RoleChip role="mobility" /> Hip Flexor Stretch</div></div>
      <div class="exrow"><div class="ex">Unlabelled (older program)</div></div>
    </div>
  </div>
</Story>
