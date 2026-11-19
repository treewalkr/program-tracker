import { en as portalEn, th as portalTh } from "$lib/portal/messages";
import type { Locale } from "$lib/portal/messages";

/**
 * The "Programs & weeks" guide, in English and Thai: how a block's calendar
 * works and what to do when real life doesn't follow it. Trainer buttons stay
 * in English in both (the trainer app is English); anything the client sees is
 * quoted from the portal's own dictionary.
 *
 * Each section is a list of blocks so the page renders them in order without
 * a bespoke template per section.
 * Inline markup: **bold**, *italic*, `code`, and ⟦tone|label⟧ for a Pill.
 * A `fig` block is a drawn diagram (see the page's figure map) with a caption.
 */
export type GuideFig = "weeks" | "edit";

export type Block =
  | { fig: GuideFig; caption: string }
  | { p: string }
  | { aside: string }
  | { steps: { h: string; p: string }[] }
  | { list: string[] }
  | { defs: { dt: string; dd: string }[] }
  | { table: { head: [string, string]; rows: [string, string][] } };

export interface GuideSection {
  id: string;
  h: string;
  blocks: Block[];
}

export interface ProgramsGuide {
  title: string;
  sub: string;
  crumbs: [string, string];
  onThisPage: string;
  intro: string;
  sections: GuideSection[];
}

/** Section ids, shared by both languages so links survive a language switch. */
export const PROGRAMS_GUIDE_IDS = ["start", "weeks", "edit", "missed", "ab", "next-block", "ai", "move-in", "answers"] as const;
const [start, weeks, edit, missed, ab, nextBlock, ai, moveIn, answers] = PROGRAMS_GUIDE_IDS;

