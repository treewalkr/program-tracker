<script lang="ts">
  import { onMount } from "svelte";
  import { guide as g, GUIDE_IDS } from "$lib/guide/clientPortal";
  import Figure from "$lib/guide/Figure.svelte";
  import HistoryFigure from "$lib/guide/HistoryFigure.svelte";
  import PortalBoxFigure from "$lib/guide/PortalBoxFigure.svelte";
  import PortalLogFigure from "$lib/guide/PortalLogFigure.svelte";
  import PortalWeekFigure from "$lib/guide/PortalWeekFigure.svelte";
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import { renderInlineMarkdown } from "$lib/markdown";
  import PageHead from "$lib/ui/PageHead.svelte";

  const s = g.sections;
  const [setUp, clientSees, clientLogs, youSee, resetOff, stuck] = GUIDE_IDS;
  const toc = [
    [setUp, s.setUp.h],
    [clientSees, s.clientSees.h],
    [clientLogs, s.clientLogs.h],
    [youSee, s.youSee.h],
    [resetOff, s.resetOff.h],
    [stuck, s.stuck.h],
  ] as const;

  /** Inline markdown plus ⟦tone|label⟧ pills — the guide's own copy, never user input. */
  const rich = (text: string) => renderInlineMarkdown(text).replace(/⟦(\w+)\|([^⟧]+)⟧/g, '<span class="pill $1">$2</span>');

  let current = $state<string>(GUIDE_IDS[0]);

  onMount(() => {
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
        const first = GUIDE_IDS.find((id) => seen.has(id));
        if (first) current = first;
      },
      { rootMargin: "0px 0px -65% 0px" },
    );
    for (const id of GUIDE_IDS) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  });
</script>

<svelte:head><title>{g.title} guide · Program Tracker</title></svelte:head>

<PageHead title={g.title} sub={g.sub} crumbs={[{ label: g.crumbs[0] }, { label: g.crumbs[1] }]} />

