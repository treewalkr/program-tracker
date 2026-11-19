<script lang="ts">
  import { tick } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { i18n, inLang } from "$lib/portal/i18n.svelte";
  import { isAdminSession } from "$lib/settingsNav";
  import CommandPalette, { type PaletteGroup } from "$lib/ui/CommandPalette.svelte";
  import { guideSearch, isMac, openGuideSearch } from "./searchState.svelte";
  import { commonQuestions, groupHits, guideSections, highlight, queryWords, searchGuides, snippet, type GuideUnit, type Part } from "./search";

  /**
   * Search across every guide, on ⌘K / Ctrl+K from any trainer page. Mounted
   * once in the root layout. Matches in English or Thai, shows the page's
   * language, and lands on the exact step or row with a brief flash.
   */

  const TEXT = {
    en: {
      label: "Search the guides",
      placeholder: "Search the guides — try “sick”",
      common: "Common questions",
      quick: "Quick answer",
      step: (n: number) => `Step ${n}`,
      results: (n: number) => (n === 1 ? "1 result" : `${n} results`),
      none: (q: string) => `Nothing matches “${q}” in English or Thai.`,
      browse: "Browse the Guide",
      hints: [["↑↓", "move"], ["↵", "open"], [isMac ? "⌘↵" : "Ctrl ↵", "new tab"], ["esc", "close"]] as [string, string][],
    },
    th: {
      label: "ค้นหาในคู่มือ",
      placeholder: "ค้นหาในคู่มือ ลอง “ป่วย”",
      common: "คำถามที่พบบ่อย",
      quick: "คำตอบด่วน",
      step: (n: number) => `ขั้นที่ ${n}`,
      results: (n: number) => `${n} รายการ`,
      none: (q: string) => `ไม่พบ “${q}” ทั้งภาษาอังกฤษและภาษาไทย`,
      browse: "ดูคู่มือทั้งหมด",
      hints: [["↑↓", "เลื่อน"], ["↵", "เปิด"], [isMac ? "⌘↵" : "Ctrl ↵", "แท็บใหม่"], ["esc", "ปิด"]] as [string, string][],
    },
  } as const;

  const locale = $derived(i18n.locale);
  const t = $derived(TEXT[locale]);
  const admin = $derived(isAdminSession(page.data.session));
  const words = $derived(queryWords(guideSearch.query));

  const groups = $derived.by((): PaletteGroup<GuideUnit>[] => {
    if (!words.length)
      return [
        { id: "common", label: t.common, items: commonQuestions(locale) },
        ...guideSections(locale, { admin }).map((g) => ({ id: g.guide, label: g.title, items: g.units })),
      ];
    return groupHits(searchGuides(guideSearch.query, locale, { admin })).map((g) => ({
      id: g.guide,
      label: g.title,
      items: g.hits.map((h) => h.unit),
    }));
  });
  const count = $derived(groups.reduce((n, g) => n + g.items.length, 0));

  /** The quiet label on a row's right. */
  function kindLabel(u: GuideUnit): string {
    if (u.kind === "question") return t.quick;
    if (u.kind === "step") return t.step(u.step ?? 1);
    // A section, or a paragraph (titled by its section already): no label.
    if (u.kind === "section" || u.kind === "text") return "";
    return u.section;
  }

  /** The muted line: where it lives before typing, the matching passage while typing. */
  function second(u: GuideUnit): Part[] {
    const where = u.kind === "section" ? u.guideTitle : `${u.guideTitle} › ${u.section}`;
    if (!words.length || !u.body) return [{ text: where, hit: false }];
    return snippet(u.body, words, locale, { before: 24, length: 110 });
  }

  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const squash = (s: string) => s.replace(/\s+/g, " ").trim();

  /** Scroll the unit's own element (a step, row, term, paragraph) into view and flash it. */
  function land(u: GuideUnit) {
    const section = document.getElementById(u.sectionId);
    if (!section) return;
    const want = squash(u.locate);
    let el: HTMLElement | null =
      u.kind === "section"
        ? null
        : ([...section.querySelectorAll<HTMLElement>("h3, li, tr, dt, p")].find((e) => squash(e.textContent ?? "").includes(want)) ?? null);
    if (el?.tagName === "DT" || el?.tagName === "H3") el = el.parentElement;
    el ??= section.querySelector<HTMLElement>("h2") ?? section;
    el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
    el.removeAttribute("data-guide-flash");
    void el.offsetWidth; // restart the animation on a second landing
    el.setAttribute("data-guide-flash", "");
    el.addEventListener("animationend", () => el.removeAttribute("data-guide-flash"), { once: true });
  }

  async function pick(u: GuideUnit, { newTab }: { newTab: boolean }) {
    const url = inLang(u.href);
    if (newTab) {
      window.open(url, "_blank", "noopener");
      return;
    }
    await goto(url, { keepFocus: true });
    await tick();
    requestAnimationFrame(() => land(u));
  }

  /** ⌘K on a Mac, Ctrl+K elsewhere (either works, like ⌘B): toggles the palette. */
  function onkeydown(e: KeyboardEvent) {
    if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("[contenteditable]:not([contenteditable='false'])")) return;
    if (!guideSearch.open && document.querySelector("dialog[open]")) return; // another modal is up
    e.preventDefault();
    if (guideSearch.open) guideSearch.open = false;
    else openGuideSearch();
  }
</script>

<svelte:window {onkeydown} />

{#snippet marked(parts: Part[])}{#each parts as p, i (i)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}{/snippet}

<CommandPalette
  bind:open={guideSearch.open}
  bind:query={guideSearch.query}
  label={t.label}
  placeholder={t.placeholder}
  {groups}
  key={(u) => u.key}
  onpick={pick}
  hints={t.hints}
  note="EN + ไทย"
  status={words.length ? t.results(count) : ""}
  lang={locale}
>
  {#snippet row(u)}
    <div class="top">
      <span class="title">{@render marked(highlight(u.title, words))}</span>
      {#if kindLabel(u)}<span class="kind">{kindLabel(u)}</span>{/if}
    </div>
    <div class="sub">{@render marked(second(u))}</div>
  {/snippet}
  {#snippet empty()}
    <p class="none">{t.none(guideSearch.query.trim())}</p>
    <a class="browse" href={inLang("/guide")} onclick={() => (guideSearch.open = false)}>{t.browse}</a>
  {/snippet}
</CommandPalette>

<style>
  .top {
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .title {
    flex: 1 1 auto;
    min-width: 0;
    font: 500 14px/1.45 var(--font-ui);
    color: var(--ink);
    text-wrap: pretty;
  }
  .kind {
    flex: none;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 400 12px/1.45 var(--font-ui);
    color: var(--muted);
  }
  .sub {
    margin-top: 1px;
    font: 400 13px/1.45 var(--font-ui);
    color: var(--muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .none {
    margin: 0 0 6px;
  }
  .browse {
    color: var(--blue);
    font-weight: 500;
  }
  :global(.palette:lang(th)) .title,
  :global(.palette:lang(th)) .sub,
  :global(.palette:lang(th)) .kind {
    line-height: 1.8;
  }
</style>
