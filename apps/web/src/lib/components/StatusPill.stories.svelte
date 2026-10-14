<script module>
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import StatusPill from './StatusPill.svelte';

  const { Story } = defineMeta({
    title: 'Domain/StatusPill',
    component: StatusPill,
    tags: ['autodocs'],
  });
</script>

<Story name="Active" args={{ status: 'active' }} />
<Story name="Paused" args={{ status: 'paused' }} />
<Story name="Archived" args={{ status: 'archived' }} />
<Story name="Draft" args={{ status: 'draft' }} />
<Story name="Validated" args={{ status: 'validated' }} />
<Story name="Approved" args={{ status: 'approved' }} />
<Story name="Rejected" args={{ status: 'rejected' }} />
<Story name="Failed validation" args={{ status: 'failed_validation' }} />
<Story name="Provider error" args={{ status: 'failed_provider' }} />
<Story name="Unknown status" args={{ status: 'quarantined' }} />
