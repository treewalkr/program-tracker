import type { Locale } from "./portal/messages";

/**
 * The short, two-language headline shown once per release in the trainer app's
 * "new release" banner. Hand-written highlights, not the full changelog:
 * add an entry when you cut a release worth announcing. A release without an
 * entry here simply shows no banner.
 */
export interface ReleaseNote {
  version: string;
  copy: Record<Locale, { title: string; points: string[] }>;
}

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    version: "0.1.32",
    copy: {
      en: {
        title: "Feedback now has an In progress status",
        points: [
          "Tickets move Accepted → In progress → Done, so you can see when yours is being worked on.",
          "You get an email when your ticket moves to In progress.",
        ],
      },
      th: {
        title: "ฟีดแบ็กมีสถานะ “กำลังดำเนินการ” แล้ว",
        points: [
          "ตั๋วจะเดินจาก รับเรื่องแล้ว → กำลังดำเนินการ → เสร็จแล้ว ดูได้ว่าเรื่องของคุณกำลังถูกแก้อยู่หรือยัง",
          "เมื่อตั๋วของคุณเปลี่ยนเป็นกำลังดำเนินการ คุณจะได้รับอีเมลแจ้ง",
        ],
      },
    },
  },
];

/** The note to announce: only for the newest release, and only if it has one. */
export function noteFor(latest: string | null, notes: ReleaseNote[] = RELEASE_NOTES): ReleaseNote | null {
  return latest ? (notes.find((n) => n.version === latest) ?? null) : null;
}

/** Banner chrome strings (the notes themselves carry their own copy). */
export const BANNER_TEXT: Record<Locale, { badge: (v: string) => string; more: string; dismiss: string }> = {
  en: { badge: (v) => `New in v${v}`, more: "See all changes", dismiss: "Dismiss" },
  th: { badge: (v) => `ใหม่ใน v${v}`, more: "ดูการเปลี่ยนแปลงทั้งหมด", dismiss: "ปิด" },
};
