<script lang="ts">
  import type { Component } from "svelte";
  import AbWeeksFigure from "$lib/guide/AbWeeksFigure.svelte";
  import EditSpreadFigure from "$lib/guide/EditSpreadFigure.svelte";
  import GuideBlocks from "$lib/guide/GuideBlocks.svelte";
  import GuideDoc from "$lib/guide/GuideDoc.svelte";
  import MissedFigure from "$lib/guide/MissedFigure.svelte";
  import { PROGRAMS_GUIDE, type GuideFig } from "$lib/guide/programsWeeks";
  import { rich } from "$lib/guide/rich";
  import ShiftStartFigure from "$lib/guide/ShiftStartFigure.svelte";
  import WeekCalendarFigure from "$lib/guide/WeekCalendarFigure.svelte";
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";

  /** The drawn diagram for each `fig` block. */
  const FIGS: Record<GuideFig, Component> = {
    weeks: WeekCalendarFigure,
    edit: EditSpreadFigure,
    missed: MissedFigure,
    ab: AbWeeksFigure,
    shift: ShiftStartFigure,
  };

  const g = $derived(PROGRAMS_GUIDE[i18n.locale]);
  const toc = $derived(g.sections.map((s) => [s.id, s.h] as const));
</script>

<svelte:head><title>{g.title} guide · Program Tracker</title></svelte:head>

<PageHead title={g.title} sub={g.sub} crumbs={[{ href: "/guide", label: g.crumbs[0] }, { label: g.crumbs[1] }]}>
  {#snippet actions()}<LangToggle compact />{/snippet}
</PageHead>

<GuideDoc {toc} onThisPage={g.onThisPage} lang={i18n.locale}>
  <p class="intro">{@html rich(g.intro)}</p>

  {#each g.sections as section (section.id)}
    <section id={section.id}>
      <h2>{section.h}</h2>
      <GuideBlocks blocks={section.blocks} figs={FIGS} />
    </section>
  {/each}
</GuideDoc>