const en: ProgramsGuide = {
  title: "Programs & weeks",
  sub: "When a program starts, how its weeks run, and what to do when your client's real week doesn't match the plan.",
  crumbs: ["Guide", "Programs & weeks"],
  onThisPage: "On this page",
  intro:
    "A program is one training block for one client. Its weeks run on the calendar from the day **Week 1 starts**, and your client sees only the week they're in (plus a look at next week). Most surprises — a session the client can't see, a week that ended early — come from that calendar, so this guide starts there.",
  sections: [
    {
      id: start,
      h: "Start a program",
      blocks: [
        { p: "A new program is a ⟦neutral|draft⟧. Your client sees nothing of it until you activate it." },
        {
          steps: [
            { h: "Press *Activate program*", p: "On the program page, or *Activate* on the Generate page after you create a program from an AI draft." },
            {
              h: "Choose when Week 1 starts",
              p: "*Today*, *Next Monday*, or any date in the field. The line underneath says what it means: `Starts in 4 days · Mon 23 Nov`, or `Today is W3 · 17–23 Nov` for a date in the past.",
            },
            { h: "Confirm", p: "Press *Activate program*. The client's previous active program is archived automatically, with all its logs." },
          ],
        },
        {
          list: [
            `**A future date** — the client sees "${portalEn["week.startsOn"].replace("{date}", "Mon 23 Nov")}" and can look through Week 1. They can log from that day.`,
            "**A past date** — for a client who is already a few weeks in (see *Move an existing client in*). The earliest date allowed still keeps today inside the block.",
            "**Up to 8 weeks ahead.**",
          ],
        },
        {
          aside:
            "**Change it later.** Under the program's name you'll see `Week 1 started Tue 10 Nov · now W2`. Press *Change*, pick the new date, press *Continue*. Before anything moves, you see which logged sessions land in a different week; press *Move Week 1* to confirm. Logged sessions keep their dates.",
        },
      ],
    },
    {
      id: weeks,
      h: "How weeks work",
      blocks: [
        {
          p: "A week is **7 days counted from the day Week 1 starts** — not Monday to Sunday. Start a program on a Tuesday and every week runs Tuesday to Monday.",
        },
        {
          fig: "weeks",
          caption: "A program activated on Tue 10 Nov. Each week is 7 days from the day Week 1 starts, so every week runs Tuesday to Monday (sample dates).",
        },
        {
          defs: [
            {
              dt: "The week tabs show it",
              dd: "Each tab carries its dates (`W2 · 17–23 Nov`). The client's current week is marked ⟦neutral|now⟧, weeks that have ended are greyed out, and the program page opens on the client's week.",
            },
            { dt: "Weeks follow the calendar", dd: "Week 3 starts 14 days after Week 1, whether or not the client trained. Nothing pauses on its own." },
            {
              dt: "A session has a day, not a date",
              dd: "Each session sits on a weekday (or *Any day*) inside its week. When the client logs it, the log keeps the real date, so Thursday's session done on Friday is fine.",
            },
            { dt: "A session belongs to its week", dd: "A Week 1 session can only be done during Week 1's 7 days. It can't move into Week 2." },
            { dt: "Length", dd: "A program holds 1 to 26 weeks. Four is only the default." },
            { dt: "Cardio target", dd: "The client's weekly cardio total counts Monday to Sunday, so it may not line up with a block week that starts mid-week." },
          ],
        },
      ],
    },
    {
      id: edit,
      h: "Change a program mid-block",
      blocks: [
        {
          p: "Above the calendar, **Changes apply to** decides how far an edit goes: *W2 and later* (the default) or *W2 only*. With *and later*, these go to every later week the client hasn't finished:",
        },
        {
          list: [
            "adding, removing or renaming a session",
            "adding, removing or swapping an exercise",
            "moving a session to another day",
          ],
        },
        {
          fig: "edit",
          caption: "Swap an exercise in W2 with W2 and later, and W4 gets the swap too. W3 already has logs for it, so it keeps the old exercise, and W1 has ended, so it never changes (sample dates).",
        },
        { p: "These stay per week, so your progression survives: sets, reps, loads, rest, notes, exercise order, groups and cardio values." },
        {
          list: [
            "**Weeks that have ended never change.** Open an ended week and it says so: `W1 ended 16 Nov — Ann is in W2.` An edit there still goes on to W2 and later.",
            "**An added exercise follows the block's progression.** Add one at 40 kg with +2.5 kg a week and the later weeks get 42.5, 45, 47.5…",
            "**Weeks with logs are protected.** If a later week already has logs for that session or exercise, removing or swapping it skips that week, and the message says which: `W3 kept: has logs`.",
            "**A/B blocks** only change the later weeks with the same letter.",
            "**Undo** in the message puts the later weeks back; your edit stays on the week you made it in.",
          ],
        },
        {
          aside:
            "**Copy this week to…** is different: it overwrites the whole target weeks, loads and all, so it wipes their progression. Use it to reset weeks, not to add one session.",
        },
      ],
    },
    {
      id: missed,
      h: "Missed and late sessions",
      blocks: [
        {
          defs: [
            {
              dt: "Done later the same week",
              dd: `Fine. A missed session moves to "${portalEn["week.earlier"]}" on the client's page, and they can log it any later day of that week, dated the day they did it. Your week grid shows it as done with \`logged Fri 20 Nov\`.`,
            },
            {
              dt: "Not done by the end of the week",
              dd: "The client can no longer log it, and it counts as missed. A session isn't called missed for the first **2 days**, because clients report late. If fewer than 60% of the sessions due are logged, you get a ⟦warn|Low adherence⟧ signal.",
            },
            {
              dt: "Done the day after the week ends",
              dd: "That day already belongs to the next week, so the client can't log it. You can log it yourself from the client page, but it counts toward the new week. Keep the last day of a week light, or ask clients to log on the day.",
            },
            {
              dt: "Away for a week or more",
              dd: "There's no pause button. Instead, move Week 1 later by the time they were away (*Change* under the program's name). The week they missed comes round again; the confirm step shows which logged sessions change week first.",
            },
            { dt: "Weeks before you activated", dd: "Never count as missed and aren't part of adherence — even when Week 1 starts in the past." },
          ],
        },
      ],
    },
    {
      id: ab,
      h: "A/B weeks",
      blocks: [
        {
          p: "Use A/B when odd and even weeks train differently. Odd weeks are **A**, even weeks are **B**, for any block length. There's no C, and no AABB.",
        },
        {
          list: [
            "**New program:** set *Weeks* to *A/B weeks*. You get *Week A* and *Week B* tabs; B starts as a copy of A (*Copy from A* resets it).",
            "**Existing program:** the *Weeks* switch above the tabs tags the weeks A and B without changing what's in them. Edit W2, then *Copy this week to…* › *Every B week*.",
            "**Each week keeps its own sessions.** With *W3 and later*, an edit goes to the later weeks with the same letter only.",
            "**The AI keeps the letters.** Drafting a week builds on the last week with the same letter (W5 from W3).",
            "**Your client never sees A or B**, just that week's sessions.",
          ],
        },
      ],
    },
    {
      id: nextBlock,
      h: "Next block, or edit this one?",
      blocks: [
        {
          defs: [
            {
              dt: "Tweak within the phase → edit the current program",
              dd: "Same program, same week numbers. Each save is a new version (`v2`, `v3`). Drafting a week with AI (*Generate week*) also updates this program.",
            },
            {
              dt: "New phase → a new program",
              dd: "*Generate next block* on the client page, or build one by hand. It's saved as a draft; when you activate it, the old program is archived with its logs and Week 1 starts again on the date you pick.",
            },
            { dt: "Longer block → add weeks", dd: "A program holds up to 26 weeks. Adding weeks keeps the same program and week numbers." },
          ],
        },
      ],
    },
    {
      id: ai,
      h: "Steer the AI",
      blocks: [
        {
          defs: [
            {
              dt: "Block direction — for every week of the block",
              dd: "On *Generate*, tick *Keep as the block's direction* and the note becomes the program's **Block direction** (up to 500 characters). Every weekly draft follows it until you change it, and the next block carries it over.",
            },
            {
              dt: "Instructions — for this draft only",
              dd: "*What should this week do?* is read once, for the draft you're making: “travelling, hotel gym only”. *Your instructions as the AI gets them* shows exactly what was sent.",
            },
            { dt: "Always applied", dd: "The client's limitations, the week's plan in *Block phasing* (e.g. deload) and your coaching rules." },
          ],
        },
      ],
    },
    {
      id: moveIn,
      h: "Move an existing client in",
      blocks: [
        { p: "For a client you already coach in notes, LINE or a spreadsheet:" },
        {
          steps: [
            { h: "Add the client", p: "Goals, limitations and training days first; 1RMs can wait." },
            { h: "Paste their notes", p: "*New program* › *Paste notes* › *Read it*. Check the exercise names it matched; the app remembers them for next time." },
            {
              h: "Save their history",
              p: "If the notes have the numbers they actually did, press *Save history* and tell it when the latest week started. Past training lands as archived programs with real logs, so progress and the AI start with real data. Sessions without numbers aren't logged.",
            },
            { h: "Draft the current block", p: "*Use this* turns one week (or Week A and B) into a new draft program. Edit the later weeks if they progress." },
            {
              h: "Activate it on the right week",
              p: "If the client is already in week 3, pick a Week 1 start date two weeks back. Today becomes W3, and weeks 1–2 never count as missed.",
            },
          ],
        },
      ],
    },
    {
      id: answers,
      h: "Quick answers",
      blocks: [
        {
          table: {
            head: ["What happened", "What to do"],
            rows: [
              ["“My client can't see the session I added.”", "You probably added it to an ended week with *W1 only*. Open the client's current week (the page opens there) and add it with *W2 and later*."],
              ["“I want to start next week.”", "Press *Activate program* and choose *Next Monday*."],
              ["“The weeks start on a weird day.”", "Week 1 started the day it was activated. *Change* under the program's name and pick a Monday."],
              ["“My client was sick for a week.”", "Move Week 1 a week later with *Change*, so they repeat the week they missed."],
              ["“My client did Monday's session on Tuesday.”", "Nothing to do. It counts, dated Tuesday."],
              ["“The week shows Week 9 and nothing in it.”", "The block has run past its last week. Generate or build the next block and activate it."],
            ],
          },
        },
      ],
    },
  ],
};

