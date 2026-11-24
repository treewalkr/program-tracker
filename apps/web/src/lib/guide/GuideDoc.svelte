<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  /**
   * The guides' page body: a sticky "On this page" rail beside the article
   * (a one-line scroller above it on narrow screens), with the current
   * section tracked as you scroll. Every guide shares these styles.
   */
  let {
    toc,
    onThisPage,
    lang,
    children,
  }: {
    toc: readonly (readonly [id: string, label: string])[];
    onThisPage: string;
    lang: string;
    children: Snippet;
  } = $props();

  let current = $state<string | null>(null);
  const shown = $derived(current ?? toc[0]?.[0] ?? null);

  onMount(() => {
    const ids = toc.map(([id]) => id);
    const seen = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? seen.add(e.target.id) : seen.delete(e.target.id));
        const first = ids.find((id) => seen.has(id));
        if (first) current = first;
      },
      { rootMargin: "0px 0px -65% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  });
</script>

<div class="doc" {lang}>
  <nav class="toc" aria-label={onThisPage}>
    <p class="toc-title">{onThisPage}</p>
    <ul class="x-scroll">
      {#each toc as [id, label] (id)}
        <li><a href="#{id}" aria-current={shown === id ? "true" : undefined}>{label}</a></li>
      {/each}
    </ul>
  </nav>

  <article>{@render children()}</article>
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
  .doc :global(section:not(.stage *)) { padding-top: 28px; scroll-margin-top: 12px; }
  .doc :global(h2:not(.stage *)) {
    margin: 0 0 10px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--line-soft);
    font: 600 18px/1.3 var(--font-ui);
    letter-spacing: -0.01em;
    text-wrap: balance;
  }
  .doc :global(h3:not(.stage *)) { margin: 0 0 2px; font: 600 14px/1.45 var(--font-ui); }
  .doc :global(p:not(.stage *)) { margin: 0 0 12px; font-size: 14px; line-height: 1.6; text-wrap: pretty; }
  .doc :global(.intro) { margin-top: 4px; font-size: 15px; }
  .doc :global(em:not(.stage *)) { font-style: normal; font-weight: 500; }
  .doc :global(code:not(.stage *)) { font: 500 12px/1 var(--font-mono); padding: 2px 6px; background: var(--well); border: 1px solid var(--line); border-radius: var(--radius); }

  /* Steps: the order matters here, so the sequence earns its numbers. */
  .doc :global(.steps) { list-style: none; counter-reset: step; margin: 0 0 12px; padding: 0; }
  .doc :global(.steps > li) { counter-increment: step; position: relative; padding: 0 0 18px 40px; }
  .doc :global(.steps > li::before) {
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
  .doc :global(.steps > li:not(:last-child)::after) { content: ""; position: absolute; left: 13px; top: 30px; bottom: 4px; width: 1px; background: var(--line-soft); }
  .doc :global(.steps li p) { margin: 0; }

  .doc :global(.aside) { padding: 10px 12px; background: var(--well); border: 1px solid var(--line); border-radius: var(--radius); font-size: 13px; }

  .doc :global(.compare) { display: grid; grid-template-columns: 1.3fr 1fr; margin: 0 0 14px; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .doc :global(.col:not(.stage *)) { padding: 12px 16px 6px; min-width: 0; }
  .doc :global(.col.never) { background: var(--well); border-left: 1px solid var(--line); }
  .doc :global(.col ul:not(.stage *)), .doc :global(.rules) { margin: 6px 0 8px; padding-left: 18px; display: grid; gap: 5px; font-size: 14px; line-height: 1.55; }
  .doc :global(.col li:not(.stage *)), .doc :global(.rules li), .doc :global(.defs dd), .doc :global(.lookup td) { text-wrap: pretty; }
  .doc :global(.rules) { margin-top: 0; margin-bottom: 12px; }

  .doc :global(.defs) { margin: 0 0 12px; display: grid; gap: 14px; }
  .doc :global(.defs dt) { font: 600 14px/1.45 var(--font-ui); }
  .doc :global(.defs dd) { margin: 2px 0 0; font-size: 14px; line-height: 1.6; }

  /* One border source (the cell's top edge) and one padding for both columns, so rows line up. */
  .doc :global(.lookup) { width: 100%; margin: 0 0 12px; border-collapse: separate; border-spacing: 0; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; font-size: 14px; line-height: 1.55; }
  .doc :global(.lookup thead th) { text-align: left; padding: 6px 12px; background: var(--well); font: 600 13px/1.5 var(--font-ui); color: var(--muted); border-bottom: 0; white-space: normal; }
  .doc :global(.lookup tbody th), .doc :global(.lookup td) { padding: 10px 12px; vertical-align: baseline; text-align: left; border-top: 1px solid var(--line-soft); }
  .doc :global(.lookup tbody th) { width: 38%; font-weight: 600; color: var(--ink); }
  .doc :global(.lookup thead th + th), .doc :global(.lookup tbody th + td) { border-left: 1px solid var(--line-soft); }

  /* Thai wants more air between lines than Latin. */
  .doc:lang(th) :global(p:not(.stage *)), .doc:lang(th) :global(li:not(.stage *)), .doc:lang(th) :global(dd:not(.stage *)), .doc:lang(th) :global(td:not(.stage *)), .doc:lang(th) :global(th:not(.stage *)) { line-height: 1.8; }
  .doc:lang(th) :global(h2:not(.stage *)) { line-height: 1.5; letter-spacing: 0; }
  .doc:lang(th) :global(figcaption) { font-size: 14px; }

  /* Landing from guide search: the matched step or row glows once, then settles. */
  .doc :global([data-guide-flash]) { animation: guide-flash 1.6s ease-out; border-radius: var(--radius); }
  .doc :global([tabindex="-1"]:focus) { outline: none; }
  @keyframes guide-flash {
    from, 30% { background-color: var(--pulse-now-bg); box-shadow: 0 0 0 4px var(--pulse-now-bg); }
    to { background-color: transparent; box-shadow: 0 0 0 4px transparent; }
  }
  @media (prefers-reduced-motion: reduce) {
    .doc :global([data-guide-flash]) { animation-duration: 1.2s; animation-timing-function: steps(1, end); }
  }

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
    .doc :global(.compare) { grid-template-columns: 1fr; }
    .doc :global(.col.never) { border-left: 0; border-top: 1px solid var(--line); }
    /* Stacked rows: the question leads, the answer follows. */
    .doc :global(.lookup), .doc :global(.lookup tbody), .doc :global(.lookup tr), .doc :global(.lookup tbody th), .doc :global(.lookup tbody td) { display: block; width: auto; min-width: 0; box-sizing: border-box; white-space: normal; overflow-wrap: anywhere; }
    .doc :global(.lookup thead) { display: none; }
    .doc :global(.lookup tbody tr + tr) { border-top: 1px solid var(--line); }
    .doc :global(.lookup tbody th) { padding: 10px 12px 2px; border: 0; }
    .doc :global(.lookup tbody td) { padding: 0 12px 10px; border: 0; }
  }
</style>
