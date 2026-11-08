<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { VOCAB_TABS, parseVocabTab, type VocabTab } from "$lib/vocabulary";
  import AliasesTab from "$lib/components/vocabulary/AliasesTab.svelte";
  import GlossaryTab from "$lib/components/vocabulary/GlossaryTab.svelte";
  import RoleLabelsTab from "$lib/components/vocabulary/RoleLabelsTab.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";
  import Tabs from "$lib/ui/Tabs.svelte";

  /** Vocabulary: the trainer's words — aliases, glossary, role labels. ?tab= keeps the tab linkable. */
  const tab = $derived(parseVocabTab(page.url.searchParams.get("tab")));

  function setTab(id: string) {
    const url = new URL(page.url);
    url.searchParams.set("tab", id as VocabTab);
    goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  }
</script>

<svelte:head><title>Vocabulary · Program Tracker</title></svelte:head>

<PageHead
  title="Vocabulary"
  sub="The words you write in your notes. Aliases tie your names to exercises, the glossary explains your shorthand when notes are imported, and role labels say what each exercise is for."
/>

<div class="tabs-wrap">
  <Tabs items={[...VOCAB_TABS]} value={tab} onchange={setTab} label="Vocabulary" idPrefix="vocab" />
</div>

<div role="tabpanel" id="panel-{tab}" aria-labelledby="vocab-{tab}">
  {#if tab === "aliases"}
    <AliasesTab />
  {:else if tab === "glossary"}
    <GlossaryTab />
  {:else}
    <RoleLabelsTab />
  {/if}
</div>

<style>
  .tabs-wrap { margin-bottom: 16px; }
</style>
