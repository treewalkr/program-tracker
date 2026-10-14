<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Icon, { type IconName } from './Icon.svelte';

  const { Story } = defineMeta({
    title: 'UI/Icon',
    component: Icon,
    parameters: {
      docs: {
        description: {
          component:
            'The app stroke-icon set — 24×24 viewBox, currentColor, sized by context CSS (`.btn svg` 14px, nav 16px, `.tchip svg` 12px). Pass `size` only for standalone use.',
        },
      },
    },
  });

  const NAMES: IconName[] = [
    'plus',
    'x',
    'check',
    'sparkle',
    'grid',
    'users',
    'dumbbell',
    'layers',
    'lock',
    'bolt',
    'pulse',
  ];
</script>

{#snippet template(args: { name: IconName; size?: number; label?: string })}
  <Icon {...args} size={args.size ?? 24} />
{/snippet}

<Story name="Gallery" asChild>
  <div class="icon-grid">
    {#each NAMES as name (name)}
      <figure>
        <Icon {name} size={24} />
        <figcaption>{name}</figcaption>
      </figure>
    {/each}
  </div>
  <style>
    .icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
      gap: 10px;
    }
    figure {
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 12px 8px;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--ink);
    }
    figcaption {
      font: 500 12px var(--font-ui);
      color: var(--muted);
    }
  </style>
</Story>

<Story name="Labeled" {template} args={{ name: 'lock', label: 'Locked' }} />
