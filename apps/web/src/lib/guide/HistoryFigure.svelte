<script lang="ts">
  import Icon from "$lib/ui/Icon.svelte";
  import Panel from "$lib/ui/Panel.svelte";

  /** The member's History with one session logged by the member and one by the trainer (sample rows). */
  const rows = [
    { date: "Wed 12 Nov", name: "Upper A", byClient: true, meta: "20 sets · 58 min" },
    { date: "Mon 10 Nov", name: "Lower A", byClient: false, meta: "18 sets" },
  ];
</script>

<div class="wrap">
  <Panel title="Sessions" count={2}>
    <div class="wk-h"><span class="wk-name">Week 3</span><span class="subtle">2 sessions</span></div>
    <ul>
      {#each rows as r (r.name)}
        <li>
          <span class="chev"><Icon name="chevron" size={14} /></span>
          <span class="date">{r.date}</span>
          <span class="name">{r.name}</span>
          {#if r.byClient}<span class="pill neutral">by member</span>{/if}
          <span class="subtle meta">{r.meta}</span>
        </li>
      {/each}
    </ul>
  </Panel>
</div>

<style>
  .wrap { width: 100%; max-width: 560px; }
  .wk-h { display: flex; justify-content: space-between; padding: 8px 12px; background: var(--well); border-bottom: 1px solid var(--line-soft); font-size: 13px; }
  .wk-name { font-weight: 600; }
  .subtle { color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 9px 12px; border-top: 1px solid var(--line-soft); font-size: 14px; }
  li:first-child { border-top: 0; }
  .chev { color: var(--muted); display: inline-flex; }
  .date { font: 500 13px/1 var(--font-mono); color: var(--muted); white-space: nowrap; }
  .name { font-weight: 500; white-space: nowrap; }
  .meta { margin-left: auto; font-size: 13px; }
</style>
