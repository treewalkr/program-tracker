import type { Locale } from "$lib/portal/messages";
import type { Impersonator, ViewEnded } from "$lib/api/auth";

/**
 * "View as trainer" — the words and the clock behind the banner the admin sees
 * while looking at a trainer's account. Pure, so both languages are testable.
 */

/** "Kai Tan" → "Kai": what Allow edits asks the admin to type back (the API checks the same). */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Whole minutes left until `iso`, rounded up (a view with 30 s left still says 1 min); 0 once past. */
export function minutesLeft(iso: string, now: number): number {
  const ms = new Date(iso).getTime() - now;
  return ms <= 0 ? 0 : Math.ceil(ms / 60_000);
}

/** What the banner shows right now. */
export type ViewState = "read-only" | "edits" | "ended";

export function viewState(view: Impersonator, now: number): ViewState {
  if (view.ended || minutesLeft(view.until, now) === 0) return "ended";
  return view.writesUntil && minutesLeft(view.writesUntil, now) > 0 ? "edits" : "read-only";
}

/** Why the view ended, when the server hasn't said yet (the clock ran out in the browser). */
export const endedReason = (view: Impersonator): ViewEnded => view.ended ?? "expired";

interface ViewText {
  viewingAs: string;
  readOnly: string;
  editsOn: string;
  minLeft: (n: number) => string;
  allowEdits: string;
  lock: string;
  stop: string;
  stopping: string;
  ended: (name: string) => string;
  why: Record<ViewEnded, string>;
  backTo: (handle: string | null) => string;
  dialogTitle: (first: string) => string;
  dialogBody: (first: string) => string;
  typeToConfirm: (first: string) => string;
  cancel: string;
  confirm: string;
  /** Screen readers: what the bar is. */
  region: string;
}

export const VIEW_TEXT: Record<Locale, ViewText> = {
  en: {
    viewingAs: "Viewing as",
    readOnly: "Read-only",
    editsOn: "Edits on",
    minLeft: (n) => `${n} min left`,
    allowEdits: "Allow edits",
    lock: "Lock",
    stop: "Stop",
    stopping: "Stopping…",
    ended: (name) => `Your view of ${name} has ended`,
    why: {
      expired: "30 minutes are up.",
      flag_off: "View as trainer was switched off.",
      disabled: "Their account was disabled.",
    },
    backTo: (handle) => (handle ? `Back to ${handle}` : "Back to Trainers"),
    dialogTitle: (first) => `Allow edits as ${first}?`,
    dialogBody: (first) =>
      `What you change saves to ${first}'s account, and each change is logged. Emails and client messages still never send. Edits switch off after 10 minutes.`,
    typeToConfirm: (first) => `Type ${first} to confirm`,
    cancel: "Cancel",
    confirm: "Allow edits for 10 min",
    region: "Viewing as another trainer",
  },
  th: {
    viewingAs: "กำลังดูในฐานะ",
    readOnly: "ดูอย่างเดียว",
    editsOn: "แก้ไขได้",
    minLeft: (n) => `เหลือ ${n} นาที`,
    allowEdits: "อนุญาตให้แก้ไข",
    lock: "ล็อก",
    stop: "หยุดดู",
    stopping: "กำลังหยุด…",
    ended: (name) => `การดูบัญชีของ ${name} จบแล้ว`,
    why: {
      expired: "ครบ 30 นาทีแล้ว",
      flag_off: "ฟีเจอร์ดูในฐานะเทรนเนอร์ถูกปิด",
      disabled: "บัญชีนี้ถูกระงับแล้ว",
    },
    backTo: (handle) => (handle ? `กลับไปที่ ${handle}` : "กลับไปหน้าเทรนเนอร์"),
    dialogTitle: (first) => `อนุญาตให้แก้ไขในฐานะ ${first}?`,
    dialogBody: (first) =>
      `สิ่งที่คุณแก้จะบันทึกลงบัญชีของ ${first} และทุกการแก้ไขถูกเก็บประวัติไว้ อีเมลและข้อความถึงลูกค้าจะไม่ถูกส่งออกไป สิทธิ์แก้ไขจะปิดเองใน 10 นาที`,
    typeToConfirm: (first) => `พิมพ์ ${first} เพื่อยืนยัน`,
    cancel: "ยกเลิก",
    confirm: "อนุญาต 10 นาที",
    region: "กำลังดูในฐานะเทรนเนอร์คนอื่น",
  },
};

/** Whether the typed confirmation matches (case and surrounding spaces don't matter). */
export const confirmMatches = (typed: string, name: string) =>
  typed.trim().toLocaleLowerCase() === firstName(name).toLocaleLowerCase();
