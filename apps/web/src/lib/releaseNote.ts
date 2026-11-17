import type { Locale } from "./portal/messages";

/** Toast copy for every release — generic, so a new version needs nothing written. */
export const BANNER_TEXT: Record<
  Locale,
  { title: (v: string) => string; more: string; dismiss: string }
> = {
  en: {
    title: (v) => `Updated to v${v}`,
    more: "See what's new",
    dismiss: "Dismiss",
  },
  th: {
    title: (v) => `อัปเดตเป็น v${v} แล้ว`,
    more: "ดูสิ่งที่เปลี่ยนแปลง",
    dismiss: "ปิด",
  },
};

/** What's new page strings. `latest` is the pill on the newest release. */
export const PAGE_TEXT: Record<Locale, { title: string; sub: string; empty: string; latest: string; kinds: Record<string, string> }> = {
  en: { title: "What's new", sub: "Changes to Program Tracker, newest first.", empty: "Nothing released yet.", latest: "Latest", kinds: {} },
  th: {
    title: "มีอะไรใหม่",
    sub: "การเปลี่ยนแปลงของ Program Tracker เรียงจากใหม่ไปเก่า",
    empty: "ยังไม่มีการปล่อยเวอร์ชัน",
    latest: "ล่าสุด",
    kinds: { New: "ใหม่", Improved: "ปรับปรุง", Fixed: "แก้ไข" },
  },
};

/**
 * Pages where a floating notice would cover the work: What's new itself, the session
 * logger, chat and AI generation, the new-program builder, and the exercise list's
 * selection bar. The toast waits and shows on the next page that isn't one of these.
 */
const QUIET = [/^\/whats-new\/?$/, /^\/clients\/[^/]+\/(log|chat|generate)\/?$/, /^\/clients\/[^/]+\/programs\/new\/?$/, /^\/exercises\/?$/];
export const quietRoute = (pathname: string): boolean => QUIET.some((re) => re.test(pathname));
