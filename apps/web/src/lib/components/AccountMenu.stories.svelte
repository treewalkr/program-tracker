<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import AccountMenu from './AccountMenu.svelte';

  const trainer = {
    id: 'tr-1',
    name: 'Somchai Prasert',
    email: 'somchai@example.com',
    avatarUrl: null,
    isAdmin: false,
  };

  const { Story } = defineMeta({
    title: 'Domain/AccountMenu',
    component: AccountMenu,
    tags: ['autodocs'],
    args: { trainer, live: true, build: '0.1.9+42a93f5', fresh: false, onSignOut: () => {} },
  });
</script>

<!-- The trigger sits in the sidebar foot; the frame mimics its 220px well. -->
<Story name="Live">
  {#snippet template(args)}
    <div style="width: 220px; margin-top: 320px; padding: 8px; background: var(--well)">
      <AccountMenu {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Demo data" args={{ live: false }}>
  {#snippet template(args)}
    <div style="width: 220px; margin-top: 320px; padding: 8px; background: var(--well)">
      <AccountMenu {...args} />
    </div>
  {/snippet}
</Story>

<Story name="New release" args={{ fresh: true }}>
  {#snippet template(args)}
    <div style="width: 220px; margin-top: 320px; padding: 8px; background: var(--well)">
      <AccountMenu {...args} />
    </div>
  {/snippet}
</Story>

<Story name="Rail" args={{ rail: true }}>
  {#snippet template(args)}
    <div style="width: 56px; margin-top: 320px; padding: 8px; background: var(--well)">
      <AccountMenu {...args} />
    </div>
  {/snippet}
</Story>
