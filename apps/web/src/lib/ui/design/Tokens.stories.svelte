<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Tokens from './Tokens.svelte';

  const { Story } = defineMeta({
    title: 'Design/Tokens',
    component: Tokens,
    parameters: {
      layout: 'padded',
      docs: {
        description: {
          component:
            'Primer token reference — reads live from the `:root` custom properties in `src/app.css`, so it cannot drift from the shipped system. Source of truth: `apps/web/DESIGN.md`.',
        },
      },
    },
  });
</script>

<Story name="All" />
<Story name="Canvas & ink" args={{ section: 'canvas' }} />
<Story name="Functional" args={{ section: 'functional' }} />
<Story name="Contributions ramp" args={{ section: 'ramp' }} />
<Story name="RPE scale" args={{ section: 'rpe' }} />
<Story name="Typography" args={{ section: 'type' }} />
<Story name="Radii & breakpoints" args={{ section: 'radii' }} />
<Story name="Named rules" args={{ section: 'rules' }} />
