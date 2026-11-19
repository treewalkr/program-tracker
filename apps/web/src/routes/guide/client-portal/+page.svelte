<script lang="ts">
  import { GUIDE, GUIDE_IDS } from "$lib/guide/clientPortal";
  import Figure from "$lib/guide/Figure.svelte";
  import GuideDoc from "$lib/guide/GuideDoc.svelte";
  import HistoryFigure from "$lib/guide/HistoryFigure.svelte";
  import OverviewFigure from "$lib/guide/OverviewFigure.svelte";
  import PortalBoxFigure from "$lib/guide/PortalBoxFigure.svelte";
  import PortalLogFigure from "$lib/guide/PortalLogFigure.svelte";
  import PortalWeekFigure from "$lib/guide/PortalWeekFigure.svelte";
  import { rich } from "$lib/guide/rich";
  import GuideSearchTrigger from "$lib/guide/GuideSearchTrigger.svelte";
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";

  const g = $derived(GUIDE[i18n.locale]);
  const s = $derived(g.sections);
  const [setUp, clientSees, clientLogs, youSee, resetOff, stuck] = GUIDE_IDS;
  const toc = $derived([
    [setUp, s.setUp.h],
    [clientSees, s.clientSees.h],
    [clientLogs, s.clientLogs.h],
    [youSee, s.youSee.h],
    [resetOff, s.resetOff.h],
    [stuck, s.stuck.h],
  ] as const);
</script>

<svelte:head><title>{g.title} guide · Program Tracker</title></svelte:head>

<PageHead title={g.title} sub={g.sub} crumbs={[{ href: "/guide", label: g.crumbs[0] }, { label: g.crumbs[1] }]}>
  {#snippet actions()}<GuideSearchTrigger variant="button" /><LangToggle compact />{/snippet}
</PageHead>

<GuideDoc {toc} onThisPage={g.onThisPage} lang={i18n.locale}>

    <p class="intro">{@html rich(g.intro)}</p>

    <section id={setUp}>
      <h2>{s.setUp.h}</h2>
      <Figure caption={g.figures.box}><PortalBoxFigure /></Figure>
      <ol class="steps">
        {#each s.setUp.steps as step, i (i)}
          <li><h3>{@html rich(step.h)}</h3><p>{@html rich(step.p)}</p></li>
        {/each}
      </ol>
      <Figure caption={g.figures.overview}><OverviewFigure /></Figure>
      <p class="aside">{@html rich(s.setUp.aside)}</p>
    </section>

    <section id={clientSees}>
      <h2>{s.clientSees.h}</h2>
      <p>{s.clientSees.lead}</p>
      <div class="compare">
        <div class="col">
          <h3>{s.clientSees.can}</h3>
          <ul>{#each s.clientSees.canList as li, i (i)}<li>{@html rich(li)}</li>{/each}</ul>
        </div>
        <div class="col never">
          <h3>{s.clientSees.never}</h3>
          <ul>{#each s.clientSees.neverList as li, i (i)}<li>{@html rich(li)}</li>{/each}</ul>
        </div>
      </div>
      <p>{s.clientSees.after}</p>
    </section>

    <section id={clientLogs}>
      <h2>{s.clientLogs.h}</h2>
      <Figure caption={g.figures.phones}>
        <PortalWeekFigure />
        <PortalLogFigure />
      </Figure>
      <ol class="steps plain">
        {#each s.clientLogs.steps as step, i (i)}
          <li><h3>{step.h}</h3><p>{@html rich(step.p)}</p></li>
        {/each}
      </ol>
      <p>{s.clientLogs.rulesLead}</p>
      <ul class="rules">{#each s.clientLogs.rules as li, i (i)}<li>{@html rich(li)}</li>{/each}</ul>
    </section>

    <section id={youSee}>
      <h2>{s.youSee.h}</h2>
      <p>{@html rich(s.youSee.p[0])}</p>
      <Figure caption={g.figures.history}><HistoryFigure /></Figure>
      <p>{@html rich(s.youSee.p[1])}</p>
    </section>

    <section id={resetOff}>
      <h2>{s.resetOff.h}</h2>
      <dl class="defs">
        {#each s.resetOff.items as item (item.dt)}
          <div><dt>{item.dt}</dt><dd>{@html rich(item.dd)}</dd></div>
        {/each}
      </dl>
    </section>

    <section id={stuck}>
      <h2>{s.stuck.h}</h2>
      <table class="lookup">
        <thead><tr><th scope="col">{s.stuck.head[0]}</th><th scope="col">{s.stuck.head[1]}</th></tr></thead>
        <tbody>
          {#each s.stuck.rows as [said, fix], i (i)}
            <tr><th scope="row">{said}</th><td>{@html rich(fix)}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
</GuideDoc>
