<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  const { Story } = defineMeta({
    title: 'UI/Button',
    component: Button,
    parameters: {
      docs: {
        description: {
          component:
            'Primer button. `variant="primary"` is the one green action per screen state — reserve it for the verb that advances the review flow (Generate draft, Approve as draft program, Save).',
        },
      },
    },
  });
</script>

{#snippet template(args: Record<string, any>)}
  <Button {...args}>Save profile</Button>
{/snippet}

<Story name="Default" {template} />
<Story name="Primary" {template} args={{ variant: 'primary' }} />
<Story name="Danger" {template} args={{ variant: 'danger' }} />
<Story name="Ghost" {template} args={{ variant: 'ghost' }} />
<Story name="Small" {template} args={{ small: true }} />
<Story name="Disabled" {template} args={{ variant: 'primary', disabled: true }} />
<Story name="Ghost danger" {template} args={{ variant: 'danger', class: 'ghost', small: true }} />
<Story name="As link" {template} args={{ href: '/clients' }} />

{#snippet sparkleTemplate(args: Record<string, any>)}
  <Button {...args}>
    {#snippet icon()}<Icon name="sparkle" />{/snippet}
    Generate draft
  </Button>
{/snippet}
<Story name="With icon" template={sparkleTemplate} args={{ variant: 'primary' }} />