<div class="doc">
  <nav class="toc" aria-label={g.onThisPage}>
    <p class="toc-title">{g.onThisPage}</p>
    <ul>
      {#each toc as [id, label] (id)}
        <li><a href="#{id}" aria-current={current === id ? "true" : undefined}>{label}</a></li>
      {/each}
    </ul>
  </nav>

  <article>
    <p class="intro">{@html rich(g.intro)}</p>

    <section id={setUp}>
      <h2>{s.setUp.h}</h2>
      <Figure caption={g.figures.box}><PortalBoxFigure /></Figure>
      <ol class="steps">
        {#each s.setUp.steps as step, i (i)}
          <li><h3>{@html rich(step.h)}</h3><p>{@html rich(step.p)}</p></li>
        {/each}
      </ol>
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
        {#snippet controls()}<span id="cl-lang">{g.clientLanguage}</span><LangToggle compact />{/snippet}
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
      <table class="sheet">
        <thead><tr><th scope="col">{s.stuck.head[0]}</th><th scope="col">{s.stuck.head[1]}</th></tr></thead>
        <tbody>
          {#each s.stuck.rows as [said, fix], i (i)}
            <tr><th scope="row">{said}</th><td>{@html rich(fix)}</td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  </article>
</div>

<style>
  .doc {
    display: grid;
    grid-template-columns: minmax(0, 72ch) 200px;
    grid-template-areas: "article toc";
    gap: 48px;
    align-items: start;
  }
  article { grid-area: article; min-width: 0; }
  .toc { grid-area: toc; }
  section { padding-top: 28px; scroll-margin-top: 12px; }
  h2 {
    margin: 0 0 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line-soft);
    font: 600 18px/1.3 var(--font-ui);
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  h3 { margin: 0 0 2px; font: 600 14px/1.45 var(--font-ui); }
  p { margin: 0 0 12px; font-size: 14px; line-height: 1.6; text-wrap: pretty; }
  .intro { margin-top: 4px; font-size: 15px; }
  .doc :global(em) { font-style: normal; font-weight: 500; }
  .doc :global(code) { font: 500 12px/1 var(--font-mono); padding: 2px 6px; background: var(--well); border: 1px solid var(--line); border-radius: var(--radius); }

  /* Steps: the order matters here, so the sequence earns its numbers. */
  .steps { list-style: none; counter-reset: step; margin: 0 0 12px; padding: 0; }
  .steps > li { counter-increment: step; position: relative; padding: 0 0 18px 40px; }
  .steps > li::before {
    content: counter(step);
    position: absolute;
    left: 0;
    top: 0;
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    font: 600 12px/1 var(--font-mono);
    background: var(--well);
    border: 1px solid var(--line);
    border-radius: 50%;
  }
  .steps > li:not(:last-child)::after { content: ""; position: absolute; left: 13px; top: 30px; bottom: 4px; width: 1px; background: var(--line-soft); }
  .steps li p { margin: 0; }

  .aside { padding: 10px 12px; background: var(--well); border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; }

  .compare { display: grid; grid-template-columns: 1.3fr 1fr; margin: 0 0 14px; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .col { padding: 12px 16px 6px; min-width: 0; }
  .col.never { background: var(--well); border-left: 1px solid var(--line); }
  .col ul, .rules { margin: 6px 0 8px; padding-left: 18px; display: grid; gap: 5px; font-size: 14px; line-height: 1.55; }
  .col li, .rules li, .defs dd, .sheet td { text-wrap: pretty; }
  .rules { margin-top: 0; }

  .defs { margin: 0; display: grid; gap: 14px; }
  .defs dt { font: 600 14px/1.45 var(--font-ui); }
  .defs dd { margin: 2px 0 0; font-size: 14px; line-height: 1.6; }

  /* One border source (the cell's top edge) and one padding for both columns, so rows line up. */
  .sheet { width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; font-size: 14px; line-height: 1.55; }
  .sheet thead th { text-align: left; padding: 6px 12px; background: var(--well); font: 600 13px/1.5 var(--font-ui); color: var(--muted); }
  .sheet tbody th, .sheet td { padding: 10px 12px; vertical-align: baseline; text-align: left; border-top: 1px solid var(--line-soft); }
  .sheet tbody th { width: 38%; font-weight: 600; color: var(--ink); }
  .sheet thead th + th, .sheet tbody th + td { border-left: 1px solid var(--line-soft); }
  .sheet thead th { border-bottom: 0; }

  /* Contents: sticky rail beside the article on wide screens. */
  .toc { position: sticky; top: 16px; padding-top: 4px; }
  .toc-title { margin: 0 0 6px; font: 600 12px/1.4 var(--font-ui); color: var(--muted); }
  .toc ul { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--line-soft); }
  .toc a { display: block; margin-left: -1px; padding: 4px 12px; border-left: 2px solid transparent; font-size: 13px; line-height: 1.4; color: var(--muted); text-decoration: none; }
  .toc a:hover { color: var(--blue); }
  .toc a:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: var(--radius); }
  .toc a[aria-current="true"] { color: var(--ink); font-weight: 600; border-left-color: var(--tab-on); }

  /* Below the rail breakpoint the contents become a one-line scroller above the article. */
  @media (max-width: 1040px) {
    .doc { grid-template-columns: minmax(0, 72ch); grid-template-areas: "toc" "article"; gap: 0; }
    .toc { position: static; margin-bottom: 4px; }
    .toc-title { display: none; }
    .toc ul { display: flex; gap: 4px; border-left: 0; overflow-x: auto; scrollbar-width: none; border-bottom: 1px solid var(--line-soft); }
    .toc li { flex: none; }
    .toc a { margin: 0; padding: 9px 10px; min-height: 36px; border-left: 0; border-bottom: 2px solid transparent; white-space: nowrap; }
    .toc a[aria-current="true"] { border-bottom-color: var(--tab-on); }
  }
  @media (max-width: 640px) {
    .compare { grid-template-columns: 1fr; }
    .col.never { border-left: 0; border-top: 1px solid var(--line); }
    /* Stacked rows: the client's words lead, the answer follows. */
    .sheet, .sheet tbody, .sheet tr, .sheet tbody th, .sheet tbody td { display: block; width: auto; min-width: 0; box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; }
    .sheet thead { display: none; }
    .sheet tbody tr + tr { border-top: 1px solid var(--line); }
    .sheet tbody th { padding: 10px 12px 2px; border: 0; }
    .sheet tbody td { padding: 0 12px 10px; border: 0; }
  }
</style>
