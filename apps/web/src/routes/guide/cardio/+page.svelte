<script lang="ts">
  import GuideBlocks from "$lib/guide/GuideBlocks.svelte";
  import GuideDoc from "$lib/guide/GuideDoc.svelte";
  import { rich } from "$lib/guide/rich";
  import { CARDIO_GUIDE } from "$lib/guide/cardio";
  import GuideSearchTrigger from "$lib/guide/GuideSearchTrigger.svelte";
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";

  const g = $derived(CARDIO_GUIDE[i18n.locale]);
  const toc = $derived(g.sections.map((s) => [s.id, s.h] as const));
</script>

<svelte:head><title>{g.title} guide · Program Tracker</title></svelte:head>

<PageHead title={g.title} sub={g.sub} crumbs={[{ href: "/guide", label: g.crumbs[0] }, { label: g.crumbs[1] }]}>
  {#snippet actions()}<GuideSearchTrigger variant="button" /><LangToggle compact />{/snippet}
</PageHead>

<GuideDoc {toc} onThisPage={g.onThisPage} lang={i18n.locale}>
  <p class="intro">{@html rich(g.intro)}</p>

  {#each g.sections as section (section.id)}
    <section id={section.id}>
      <h2>{section.h}</h2>
      <GuideBlocks blocks={section.blocks} />
    </section>
  {/each}
</GuideDoc>
