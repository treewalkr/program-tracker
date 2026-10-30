<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import CopyButton from './CopyButton.svelte';

  const { Story } = defineMeta({
    title: 'Domain/CopyButton',
    component: CopyButton,
    tags: ['autodocs'],
  });
</script>

<Story name="Default">
  <CopyButton text="Strong week — all sessions logged. See you Monday!" />
</Story>

<Story name="Custom label" args={{ text: 'Next week: heavier top sets.', label: 'Copy message' }} />
