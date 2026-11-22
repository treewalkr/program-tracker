<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import PrepChecklist from './PrepChecklist.svelte';

  const { Story } = defineMeta({
    title: 'Domain/PrepChecklist',
    component: PrepChecklist,
    parameters: {
      docs: {
        description: {
          component:
            'Movement prep on a log: a tick per item, no kg, reps or RPE. It sits above the main sets on the trainer’s log page (`sheet`) and in the member portal (`touch`). Ticks are saved with the log; prep is never counted, and ticking prep alone is not a done session.',
        },
      },
    },
  });

  const items = [
    { id: 'p1', name: 'Easy bike', rx: '1 × 3:00' },
    { id: 'p2', name: '90/90 hip switch', rx: '2 × 6/side' },
    { id: 'p3', name: 'Glute bridge', rx: '2 × 10' },
    { id: 'p4', name: 'Pogo jump', rx: '2 × 10' },
  ];
</script>

<Story name="Sheet (trainer)" args={{ items, done: ['p1', 'p2'], variant: 'sheet' }} />
<Story name="Touch (portal)" args={{ items, done: ['p1'], variant: 'touch', title: 'เตรียมร่างกาย', tag: 'ติ๊กเมื่อทำเสร็จ' }} />
<Story name="None ticked" args={{ items, done: [], variant: 'sheet' }} />
