import type { Locale } from "./portal/messages";

/** Banner copy for every release — generic, so a new version needs nothing written. */
export const BANNER_TEXT: Record<
  Locale,
  { title: (v: string) => string; body: string; more: string; dismiss: string }
> = {
  en: {
    title: (v) => `Program Tracker has been updated to v${v}`,
    body: "A new version is live. See what changed.",
    more: "What's new",
    dismiss: "Dismiss",
  },
  th: {
    title: (v) => `Program Tracker อัปเดตเป็นเวอร์ชัน v${v} แล้ว`,
    body: "มีเวอร์ชันใหม่แล้ว ดูว่ามีอะไรเปลี่ยนบ้าง",
    more: "มีอะไรใหม่",
    dismiss: "ปิด",
  },
};
