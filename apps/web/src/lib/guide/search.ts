import type { Locale } from "$lib/portal/messages";
import { GUIDE, GUIDE_IDS } from "./clientPortal";
import { PROGRAMS_GUIDE, type GuideSection } from "./programsWeeks";
import { TRAINER_ACCESS_GUIDE } from "./trainerAccess";
import { CARDIO_GUIDE } from "./cardio";

/**
 * Full-text search over the guides, for the ⌘K palette. Every guide is
 * flattened into small units (a section, a step, a Q&A row, a term, a
 * paragraph or list item) in document order. Keys are paths, so the English
 * and Thai unit for the same spot share one key: a query matches in either
 * language and the result shows in the page's.
 */

export type GuideId = "programs" | "portal" | "cardio" | "access";
export type UnitKind = "section" | "question" | "step" | "term" | "text";

export interface GuideUnit {
  /** `programs/answers/0/3` — the same in both languages. */
  key: string;
  guide: GuideId;
  guideTitle: string;
  sectionId: string;
  /** The section's heading. */
  section: string;
  /** Unprefixed: `/guide/programs-and-weeks#answers`. */
  href: string;
  kind: UnitKind;
  /** Plain text. For a paragraph or list item, the section heading. */
  title: string;
  /** Plain text; empty for a section. */
  body: string;
  /** Step number (1-based) for a step. */
  step?: number;
  /** Text to find on the page when landing: the title, or the start of a paragraph. */
  locate: string;
  /** Document order across all guides. */
  order: number;
}

const PATHS: Record<GuideId, string> = {
  programs: "/guide/programs-and-weeks",
  portal: "/guide/client-portal",
  cardio: "/guide/cardio",
  access: "/guide/trainer-access",
};

/** The guides' inline markup — **bold**, *italic*, `code`, ⟦tone|label⟧ — as plain text. */
export const plain = (text: string): string =>
  text.replace(/⟦\w+\|([^⟧]+)⟧/g, "$1").replace(/\*\*|\*|`/g, "");

type Draft = Omit<GuideUnit, "guide" | "guideTitle" | "sectionId" | "section" | "href" | "order" | "locate">;

function unitsOf(guide: GuideId, guideTitle: string, sections: { id: string; h: string; units: Draft[] }[]): GuideUnit[] {
  return sections.flatMap(({ id, h, units }) =>
    [{ key: `${guide}/${id}`, kind: "section" as const, title: h, body: "" }, ...units].map((u) => ({
      ...u,
      title: plain(u.title),
      body: plain(u.body),
      locate: u.kind === "text" ? plain(u.body).slice(0, 40) : plain(u.title),
      guide,
      guideTitle,
      sectionId: id,
      section: h,
      href: `${PATHS[guide]}#${id}`,
      order: 0,
    })),
  );
}

/** A generic guide (Programs & weeks, Trainer access): sections of blocks. */
function blockUnits(guide: GuideId, sections: GuideSection[]): { id: string; h: string; units: Draft[] }[] {
  return sections.map((s) => ({
    id: s.id,
    h: s.h,
    units: s.blocks.flatMap((b, bi): Draft[] => {
      const k = `${guide}/${s.id}/${bi}`;
      if ("p" in b) return [{ key: k, kind: "text", title: s.h, body: b.p }];
      if ("aside" in b) return [{ key: k, kind: "text", title: s.h, body: b.aside }];
      if ("steps" in b) return b.steps.map((st, i) => ({ key: `${k}/${i}`, kind: "step", title: st.h, body: st.p, step: i + 1 }));
      if ("list" in b) return b.list.map((li, i) => ({ key: `${k}/${i}`, kind: "text", title: s.h, body: li }));
      if ("defs" in b) return b.defs.map((d, i) => ({ key: `${k}/${i}`, kind: "term", title: d.dt, body: d.dd }));
      if ("table" in b) return b.table.rows.map(([q, a], i) => ({ key: `${k}/${i}`, kind: "question", title: q, body: a }));
      return []; // figures: captions describe sample drawings, not answers
    }),
  }));
}

