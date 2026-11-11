<script module lang="ts">
  import { defineMeta } from '@storybook/addon-svelte-csf';
  import Pager from './Pager.svelte';

  const { Story } = defineMeta({
    title: 'UI/Pager',
    component: Pager,
    parameters: {
      docs: {
        description: {
          component:
            'Panel-foot pager for every list: row range, rows per page (10 / 25 / 50), Previous / Next and "Page n of m" where there is room. Hidden while the list fits the smallest page.',
        },
      },
    },
  });
</script>

<script>
  let page = $state(2);
  let limit = $state(10);
  let total = $state(19);
</script>

<Story name="Second of two pages" asChild>
  <section class="panel">
    <div class="panel-body">Rows {(page - 1) * limit + 1}… of {total}</div>
    <Pager {page} {limit} {total} onpage={(p) => (page = p)} onlimit={(l) => ((limit = l), (page = 1))} noun="Clients" />
  </section>
</Story>

<Story name="Long list" asChild>
  <section class="panel">
    <div class="panel-body">A 312-exercise library at 25 a page.</div>
    <Pager page={5} limit={25} total={312} onpage={() => {}} onlimit={() => {}} />
  </section>
</Story>

<Story name="Without a rows select" asChild>
  <section class="panel">
    <div class="panel-body">No <code>onlimit</code>: Previous / Next only.</div>
    <Pager page={1} limit={10} total={42} onpage={() => {}} />
  </section>
</Story>

<Story name="Hidden when one page" asChild>
  <section class="panel">
    <div class="panel-body">8 rows fit the smallest page — no pager below.</div>
    <Pager page={1} limit={10} total={8} onpage={() => {}} onlimit={() => {}} />
  </section>
</Story>

<Story name="Empty" asChild>
  <section class="panel">
    <div class="panel-body">Nothing to page.</div>
    <Pager page={1} limit={10} total={0} onpage={() => {}} />
  </section>
</Story>
