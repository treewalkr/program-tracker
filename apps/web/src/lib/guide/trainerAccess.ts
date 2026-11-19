import type { Locale } from "$lib/portal/messages";
import type { ProgramsGuide } from "./programsWeeks";

/**
 * The "Trainer access" guide, for the admin: adding a trainer, what each
 * label on the Trainers page means, turning access off and on, removing
 * invites and View as. Same block format as Programs & weeks (no figures);
 * trainer buttons stay in English in both languages.
 */
export const TRAINER_ACCESS_IDS = ["add", "labels", "off", "remove", "view-as"] as const;
const [add, labels, off, remove, viewAs] = TRAINER_ACCESS_IDS;

const en: ProgramsGuide = {
  title: "Trainer access",
  sub: "Who can sign in to Program Tracker, and how to add, pause or remove a trainer. For the admin.",
  crumbs: ["Guide", "Trainer access"],
  onThisPage: "On this page",
  intro:
    "Trainers sign in with Google — there are no passwords. Only an email you've added on **Trainers** can get in, and you can turn anyone's access off at any time.",
  sections: [
    {
      id: add,
      h: "Add a trainer",
      blocks: [
        {
          steps: [
            {
              h: "Add their name and Google email",
              p: "On *Trainers*, under *Add a trainer*. Use the address they sign in to Google with — a work email that isn't a Google account won't get in.",
            },
            {
              h: "Send them the sign-in link",
              p: "We don't email anyone. Press *Copy sign-in link* and send it the way you usually talk to them.",
            },
            {
              h: "They sign in with Google",
              p: "Their first sign-in turns them from ⟦neutral|Invited⟧ to ⟦good|Active⟧.",
            },
          ],
        },
      ],
    },
    {
      id: labels,
      h: "What the labels mean",
      blocks: [
        {
          defs: [
            { dt: "⟦good|Active⟧", dd: "Has signed in at least once and can sign in now." },
            { dt: "⟦neutral|Invited⟧", dd: "Added, but hasn't signed in yet. The invite doesn't expire." },
            { dt: "⟦bad|Disabled⟧", dd: "Access is off: they can't sign in. The row says when it was turned off." },
            { dt: "⟦warn|Inactive⟧", dd: "Active, but no sign-in for over 30 days. Just a nudge — nothing changes for them." },
            { dt: "Admin", dd: "You. The admin's access is always on." },
          ],
        },
      ],
    },
    {
      id: off,
      h: "Turn access off and on",
      blocks: [
        {
          p: "*Turn access off* signs them out everywhere straight away and blocks their next sign-in. Their clients, programs and logs are kept.",
        },
        { p: "*Turn access on* lets them back in with the same Google account, with everything as they left it." },
      ],
    },
    {
      id: remove,
      h: "Remove an invite",
      blocks: [
        {
          p: "You can remove a trainer only while they're ⟦neutral|Invited⟧ and have no clients — a mistyped email, or someone who never started. Once they've signed in or have clients, turn their access off instead.",
        },
        { p: "When there are two or more unused invites, *Remove N unused invites* under the list clears them in one go." },
      ],
    },
    {
      id: viewAs,
      h: "View as a trainer",
      blocks: [
        {
          p: "*View as* opens the app the way that trainer sees it, read-only, for 30 minutes — handy when they report something you can't reproduce. Every view is recorded in their *Access log*, along with any change made while edits were allowed.",
        },
        { aside: "The button shows once it's switched on in *Settings → Admin → Features*." },
      ],
    },
  ],
};

