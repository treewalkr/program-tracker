<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import DraftBanner from './DraftBanner.svelte';
  import Button from '$lib/ui/Button.svelte';

  const { Story } = defineMeta({
    title: 'Domain/DraftBanner',
    component: DraftBanner,
    tags: ['autodocs'],
    parameters: {
      docs: {
        description: {
          component:
            "Where a member's AI draft stands, on the member page and the generate form. Versions are the draft's revision number (v2 = the second draft), not the program's.",
        },
      },
    },
  });
</script>

<Story name="Draft ready" asChild>
  <DraftBanner title="Draft v2 ready" text="Maya's next block is waiting for your review.">
    {#snippet actions()}<Button small href="#review">Review</Button>{/snippet}
  </DraftBanner>
</Story>

<Story name="Approved, not active" asChild>
  <DraftBanner title="v2 approved, not active" text="“Strength Base B” — Maya can't see it yet, and new drafts can't build on it until you activate it.">
    {#snippet actions()}
      <Button small href="#program">Open</Button>
      <Button small type="button">Activate</Button>
    {/snippet}
  </DraftBanner>
</Story>

<Story name="Live" asChild>
  <DraftBanner tone="done" title="v2 is live." text="Maya can see it now. New drafts build on it." />
</Story>

<Story name="Cancelled" asChild>
  <DraftBanner tone="quiet" title="Generation cancelled." text="Nothing was drafted — your brief is kept below." />
</Story>

<Story name="Phone width" asChild parameters={{ viewport: { defaultViewport: 'mobile1' } }}>
  <div style="max-width: 343px">
    <DraftBanner title="v2 approved, not active" text="“Strength Base B” — Maya can't see it yet.">
      {#snippet actions()}
        <Button small href="#program">Open</Button>
        <Button small type="button">Activate</Button>
      {/snippet}
    </DraftBanner>
  </div>
</Story>
