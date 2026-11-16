import type { Locale } from "./messages";

/**
 * The LINE-ready line a trainer pastes to a client, in the client's language.
 * The trainer app stays English; this is the one string it writes in Thai.
 */

const LINES: Record<Locale, (name: string, link: string) => string> = {
  en: (name, link) => `Hi ${name}! Your training program is here. Open it on your phone, no password needed: ${link}`,
  th: (name, link) => `สวัสดี ${name} โปรแกรมฝึกของคุณอยู่ที่ลิงก์นี้ เปิดบนมือถือได้เลย ไม่ต้องใช้รหัสผ่าน: ${link}`,
};

export const lineMessage = (locale: Locale, firstName: string, link: string) => LINES[locale](firstName.trim(), link);

/**
 * The client's language when nothing better is known: Thai when their name is
 * written in Thai, else English. (The portal remembers a client's choice on
 * their phone only, so the server can't tell us.)
 */
export const guessClientLocale = (name: string): Locale => (/[\u0E00-\u0E7F]/.test(name) ? "th" : "en");
