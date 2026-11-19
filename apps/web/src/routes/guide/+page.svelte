<script lang="ts">
  import { GUIDE, GUIDE_IDS } from "$lib/guide/clientPortal";
  import { PROGRAMS_GUIDE } from "$lib/guide/programsWeeks";
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import Icon from "$lib/ui/Icon.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";

  const TEXT = {
    en: {
      title: "Guide",
      sub: "How the app works, in your clients' terms too. Each guide is in English and Thai.",
      count: (n: number) => `${n} sections`,
    },
    th: {
      title: "คู่มือ",
      sub: "แอปทำงานยังไง พร้อมมุมของลูกค้าด้วย ทุกคู่มือมีทั้งภาษาอังกฤษและภาษาไทย",
      count: (n: number) => `${n} หัวข้อ`,
    },
  } as const;

  const t = $derived(TEXT[i18n.locale]);

  /** Each guide with its sections, so a trainer can jump straight to the situation they're in. */
  const guides = $derived.by(() => {
    const programs = PROGRAMS_GUIDE[i18n.locale];
    const portal = GUIDE[i18n.locale];
    const ps = portal.sections;
    const portalHeads = [ps.setUp.h, ps.clientSees.h, ps.clientLogs.h, ps.youSee.h, ps.resetOff.h, ps.stuck.h];
    return [
      {
        href: "/guide/programs-and-weeks",
        title: programs.title,
        sub: programs.sub,
        sections: programs.sections.map((s) => ({ id: s.id, h: s.h })),
      },
      {
        href: "/guide/client-portal",
        title: portal.title,
        sub: portal.sub,
        sections: GUIDE_IDS.map((id, i) => ({ id, h: portalHeads[i] })),
      },
    ];
  });
</script>

<svelte:head><title>{t.title} · Program Tracker</title></svelte:head>

<PageHead title={t.title} sub={t.sub}>
  {#snippet actions()}<LangToggle compact />{/snippet}
</PageHead>

<div class="guides" lang={i18n.locale}>
  {#each guides as guide (guide.href)}
    <section class="panel guide" aria-labelledby="g-{guide.href}">
      <div class="panel-head">
        <h2 id="g-{guide.href}"><a class="title" href={guide.href}>{guide.title}</a></h2>
        <span class="counter">{t.count(guide.sections.length)}</span>
      </div>
      <p class="sub">{guide.sub}</p>
      <ul class="sections">
        {#each guide.sections as section (section.id)}
          <li>
            <a href="{guide.href}#{section.id}">
              <span class="h">{section.h}</span>
              <span class="go" aria-hidden="true"><Icon name="arrow-right" /></span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/each}
</div>

<style>
  .guides {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
    gap: 16px;
    align-items: start;
    max-width: 1040px;
    margin-top: 8px;
  }

  .guide { overflow: hidden; }
  .panel-head h2 { margin: 0; flex: 1 1 auto; min-width: 0; }
  .title { color: var(--ink); text-decoration: none; }
  .title:hover { color: var(--blue); text-decoration: underline; text-underline-offset: 3px; }
  .title:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; border-radius: var(--radius); }

  .sub {
    margin: 0;
    padding: 12px 16px;
    font-size: 14px;
    line-height: 1.55;
    color: var(--muted);
    text-wrap: pretty;
    border-bottom: 1px solid var(--line-soft);
  }

  .sections { list-style: none; margin: 0; padding: 0; }
  .sections li + li { border-top: 1px solid var(--line-soft); }
  .sections a {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 40px;
    padding: 8px 16px;
    color: var(--ink);
    text-decoration: none;
    font-size: 14px;
    line-height: 1.45;
  }
  .h { flex: 1 1 auto; min-width: 0; text-wrap: pretty; }
  .go {
    flex: none;
    display: grid;
    width: 16px;
    height: 16px;
    color: var(--muted);
    transition: color 0.15s ease-out, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .go :global(svg) { width: 16px; height: 16px; }
  .sections a:hover { background: var(--well); }
  .sections a:hover .h { color: var(--blue); }
  .sections a:hover .go,
  .sections a:focus-visible .go { color: var(--blue); transform: translateX(2px); }
  .sections a:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }

  /* Thai wants more air between lines than Latin. */
  .guides:lang(th) .sub,
  .guides:lang(th) .sections a { line-height: 1.8; }

  @media (prefers-reduced-motion: reduce) {
    .go { transition: none; }
  }
</style>