const th: ProgramsGuide = {
  title: "โปรแกรมและสัปดาห์",
  sub: "โปรแกรมเริ่มเมื่อไหร่ แต่ละสัปดาห์นับยังไง และควรทำยังไงถ้าสัปดาห์จริงของเมมเบอร์ไม่ตรงกับแผน",
  crumbs: ["คู่มือ", "โปรแกรมและสัปดาห์"],
  onThisPage: "ในหน้านี้",
  intro:
    "โปรแกรมหนึ่งโปรแกรมคือบล็อกการซ้อมหนึ่งบล็อกของเมมเบอร์หนึ่งคน สัปดาห์ในโปรแกรมเดินตามปฏิทิน นับจาก**วันเริ่มสัปดาห์ที่ 1** เมมเบอร์เห็นแค่สัปดาห์ที่ตัวเองอยู่ (และแอบดูสัปดาห์หน้าได้) เรื่องที่ชวนงงส่วนใหญ่ เช่น เมมเบอร์มองไม่เห็นเซสชัน หรือสัปดาห์จบเร็วกว่าที่คิด ก็มาจากปฏิทินนี้แหละ คู่มือนี้เลยเริ่มจากตรงนั้น",
  sections: [
    {
      id: start,
      h: "เริ่มโปรแกรม",
      blocks: [
        { p: "โปรแกรมใหม่จะเป็น ⟦neutral|draft⟧ ก่อน เมมเบอร์จะยังไม่เห็นอะไรเลยจนกว่าคุณจะเปิดใช้" },
        {
          steps: [
            { h: "กด *Activate program*", p: "กดที่หน้าโปรแกรม หรือกด *Activate* ที่หน้า Generate หลังสร้างโปรแกรมจากร่างของ AI" },
            {
              h: "เลือกวันเริ่มสัปดาห์ที่ 1",
              p: "เลือก *Today* *Next Monday* หรือใส่วันที่เองก็ได้ บรรทัดด้านล่างจะบอกว่าวันนั้นหมายถึงอะไร เช่น `Starts in 4 days · Mon 23 Nov` หรือถ้าเป็นวันที่ย้อนหลังจะขึ้นว่า `Today is W3 · 17–23 Nov`",
            },
            { h: "ยืนยัน", p: "กด *Activate program* แล้วระบบจะเก็บโปรแกรมเดิมที่เมมเบอร์ใช้อยู่เข้าคลังให้อัตโนมัติ บันทึกทั้งหมดยังอยู่ครบ" },
          ],
        },
        {
          list: [
            `**วันที่ในอนาคต** เมมเบอร์จะเห็นข้อความ "${portalTh["week.startsOn"].replace("{date}", "จันทร์ 23 พ.ย.")}" และดูสัปดาห์ที่ 1 ล่วงหน้าได้ เริ่มบันทึกได้ตั้งแต่วันนั้น`,
            "**วันที่ย้อนหลัง** ใช้กับเมมเบอร์ที่ซ้อมมาได้สองสามสัปดาห์แล้ว (ดูหัวข้อ *ย้ายเมมเบอร์เดิมเข้ามา*) ย้อนได้ไกลสุดเท่าที่วันนี้ยังอยู่ในบล็อก",
            "**ล่วงหน้าได้ไม่เกิน 8 สัปดาห์**",
          ],
        },
        {
          aside:
            "**เปลี่ยนทีหลังได้** ใต้ชื่อโปรแกรมจะมีบรรทัด `Week 1 started Tue 10 Nov · now W2` กด *Change* เลือกวันใหม่ แล้วกด *Continue* ก่อนจะย้ายจริง ระบบจะบอกว่าเซสชันไหนที่บันทึกไว้แล้วจะย้ายไปอยู่สัปดาห์อื่น ถ้าโอเคก็กด *Move Week 1* ส่วนบันทึกทุกรายการยังลงวันที่เดิม",
        },
      ],
    },
    {
      id: weeks,
      h: "สัปดาห์นับยังไง",
      blocks: [
        {
          p: "หนึ่งสัปดาห์คือ **7 วัน นับจากวันเริ่มสัปดาห์ที่ 1** ไม่ใช่จันทร์ถึงอาทิตย์ ถ้าเริ่มโปรแกรมวันอังคาร ทุกสัปดาห์ก็จะเป็นอังคารถึงจันทร์",
        },
        {
          fig: "weeks",
          caption: "โปรแกรมนี้เปิดใช้วันอังคารที่ 10 พ.ย. แต่ละสัปดาห์คือ 7 วันนับจากวันเริ่มสัปดาห์ที่ 1 ทุกสัปดาห์จึงเป็นอังคารถึงจันทร์ (วัน\u2060ที่ตัวอย่าง)",
        },
        {
          defs: [
            {
              dt: "ดูได้จากแท็บสัปดาห์",
              dd: "แต่ละแท็บมีวันที่กำกับ (`W2 · 17–23 Nov`) สัปดาห์ที่เมมเบอร์อยู่ตอนนี้มีป้าย ⟦neutral|now⟧ สัปดาห์ที่จบแล้วเป็นสีจาง และหน้าโปรแกรมจะเปิดมาที่สัปดาห์ของเมมเบอร์เลย",
            },
            { dt: "สัปดาห์เดินตามปฏิทิน", dd: "ไม่ว่าเมมเบอร์จะซ้อมหรือไม่ สัปดาห์ที่ 3 ก็เริ่ม 14 วันหลังวันเริ่มสัปดาห์ที่ 1 อยู่ดี ปฏิทินไม่หยุดเดินเอง" },
            {
              dt: "เซสชันมีวัน แต่ไม่มีวันที่",
              dd: "แต่ละเซสชันกำหนดไว้เป็นวันของสัปดาห์ (หรือ *Any day*) พอเมมเบอร์บันทึก ระบบจะเก็บวันที่ที่ทำจริงไว้ เซสชันวันพฤหัสที่มาทำวันศุกร์ก็เลยไม่มีปัญหา",
            },
            { dt: "เซสชันอยู่กับสัปดาห์ของตัวเอง", dd: "เซสชันของสัปดาห์ที่ 1 ทำได้แค่ใน 7 วันของสัปดาห์ที่ 1 ย้ายไปสัปดาห์ที่ 2 ไม่ได้" },
            { dt: "ความยาว", dd: "โปรแกรมหนึ่งมีได้ 1 ถึง 26 สัปดาห์ ส่วน 4 สัปดาห์เป็นแค่ค่าเริ่มต้น" },
            { dt: "เป้าคาร์ดิโอ", dd: "ยอดคาร์ดิโอรายสัปดาห์ของเมมเบอร์นับจันทร์ถึงอาทิตย์ จึงอาจไม่ตรงกับสัปดาห์ของบล็อกที่เริ่มกลางสัปดาห์" },
          ],
        },
      ],
    },
    {
      id: edit,
      h: "แก้โปรแกรมกลางบล็อก",
      blocks: [
        {
          p: "เหนือปฏิทินมีตัวเลือก **Changes apply to** ไว้กำหนดว่าการแก้จะไปถึงไหน มี *W2 and later* (ค่าเริ่มต้น) กับ *W2 only* ถ้าเลือก *and later* การแก้ต่อไปนี้จะไปถึงทุกสัปดาห์หลังจากนั้นที่เมมเบอร์ยังซ้อมไม่จบด้วย",
        },
        {
          list: [
            "เพิ่ม ลบ หรือเปลี่ยนชื่อเซสชัน",
            "เพิ่ม ลบ หรือเปลี่ยนท่า",
            "ย้ายเซสชันไปวันอื่น",
          ],
        },
        {
          fig: "edit",
          caption: "เปลี่ยนท่าใน W2 โดยเลือก W2 and later แล้ว W4 ก็จะเปลี่ยนตามด้วย แต่ W3 มีบันทึกของท่านั้นอยู่แล้วจึงคงท่าเดิมไว้ ส่วน W1 จบไปแล้วก็ไม่เปลี่ยน (วัน\u2060ที่ตัวอย่าง)",
        },
        { p: "ส่วนเซ็ต จำนวนครั้ง น้ำหนัก เวลาพัก โน้ต ลำดับท่า การจับกลุ่มท่า และค่าคาร์ดิโอ ยังแยกกันรายสัปดาห์เหมือนเดิม progression ที่วางไว้จึงไม่หาย" },
        {
          list: [
            "**สัปดาห์ที่จบแล้วจะไม่เปลี่ยน** ถ้าเปิดดูจะมีข้อความบอก เช่น `W1 ended 16 Nov — Ann is in W2.` ถ้าแก้ในสัปดาห์นั้น ก็ยังมีผลกับ W2 เป็นต้นไปอยู่ดี",
            "**ท่าที่เพิ่มเข้าไปจะเดินตาม progression ของบล็อก** เช่น เพิ่มท่าใหม่ด้วยน้ำหนัก 40 กก. ในบล็อกที่ขึ้นสัปดาห์ละ 2.5 กก. สัปดาห์ต่อ ๆ ไปก็จะเป็น 42.5, 45, 47.5…",
            "**ระบบไม่แตะสัปดาห์ที่มีบันทึกแล้ว** ถ้าสัปดาห์หลัง ๆ มีบันทึกของเซสชันหรือท่านั้นอยู่แล้ว การลบหรือเปลี่ยนท่าจะข้ามสัปดาห์นั้นไป และข้อความจะบอกว่าข้ามสัปดาห์ไหน เช่น `W3 kept: has logs`",
            "**บล็อก A/B** จะเปลี่ยนแค่สัปดาห์หลัง ๆ ที่เป็นตัวอักษรเดียวกัน",
            "**Undo** ในข้อความจะคืนค่าสัปดาห์หลัง ๆ ให้เหมือนเดิม ส่วนสัปดาห์ที่คุณแก้ยังเป็นแบบที่แก้ไว้",
          ],
        },
        {
          aside:
            "**Copy this week to…** ทำงานต่างออกไป ปุ่มนี้เขียนทับสัปดาห์ปลายทางทั้งสัปดาห์ รวมน้ำหนักด้วย progression ของสัปดาห์เหล่านั้นจึงหายไป ใช้ตอนอยากรีเซ็ตทั้งสัปดาห์ ไม่ใช่ตอนจะเพิ่มเซสชันเดียว",
        },
      ],
    },
    {
      id: missed,
      h: "ขาดซ้อมหรือซ้อมช้ากว่าแผน",
      blocks: [
        {
          defs: [
            {
              dt: "ทำทีหลัง แต่ยังอยู่ในสัปดาห์เดียวกัน",
              dd: `ไม่มีปัญหา เมมเบอร์จะเห็นเซสชันที่พลาดย้ายไปอยู่ใต้หัวข้อ "${portalTh["week.earlier"]}" และบันทึกได้ในวันไหนก็ได้ที่เหลือของสัปดาห์นั้น โดยลงวันที่ที่ทำจริง ในตารางสัปดาห์ของคุณจะขึ้นว่าทำแล้ว พร้อม \`logged Fri 20 Nov\``,
            },
            {
              dt: "จบสัปดาห์แล้วยังไม่ได้ทำ",
              dd: "เมมเบอร์บันทึกไม่ได้แล้ว และนับเป็นขาด แต่เซสชันที่เพิ่งเลยกำหนดมาไม่ถึง **2 วัน** จะยังไม่นับว่าขาด เพราะเมมเบอร์มักบันทึกช้า ถ้าเมมเบอร์บันทึกได้ไม่ถึง 60% ของเซสชันที่ถึงกำหนด คุณจะได้สัญญาณ ⟦warn|Low adherence⟧",
            },
            {
              dt: "ทำวันถัดจากวันสุดท้ายของสัปดาห์",
              dd: "วันนั้นเป็นของสัปดาห์ถัดไปแล้ว เมมเบอร์จึงบันทึกไม่ได้ คุณบันทึกให้เองจากหน้าเมมเบอร์ได้ แต่จะนับเข้าสัปดาห์ใหม่ ทางที่ดีคือจัดวันสุดท้ายของสัปดาห์ให้เบา หรือบอกเมมเบอร์ให้บันทึกวันเดียวกับที่ซ้อม",
            },
            {
              dt: "หายไปหนึ่งสัปดาห์ขึ้นไป",
              dd: "ไม่มีปุ่มพัก ให้เลื่อนสัปดาห์ที่ 1 ออกไปเท่ากับช่วงที่เมมเบอร์หายไปแทน (กด *Change* ใต้ชื่อโปรแกรม) สัปดาห์ที่พลาดจะวนกลับมาให้ซ้อมอีกรอบ ก่อนยืนยัน ระบบจะบอกว่าเซสชันไหนที่บันทึกแล้วจะย้ายไปอยู่สัปดาห์อื่น",
            },
            { dt: "สัปดาห์ก่อนวันเปิดใช้", dd: "ไม่นับว่าขาด และไม่นำไปคิด adherence แม้สัปดาห์ที่ 1 จะเริ่มย้อนหลังก็ตาม" },
          ],
        },
      ],
    },
    {
      id: ab,
      h: "สัปดาห์ A/B",
      blocks: [
        {
          p: "ใช้ A/B ตอนที่สัปดาห์คี่กับสัปดาห์คู่ซ้อมไม่เหมือนกัน สัปดาห์คี่เป็น **A** สัปดาห์คู่เป็น **B** ใช้ได้กับบล็อกทุกความยาว แต่ไม่มี C และไม่มีแบบ AABB",
        },
        {
          list: [
            "**โปรแกรมใหม่** ตั้ง *Weeks* เป็น *A/B weeks* แล้วจะได้แท็บ *Week A* กับ *Week B* โดย B เริ่มจากสำเนาของ A (กด *Copy from A* ถ้าอยากรีเซ็ต)",
            "**โปรแกรมที่มีอยู่แล้ว** สวิตช์ *Weeks* เหนือแท็บจะติดป้าย A กับ B ให้สัปดาห์ต่าง ๆ โดยไม่เปลี่ยนเนื้อหา จากนั้นแก้ W2 แล้วกด *Copy this week to…* › *Every B week*",
            "**ทุกสัปดาห์เก็บเซสชันของตัวเอง** ถ้าเลือก *W3 and later* การแก้จะไปถึงเฉพาะสัปดาห์หลัง ๆ ที่เป็นตัวอักษรเดียวกัน",
            "**AI รักษาตัวอักษรไว้** ตอนร่างสัปดาห์ AI จะต่อยอดจากสัปดาห์ล่าสุดที่เป็นตัวอักษรเดียวกัน (W5 ต่อจาก W3)",
            "**เมมเบอร์ไม่เห็น A หรือ B** เห็นแค่เซสชันของสัปดาห์นั้น",
          ],
        },
      ],
    },
    {
      id: nextBlock,
      h: "ขึ้นบล็อกใหม่ หรือแก้บล็อกนี้ดี",
      blocks: [
        {
          defs: [
            {
              dt: "ปรับในเฟสเดิม → แก้โปรแกรมที่ใช้อยู่",
              dd: "โปรแกรมเดิม เลขสัปดาห์เดิม กดบันทึกแต่ละครั้งจะได้เวอร์ชันใหม่ (`v2`, `v3`) ถ้าให้ AI ร่างสัปดาห์ (*Generate week*) ก็จะอัปเดตโปรแกรมนี้เหมือนกัน",
            },
            {
              dt: "เฟสใหม่ → โปรแกรมใหม่",
              dd: "กด *Generate next block* ในหน้าเมมเบอร์ หรือสร้างเอง โปรแกรมใหม่จะเป็นร่างก่อน พอเปิดใช้ ระบบจะเก็บโปรแกรมเดิมเข้าคลังพร้อมบันทึก แล้วสัปดาห์ที่ 1 ก็เริ่มใหม่ในวันที่คุณเลือก",
            },
            { dt: "อยากให้บล็อกยาวขึ้น → เพิ่มสัปดาห์", dd: "โปรแกรมหนึ่งมีได้ถึง 26 สัปดาห์ เพิ่มสัปดาห์แล้วก็ยังเป็นโปรแกรมเดิม เลขสัปดาห์เดิม" },
          ],
        },
      ],
    },
    {
      id: ai,
      h: "กำหนดทิศทางให้ AI",
      blocks: [
        {
          defs: [
            {
              dt: "Block direction ใช้กับทุกสัปดาห์ของบล็อก",
              dd: "ที่หน้า *Generate* ติ๊ก *Keep as the block's direction* แล้วโน้ตนั้นจะกลายเป็น **Block direction** ของโปรแกรม (ไม่เกิน 500 ตัวอักษร) ร่างรายสัปดาห์ทุกครั้งจะทำตามจนกว่าคุณจะเปลี่ยน และบล็อกถัดไปก็จะรับไปใช้ต่อด้วย",
            },
            {
              dt: "คำสั่งเฉพาะร่างนี้",
              dd: "ช่อง *What should this week do?* มีผลแค่กับร่างที่กำลังทำอยู่ เช่น “ไปต่างจังหวัด ใช้ได้แค่ยิมโรงแรม” ส่วน *Your instructions as the AI gets them* จะแสดงให้เห็นว่าส่งอะไรไปให้ AI จริง ๆ",
            },
            { dt: "ใช้เสมอ", dd: "ข้อจำกัดของเมมเบอร์ แผนของสัปดาห์ใน *Block phasing* (เช่น deload) และกฎการโค้ชของคุณ" },
          ],
        },
      ],
    },
    {
      id: moveIn,
      h: "ย้ายเมมเบอร์เดิมเข้ามา",
      blocks: [
        { p: "สำหรับเมมเบอร์ที่คุณโค้ชอยู่แล้วผ่านโน้ต LINE หรือสเปรดชีต" },
        {
          steps: [
            { h: "เพิ่มเมมเบอร์", p: "ใส่เป้าหมาย ข้อจำกัด และวันซ้อมก่อน ส่วน 1RM ใส่ทีหลังได้" },
            { h: "วางโน้ตของเมมเบอร์", p: "*New program* › *Paste notes* › *Read it* แล้วตรวจชื่อท่าที่ระบบจับคู่ให้ แอปจะจำไว้ใช้ครั้งหน้าด้วย" },
            {
              h: "บันทึกประวัติ",
              p: "ถ้าโน้ตมีตัวเลขที่เมมเบอร์ทำจริง กด *Save history* แล้วบอกว่าสัปดาห์ล่าสุดเริ่มวันไหน การซ้อมที่ผ่านมาจะเข้ามาเป็นโปรแกรมในคลังพร้อมบันทึกการซ้อม กราฟความก้าวหน้าและ AI ก็เริ่มจากข้อมูลจริงได้เลย ส่วนเซสชันที่ไม่มีตัวเลข ระบบจะไม่บันทึก",
            },
            { h: "ร่างบล็อกปัจจุบัน", p: "*Use this* จะเอาหนึ่งสัปดาห์ (หรือ Week A กับ B) มาสร้างเป็นโปรแกรมร่าง ถ้าสัปดาห์หลัง ๆ มี progression ก็แก้ต่อเองได้" },
            {
              h: "เปิดใช้ให้ตรงสัปดาห์",
              p: "ถ้าเมมเบอร์อยู่สัปดาห์ที่ 3 แล้ว ให้เลือกวันเริ่มสัปดาห์ที่ 1 ย้อนไปสองสัปดาห์ วันนี้จะเป็น W3 และสัปดาห์ที่ 1–2 ไม่นับว่าขาด",
            },
          ],
        },
      ],
    },
    {
      id: answers,
      h: "คำตอบด่วน",
      blocks: [
        {
          table: {
            head: ["เกิดอะไรขึ้น", "ต้องทำยังไง"],
            rows: [
              ["“เมมเบอร์มองไม่เห็นเซสชันที่เพิ่มไป”", "น่าจะเพิ่มไว้ในสัปดาห์ที่จบแล้วแบบ *W1 only* เปิดสัปดาห์ปัจจุบันของเมมเบอร์ (หน้าโปรแกรมเปิดมาที่นั่นอยู่แล้ว) แล้วเพิ่มใหม่แบบ *W2 and later*"],
              ["“อยากเริ่มสัปดาห์หน้า”", "กด *Activate program* แล้วเลือก *Next Monday*"],
              ["“สัปดาห์เริ่มวันแปลก ๆ”", "สัปดาห์ที่ 1 เริ่มในวันที่กดเปิดใช้ กด *Change* ใต้ชื่อโปรแกรม แล้วเลือกวันจันทร์"],
              ["“เมมเบอร์ป่วยไปหนึ่งสัปดาห์”", "กด *Change* เลื่อนสัปดาห์ที่ 1 ออกไปหนึ่งสัปดาห์ เมมเบอร์จะได้ซ้อมสัปดาห์ที่พลาดอีกรอบ"],
              ["“เมมเบอร์ทำเซสชันวันจันทร์ในวันอังคาร”", "ไม่ต้องทำอะไร ระบบนับให้แล้ว โดยลงวันที่เป็นวันอังคาร"],
              ["“ขึ้นว่า Week 9 แต่ไม่มีอะไรเลย”", "บล็อกเลยสัปดาห์สุดท้ายไปแล้ว สร้างบล็อกถัดไป (ให้ AI ร่างหรือทำเอง) แล้วเปิดใช้"],
            ],
          },
        },
      ],
    },
  ],
};

export const PROGRAMS_GUIDE: Record<Locale, ProgramsGuide> = { en, th };