/** The client-portal guide: bespoke section shapes, ids from GUIDE_IDS. */
function portalUnits(locale: Locale): { id: string; h: string; units: Draft[] }[] {
  const s = GUIDE[locale].sections;
  const [setUp, clientSees, clientLogs, youSee, resetOff, stuck] = GUIDE_IDS;
  const k = (id: string, ...path: (string | number)[]) => ["portal", id, ...path].join("/");
  const text = (id: string, h: string, part: string, list: string[]): Draft[] =>
    list.map((body, i) => ({ key: k(id, part, i), kind: "text", title: h, body }));
  return [
    {
      id: setUp,
      h: s.setUp.h,
      units: [
        ...s.setUp.steps.map((st, i): Draft => ({ key: k(setUp, "steps", i), kind: "step", title: st.h, body: st.p, step: i + 1 })),
        ...text(setUp, s.setUp.h, "aside", [s.setUp.aside]),
      ],
    },
    {
      id: clientSees,
      h: s.clientSees.h,
      units: [
        ...text(clientSees, s.clientSees.h, "lead", [s.clientSees.lead]),
        ...s.clientSees.canList.map((li, i): Draft => ({ key: k(clientSees, "can", i), kind: "text", title: s.clientSees.can, body: li })),
        ...s.clientSees.neverList.map((li, i): Draft => ({ key: k(clientSees, "never", i), kind: "text", title: s.clientSees.never, body: li })),
        ...text(clientSees, s.clientSees.h, "after", [s.clientSees.after]),
      ],
    },
    {
      id: clientLogs,
      h: s.clientLogs.h,
      units: [
        ...s.clientLogs.steps.map((st, i): Draft => ({ key: k(clientLogs, "steps", i), kind: "step", title: st.h, body: st.p, step: i + 1 })),
        ...text(clientLogs, s.clientLogs.h, "rules", s.clientLogs.rules),
      ],
    },
    { id: youSee, h: s.youSee.h, units: text(youSee, s.youSee.h, "p", s.youSee.p) },
    {
      id: resetOff,
      h: s.resetOff.h,
      units: s.resetOff.items.map((d, i): Draft => ({ key: k(resetOff, "items", i), kind: "term", title: d.dt, body: d.dd })),
    },
    {
      id: stuck,
      h: s.stuck.h,
      units: s.stuck.rows.map(([q, a], i): Draft => ({ key: k(stuck, "rows", i), kind: "question", title: q, body: a })),
    },
  ];
}

const cache = new Map<Locale, GuideUnit[]>();

/** Every unit of every guide in `locale`, in document order. Trainer access only with `admin`. */
export function guideUnits(locale: Locale, { admin = false } = {}): GuideUnit[] {
  let all = cache.get(locale);
  if (!all) {
    all = [
      ...unitsOf("programs", PROGRAMS_GUIDE[locale].title, blockUnits("programs", PROGRAMS_GUIDE[locale].sections)),
      ...unitsOf("portal", GUIDE[locale].title, portalUnits(locale)),
      ...unitsOf("cardio", CARDIO_GUIDE[locale].title, blockUnits("cardio", CARDIO_GUIDE[locale].sections)),
      ...unitsOf("access", TRAINER_ACCESS_GUIDE[locale].title, blockUnits("access", TRAINER_ACCESS_GUIDE[locale].sections)),
    ].map((u, order) => ({ ...u, order }));
    cache.set(locale, all);
  }
  return admin ? all : all.filter((u) => u.guide !== "access");
}

/* ---------- matching ---------- */

/** One character folded for matching: compatibility forms, case, curly quotes. */
const foldChar = (c: string): string =>
  c
    .normalize("NFKC")
    .replace(/ํา/g, "ำ") // keep Thai sara am whole
    .toLowerCase()
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"');

