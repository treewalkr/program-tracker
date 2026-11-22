<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import InputField from './InputField.svelte';

  const { Story } = defineMeta({
    title: 'UI/Input/01 Primer field',
    component: InputField,
    parameters: {
      docs: {
        description: {
          component:
            'The form default for single-line text: name, email, phone. Same box, 12px label and 32px height as Select 01, so they share a form column. The error line replaces the hint; with a length limit, a mono count appears in the label row once 10 characters are left. Tab moves in and out; nothing else is special.',
        },
      },
    },
  });
</script>

<script lang="ts">
  let name = $state('Ann Rattanakul');
  let email = $state('ann@');
  let blank = $state('');
  let program = $state('Off-season strength block');
  let phone = $state('');
</script>

<Story name="Default" asChild>
  <div style="max-width: 320px"><InputField label="Name" bind:value={name} autocomplete="name" /></div>
</Story>

<Story name="With hint" asChild>
  <div style="max-width: 320px"><InputField label="Email" type="email" bind:value={blank} placeholder="ann@example.com" hint="The portal link goes to this address." autocomplete="email" /></div>
</Story>

<Story name="Error" asChild>
  <div style="max-width: 320px"><InputField label="Email" type="email" bind:value={email} hint="The portal link goes to this address." error="Enter a full email address, like ann@example.com." /></div>
</Story>

<Story name="Near the limit" asChild>
  <div style="max-width: 320px"><InputField label="Program name" bind:value={program} maxlength={32} /></div>
</Story>

<Story name="Optional" asChild>
  <div style="max-width: 320px"><InputField label="Phone" type="tel" bind:value={phone} optional inputmode="tel" placeholder="081 234 5678" autocomplete="tel" /></div>
</Story>

<Story name="Read-only" asChild>
  <div style="max-width: 320px"><InputField label="Client id" value="cl_7f3a92" readonly hint="Set when the client was added." /></div>
</Story>

<Story name="Disabled" asChild>
  <div style="max-width: 320px"><InputField label="Name" value="Ann Rattanakul" disabled /></div>
</Story>

<Story name="Path, no spellcheck" asChild>
  <div style="max-width: 320px"><InputField label="Page" optional placeholder="/clients" autocomplete="off" spellcheck={false} /></div>
</Story>