const th: ProgramsGuide = {
  title: "สิทธิ์เข้าใช้ของเทรนเนอร์",
  sub: "ใครเข้า Program Tracker ได้บ้าง และวิธีเพิ่ม ปิด หรือลบเทรนเนอร์ สำหรับแอดมิน",
  crumbs: ["คู่มือ", "สิทธิ์เข้าใช้ของเทรนเนอร์"],
  onThisPage: "ในหน้านี้",
  intro:
    "เทรนเนอร์เข้าระบบด้วย Google ไม่มีรหัสผ่าน เข้าได้เฉพาะอีเมลที่คุณเพิ่มไว้ในหน้า **Trainers** และคุณปิดสิทธิ์ใครก็ได้ทุกเมื่อ",
  sections: [
    {
      id: add,
      h: "เพิ่มเทรนเนอร์",
      blocks: [
        {
          steps: [
            {
              h: "ใส่ชื่อและอีเมล Google",
              p: "ในหน้า *Trainers* ตรง *Add a trainer* ใช้อีเมลเดียวกับที่เขาใช้เข้า Google ถ้าเป็นอีเมลที่ทำงานที่ไม่ใช่บัญชี Google จะเข้าไม่ได้",
            },
            {
              h: "ส่งลิงก์เข้าระบบให้เขา",
              p: "ระบบไม่ส่งอีเมลให้ใคร กด *Copy sign-in link* แล้วส่งทางที่คุยกันอยู่แล้ว",
            },
            {
              h: "เขาเข้าระบบด้วย Google",
              p: "พอเข้าครั้งแรก ป้ายจะเปลี่ยนจาก ⟦neutral|Invited⟧ เป็น ⟦good|Active⟧",
            },
          ],
        },
      ],
    },
    {
      id: labels,
      h: "ป้ายแต่ละแบบหมายถึงอะไร",
      blocks: [
        {
          defs: [
            { dt: "⟦good|Active⟧", dd: "เคยเข้าระบบแล้ว และตอนนี้เข้าได้" },
            { dt: "⟦neutral|Invited⟧", dd: "เพิ่มไว้แล้วแต่ยังไม่เคยเข้าระบบ คำเชิญไม่มีวันหมดอายุ" },
            { dt: "⟦bad|Disabled⟧", dd: "ปิดสิทธิ์แล้ว เข้าระบบไม่ได้ ในแถวจะบอกว่าปิดไปเมื่อไร" },
            { dt: "⟦warn|Inactive⟧", dd: "ยังเปิดสิทธิ์อยู่ แต่ไม่ได้เข้าระบบเกิน 30 วัน แค่เตือนให้รู้ ฝั่งเขาไม่มีอะไรเปลี่ยน" },
            { dt: "Admin", dd: "ตัวคุณเอง สิทธิ์ของแอดมินเปิดไว้ตลอด" },
          ],
        },
      ],
    },
    {
      id: off,
      h: "ปิดและเปิดสิทธิ์",
      blocks: [
        {
          p: "*Turn access off* จะพาเขาออกจากระบบทุกเครื่องทันที และกันไม่ให้เข้าครั้งต่อไป ลูกค้า โปรแกรม และบันทึกการฝึกของเขายังอยู่ครบ",
        },
        { p: "*Turn access on* ให้เขากลับมาเข้าด้วยบัญชี Google เดิม ทุกอย่างอยู่เหมือนตอนที่ปิดไว้" },
      ],
    },
    {
      id: remove,
      h: "ลบคำเชิญ",
      blocks: [
        {
          p: "ลบเทรนเนอร์ได้เฉพาะตอนที่ยังเป็น ⟦neutral|Invited⟧ และไม่มีลูกค้า เช่น พิมพ์อีเมลผิด หรือคนที่ไม่ได้เริ่มใช้ ถ้าเขาเคยเข้าระบบหรือมีลูกค้าแล้ว ให้ปิดสิทธิ์แทน",
        },
        { p: "ถ้ามีคำเชิญที่ยังไม่ได้ใช้ตั้งแต่สองรายการขึ้นไป ปุ่ม *Remove N unused invites* ใต้รายชื่อจะลบให้ในครั้งเดียว" },
      ],
    },
    {
      id: viewAs,
      h: "ดูแอปแบบที่เทรนเนอร์เห็น",
      blocks: [
        {
          p: "*View as* เปิดแอปให้เห็นแบบเดียวกับที่เทรนเนอร์คนนั้นเห็น อ่านได้อย่างเดียว นาน 30 นาที เหมาะกับตอนที่เขาแจ้งปัญหาแล้วคุณลองเองไม่เจอ ทุกครั้งที่เปิดดูจะถูกบันทึกไว้ใน *Access log* ของเขา รวมถึงทุกการแก้ไขระหว่างที่เปิดให้แก้ได้",
        },
        { aside: "ปุ่มนี้จะขึ้นเมื่อเปิดสวิตช์ไว้ใน *Settings → Admin → Features*" },
      ],
    },
  ],
};

export const TRAINER_ACCESS_GUIDE: Record<Locale, ProgramsGuide> = { en, th };