/** Folded text plus, for each folded char, the index of the original char it came from. */
function foldMap(s: string): { text: string; from: number[] } {
  let text = "";
  const from: number[] = [];
  let i = 0;
  for (const c of s) {
    const f = foldChar(c);
    text += f;
    for (let j = 0; j < f.length; j++) from.push(i);
    i += c.length;
  }
  from.push(i);
  return { text, from };
}

export const fold = (s: string): string => foldMap(s).text;

/** The query's words, folded; empty for a blank query. */
export const queryWords = (query: string): string[] => fold(query).trim().split(/\s+/).filter(Boolean);

const segmenters = new Map<string, Intl.Segmenter>();
const segmenter = (locale: string) => {
  let s = segmenters.get(locale);
  if (!s) segmenters.set(locale, (s = new Intl.Segmenter(locale, { granularity: "word" })));
  return s;
};

/** Where each word of `text` starts (Thai has no spaces, so the segmenter finds them). */
function wordStarts(text: string, locale: string): string[] {
  return [...segmenter(locale).segment(text)].filter((s) => s.isWordLike).map((s) => text.slice(s.index));
}

interface Folded {
  title: string;
  /** Title without leading quotes, for "starts with". */
  lead: string;
  titleWords: string[];
  all: string;
}
const folded = new WeakMap<GuideUnit, Folded>();
function foldUnit(u: GuideUnit, locale: Locale): Folded {
  let f = folded.get(u);
  if (!f) {
    const title = fold(u.title);
    f = { title, lead: title.replace(/^["'\s]+/, ""), titleWords: wordStarts(title, locale), all: `${title}\n${fold(u.body)}` };
    folded.set(u, f);
  }
  return f;
}

/** 0 best → 3 body only; null when not every word is in this unit. */
function tier(f: Folded, words: string[], whole: string): number | null {
  if (!words.every((w) => f.all.includes(w))) return null;
  if (f.lead.startsWith(whole)) return 0;
  if (words.every((w) => f.titleWords.some((tw) => tw.startsWith(w)))) return 1;
  if (words.every((w) => f.title.includes(w))) return 2;
  return 3;
}

const KIND_RANK: Record<UnitKind, number> = { section: 0, question: 1, step: 2, term: 3, text: 4 };

/**
 * Old names trainers may still type, mapped to the words the guides use now
 * (the app renamed clients to members). Searching tries the alias too, so a
 * search for "client" still finds the add-a-member and portal answers.
 */
const ALIASES: Record<string, string[]> = {
  client: ["member"],
  clients: ["members"],
};

/** Query words plus any alias each one stands for, deduped, in order — for highlighting hits. */
export function expandWords(words: string[]): string[] {
  return [...new Set(words.flatMap((w) => [w, ...(ALIASES[w] ?? [])]))];
}

export interface GuideHit {
  unit: GuideUnit;
  score: number;
}

/**
 * Units matching every word of `query` in English or Thai, shown in `locale`
 * (the old word "client" also tries "member"). Ranked: title starts with the
 * query, every word starts a title word, every word in the title, body only;
 * then section > question > step > term > text; then document order.
 */
export function searchGuides(query: string, locale: Locale, { admin = false } = {}): GuideHit[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const locales: Locale[] = ["en", "th"];
  const byLocale = new Map(locales.map((l) => [l, new Map(guideUnits(l, { admin }).map((u) => [u.key, u]))]));
  const units = guideUnits(locale, { admin });
  const best = new Map<string, GuideHit>();
  // The query as typed, then each word swapped for its alias ("client" →
  // "member"): the renamed answers still surface for the old word. A unit
  // keeps its best score across the two tries.
  for (const variant of [words, words.map((w) => ALIASES[w]?.[0] ?? w)]) {
    const whole = variant.join(" ");
    for (const unit of units) {
      const pair = locales.map((l) => foldUnit(byLocale.get(l)!.get(unit.key)!, l));
      let score = Math.min(...pair.map((f) => tier(f, variant, whole) ?? 9));
      // A mixed-language query ("ป่วย week"): every word somewhere, in either language.
      if (score === 9 && variant.every((w) => pair.some((f) => f.all.includes(w)))) score = 3;
      if (score >= 9) continue;
      const prev = best.get(unit.key);
      if (!prev || score < prev.score) best.set(unit.key, { unit, score });
    }
  }
  return [...best.values()].sort(
    (a, b) => a.score - b.score || KIND_RANK[a.unit.kind] - KIND_RANK[b.unit.kind] || a.unit.order - b.unit.order,
  );
}

/** Hits grouped per guide, groups ordered by their best hit. */
export function groupHits(hits: GuideHit[]): { guide: GuideId; title: string; hits: GuideHit[] }[] {
  const groups = new Map<GuideId, { guide: GuideId; title: string; hits: GuideHit[] }>();
  for (const h of hits) {
    const g = groups.get(h.unit.guide) ?? { guide: h.unit.guide, title: h.unit.guideTitle, hits: [] };
    g.hits.push(h);
    groups.set(h.unit.guide, g);
  }
  return [...groups.values()];
}

/* ---------- display ---------- */

export interface Part {
  text: string;
  hit: boolean;
}

/** `text` split into parts with every occurrence of every word marked. */
export function highlight(text: string, words: string[]): Part[] {
  const { text: f, from } = foldMap(text);
  const ranges: [number, number][] = [];
  for (const w of words) {
    for (let i = f.indexOf(w); i !== -1 && w; i = f.indexOf(w, i + w.length)) ranges.push([from[i], from[i + w.length]]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const parts: Part[] = [];
  let at = 0;
  for (const [s, e] of ranges) {
    if (e <= at) continue;
    const start = Math.max(s, at);
    if (start > at) parts.push({ text: text.slice(at, start), hit: false });
    parts.push({ text: text.slice(start, e), hit: true });
    at = e;
  }
  if (at < text.length || !parts.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
}

/**
 * A window of `text` around the first hit, cut only at word boundaries (the
 * segmenter knows where Thai words end), with ellipses where it was cut and
 * every word marked.
 */
export function snippet(text: string, words: string[], locale: Locale, { before = 32, length = 120 } = {}): Part[] {
  const { text: f, from } = foldMap(text);
  const firsts = words.map((w) => f.indexOf(w)).filter((i) => i >= 0);
  const hit = firsts.length ? from[Math.min(...firsts)] : 0;
  if (text.length <= length) return highlight(text, words);
  const bounds = [...segmenter(locale).segment(text)].map((s) => s.index).concat(text.length);
  const want = Math.max(0, hit - before);
  const start = want === 0 ? 0 : (bounds.filter((b) => b <= want && /\s/.test(text[b - 1] ?? " ")).at(-1) ?? bounds.filter((b) => b <= want).at(-1) ?? 0);
  const wantEnd = Math.min(text.length, start + length);
  const end = bounds.find((b) => b >= wantEnd) ?? text.length;
  const body = text.slice(start, end).trim();
  const parts = highlight(body, words);
  if (start > 0) parts.unshift({ text: "…", hit: false });
  if (end < text.length) parts.push({ text: "…", hit: false });
  return parts;
}

/* ---------- empty state ---------- */

/** The Q&A rows: Programs › Quick answers, then Portal › When something doesn't work. */
export const commonQuestions = (locale: Locale): GuideUnit[] =>
  guideUnits(locale).filter((u) => u.kind === "question" && ["answers", "stuck"].includes(u.sectionId));

/** Every section, grouped per guide, in reading order. */
export function guideSections(locale: Locale, { admin = false } = {}): { guide: GuideId; title: string; units: GuideUnit[] }[] {
  const groups = new Map<GuideId, { guide: GuideId; title: string; units: GuideUnit[] }>();
  for (const u of guideUnits(locale, { admin })) {
    if (u.kind !== "section") continue;
    const g = groups.get(u.guide) ?? { guide: u.guide, title: u.guideTitle, units: [] };
    g.units.push(u);
    groups.set(u.guide, g);
  }
  return [...groups.values()];
}
