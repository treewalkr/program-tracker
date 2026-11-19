<script lang="ts">
  import { GUIDE } from "$lib/guide/clientPortal";
  import { PROGRAMS_GUIDE } from "$lib/guide/programsWeeks";
  import { i18n } from "$lib/portal/i18n.svelte";
  import LangToggle from "$lib/portal/LangToggle.svelte";
  import PageHead from "$lib/ui/PageHead.svelte";

  const TEXT = {
    en: { title: "Guide", sub: "How the app works, in your clients' terms too. Each guide is in English and Thai." },
    th: { title: "คู่มือ", sub: "แอปทำงานยังไง พร้อมมุมของลูกค้าด้วย ทุกคู่มือมีทั้งภาษาอังกฤษและภาษาไทย" },
  } as const;

  const t = $derived(TEXT[i18n.locale]);
  const guides = $derived([
    { href: "/guide/programs-and-weeks", ...PROGRAMS_GUIDE[i18n.locale] },
    { href: "/guide/client-portal", title: GUIDE[i18n.locale].title, sub: GUIDE[i18n.locale].sub },
  ]);
</script>

<svelte:head><title>{t.title} · Program Tracker</title></svelte:head>

<PageHead title={t.title} sub={t.sub}>
  {#snippet actions()}<LangToggle compact />{/snippet}
</PageHead>

<ul class="guides" lang={i18n.locale}>
  {#each guides as guide (guide.href)}
    <li>
      <a href={guide.href}>
        <span class="name">{guide.title}</span>
        <span class="sub">{guide.sub}</span>
      </a>
    </li>
  {/each}
</ul>

<style>
  .guides { list-style: none; margin: 8px 0 0; padding: 0; max-width: 72ch; border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .guides li + li { border-top: 1px solid var(--line-soft); }
  a { display: grid; gap: 2px; padding: 14px 16px; color: inherit; text-decoration: none; }
  a:hover { background: var(--well); }
  a:hover .name { color: var(--blue); }
  a:focus-visible { outline: 2px solid var(--blue); outline-offset: -2px; }
  .name { font: 600 15px/1.4 var(--font-ui); }
  .sub { font-size: 14px; line-height: 1.55; color: var(--muted); text-wrap: pretty; }
  .guides:lang(th) .sub { line-height: 1.8; }
</style>
