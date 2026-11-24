<script module lang="ts">
  import { defineMeta } from "@storybook/addon-svelte-csf";
  import CommandPalette, { type PaletteGroup } from "./CommandPalette.svelte";
  import { highlight, queryWords, snippet, type Part } from "$lib/guide/search";

  const { Story } = defineMeta({
    title: "UI/Command palette",
    component: CommandPalette,
    parameters: {
      docs: {
        description: {
          component:
            "⌘K palette on a native modal dialog: a search field over grouped results. Not a select — it navigates and holds no value. ↑↓ wrap, PageUp/PageDown jump 8, Enter opens, ⌘/Ctrl+Enter opens in a new tab, Esc, the backdrop or the esc chip (a 44px ✕ on touch screens) closes and focus goes back to the opener. Matches are marked like the selects' (OptionList).",
        },
      },
    },
  });

  interface Item {
    id: string;
    group: string;
    title: string;
    body: string;
    kind: string;
  }

  const EN: Item[] = [
    { id: "q1", group: "Programs & weeks", title: "“My client was sick for a week.”", body: "Move Week 1 a week later with Change, so they repeat the week they missed.", kind: "Quick answer" },
    { id: "q2", group: "Programs & weeks", title: "“I want to start next week.”", body: "Press Activate program and choose Next Monday.", kind: "Quick answer" },
    { id: "m1", group: "Programs & weeks", title: "Missed or late sessions", body: "A session belongs to its week. A client who was sick or away can repeat the week if you move Week 1 later.", kind: "Missed or late sessions" },
    { id: "p1", group: "Client portal", title: "Press Turn on", body: "A personal Access link appears. Nothing is sent yet, and no active program is fine.", kind: "Step 3" },
    { id: "p2", group: "Client portal", title: "Reset link", body: "For a link that went to the wrong chat. The old link stops working.", kind: "Reset or turn off" },
  ];
  const TH: Item[] = [
    { id: "q1", group: "โปรแกรมและสัปดาห์", title: "“เมมเบอร์ป่วยไปหนึ่งสัปดาห์”", body: "กด Change เลื่อนสัปดาห์ที่ 1 ออกไปหนึ่งสัปดาห์ เมมเบอร์จะได้ซ้อมสัปดาห์ที่พลาดอีกรอบ", kind: "คำตอบด่วน" },
    { id: "q2", group: "โปรแกรมและสัปดาห์", title: "“อยากเริ่มสัปดาห์หน้า”", body: "กด Activate program แล้วเลือก Next Monday", kind: "คำตอบด่วน" },
    { id: "p1", group: "พอร์ทัลเมมเบอร์", title: "กด Turn on", body: "จะมี Access link ส่วนตัวขึ้นมา ระบบยังไม่ส่งอะไรไปหาเมมเบอร์", kind: "ขั้นที่ 3" },
  ];

  function grouped(items: Item[], query: string): PaletteGroup<Item>[] {
    const words = queryWords(query);
    const hits = items.filter((i) => words.every((w) => (i.title + " " + i.body).toLowerCase().includes(w)));
    const groups = new Map<string, Item[]>();
    for (const i of hits) groups.set(i.group, [...(groups.get(i.group) ?? []), i]);
    return [...groups].map(([label, items]) => ({ id: label, label, items }));
  }
</script>

<script lang="ts">
  /** One open palette per story, each with its own query. */
  const st = $state({
    empty: { open: true, query: "" },
    typed: { open: true, query: "sick" },
    none: { open: true, query: "xyz" },
    thai: { open: true, query: "ป่วย" },
    narrow: { open: true, query: "week" },
  });
  type Key = keyof typeof st;
</script>

{#snippet marked(parts: Part[])}{#each parts as p, i (i)}{#if p.hit}<mark>{p.text}</mark>{:else}{p.text}{/if}{/each}{/snippet}

{#snippet palette(items: Item[], k: Key, locale: "en" | "th")}
  {@const s = st[k]}
  {@const words = queryWords(s.query)}
  {@const groups = grouped(items, s.query)}
  <button type="button" class="btn" onclick={() => (s.open = true)}>Open palette</button>
  <CommandPalette
    bind:open={s.open}
    bind:query={s.query}
    lang={locale}
    label={locale === "th" ? "ค้นหาในคู่มือ" : "Search the guides"}
    placeholder={locale === "th" ? "ค้นหาในคู่มือ" : "Search the guides"}
    {groups}
    key={(i) => i.id}
    onpick={() => {}}
    hints={[["↑↓", "move"], ["↵", "open"], ["⌘↵", "new tab"]]}
    note="EN + ไทย"
    status="{groups.reduce((n, g) => n + g.items.length, 0)} results"
  >
    {#snippet row(item, on)}
      <div class="r">
        <span class="t">{@render marked(highlight(item.title, words))}</span>
        <span class="k" class:on>{item.kind}</span>
      </div>
      <div class="s">{@render marked(words.length ? snippet(item.body, words, locale) : [{ text: item.group, hit: false }])}</div>
    {/snippet}
    {#snippet empty()}Nothing matches “{s.query}” in English or Thai.{/snippet}
  </CommandPalette>
{/snippet}

<Story name="Empty query" asChild>
  {@render palette(EN, "empty", "en")}
</Story>

<Story name="Typed, with highlights" asChild>
  {@render palette(EN, "typed", "en")}
</Story>

<Story name="No results" asChild>
  {@render palette(EN, "none", "en")}
</Story>

<Story name="Thai" asChild>
  {@render palette(TH, "thai", "th")}
</Story>

<Story name="Narrow" asChild parameters={{ viewport: { defaultViewport: "narrow" } }}>
  {@render palette(EN, "narrow", "en")}
</Story>

<style>
  .r { display: flex; align-items: baseline; gap: 12px; }
  .t { flex: 1 1 auto; min-width: 0; font: 500 14px/1.45 var(--font-ui); }
  .k { flex: none; font-size: 12px; color: var(--muted); }
  .s { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
