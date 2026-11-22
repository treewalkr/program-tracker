import { en as portalEn, th as portalTh } from "$lib/portal/messages";
import type { Locale } from "$lib/portal/messages";

/**
 * The client-portal guide, in English and Thai. The trainer's own buttons
 * (Turn on, Copy link…) stay in English in both because the trainer app is
 * English; anything the *client* sees is quoted from the portal's own
 * dictionary, so the guide uses the exact words on their phone. The phone
 * figures and the LINE message follow the same EN / ไทย switch.
 *
 * Inline markup: **bold**, *italic*, `code`, and ⟦tone|label⟧ for a Pill.
 */
export interface Guide {
  title: string;
  sub: string;
  crumbs: [string, string];
  onThisPage: string;
  intro: string;
  figures: { box: string; overview: string; phones: string; history: string };
  sections: {
    setUp: { h: string; steps: { h: string; p: string }[]; aside: string };
    clientSees: { h: string; lead: string; can: string; canList: string[]; never: string; neverList: string[]; after: string };
    clientLogs: { h: string; steps: { h: string; p: string }[]; rulesLead: string; rules: string[] };
    youSee: { h: string; p: string[] };
    resetOff: { h: string; items: { dt: string; dd: string }[] };
    stuck: { h: string; head: [string, string]; rows: [string, string][] };
  };
}

const q = (k: keyof typeof portalEn) => `"${portalEn[k]}"`;
const first = (s: string, sep: string) => `"${s.split(sep)[0]}"`;

const en: Guide = {
  title: "Client portal",
  sub: "Give a client a link to their week. They log sessions on their phone; the logs land in your data.",
  crumbs: ["Guide", "Client portal"],
  onThisPage: "On this page",
  intro:
    "Turn the portal on for a client, copy one message, paste it into LINE. You turn it on **per client**; a client you haven't turned it on for has no way in, and it never shows the parts of the app you work in — only their program.",
  figures: {
    box: "The Client portal box after you press Turn on. Copy message is what you paste into LINE; Last seen fills in once they open it. Sample data.",
    overview: "The Clients table on Overview. Its Portal column is a shortcut: one tap to start, one tap to copy. Sample rows.",
    phones:
      "What the client opens: your name, then the next session with its one green button; then the log screen, prefilled from your prescription, where they change only what differed (outlined) and save. Sample session and numbers.",
    history: "Their History tab. The session the client logged carries a by client label; the one you logged does not. Sample rows.",
  },
  sections: {
    setUp: {
      h: "Set it up",
      steps: [
        { h: "Open the client's Settings tab", p: "`Clients` › `their name` › `Settings`. The **Client portal** box is the first one on the page. Shortcut: on *Overview*, the **Portal** column shows *Turn on…* next to any client without a portal; it opens this same tab." },
        {
          h: "Check their email",
          p: "With an email on file they can also sign in with that Google account (the box says `Uses name@example.com`). With none it says *No email on file* and they use the link only. Add one in their profile, or skip Google.",
        },
        {
          h: "Press *Turn on*",
          p: `A personal **Access link** appears. Nothing is sent yet, and no active program is fine: they'll see ${q("week.emptyProgram")} until you activate one.`,
        },
        {
          h: "Send it",
          p: "**Copy message** under *For LINE* copies a ready sentence with the link, in English or ไทย (it starts in Thai when the client's name is written in Thai). Paste it into LINE. **Copy link** copies the link alone, and once a portal is on, *Overview* has the same **Copy link** in its **Portal** column.",
        },
        {
          h: "They open it once on their phone",
          p: `The page offers *${portalEn["link.open"]}*. After that they stay signed in on that phone, with no password. *Last seen* fills in.`,
        },
      ],
      aside: "**Try it yourself.** Open the link in the browser you use for Program Tracker. The portal keeps its own sign-in, so you stay signed in here and see exactly what your client sees.",
    },
    clientSees: {
      h: "What your client sees",
      lead: "Only the program you've activated, and only what they need to train.",
      can: "They can see",
      canList: [
        "This week and next week of the **active** program",
        "Session names and the weekday of each",
        "Exercises with sets, reps, kg, RPE, rest and tempo; %1RM is already worked out into kg",
        "Your exercise and session notes, and cardio prescriptions",
        "Your name, as their coach",
      ],
      never: "They never see",
      neverList: ["Drafts or archived programs", "AI rationale, program direction, phasing", "Limitations, goals, 1RMs", "Signals, your coaching rules, other clients"],
      after: "Next week is a preview: they can open it but log it only once that week starts. EN and ไทย are one tap in their header, and the choice stays on their phone.",
    },
    clientLogs: {
      h: "How your client logs",
      steps: [
        {
          h: portalEn["week.nextUp"],
          p: `The page opens on today's first open session with a green **${portalEn["session.log"]}** button. Earlier sessions this week sit under *${portalEn["week.earlier"]}* as ⟦warn|${portalEn["session.notLogged"]}⟧, never as "missed".`,
        },
        {
          h: "Fill in the sets",
          p: `kg and reps come prefilled from your prescription; they change what differed. RPE is optional behind *${portalEn["log.rpeShow"]}*, as is the ${q("log.readiness")} strip. Each set's load is either **${portalEn["log.bodyweight"]}** (nothing to type) or kg, switched with *${portalEn["log.addLoad"].replace("{unit}", portalEn["log.kg"])}* / *${portalEn["log.bw"]}*; a step-up done unloaded in a circuit is one tap, and the rounds after it follow. On a bodyweight move the kg reads as added load (a vest, a belt), and a set with no kg reaches you as BW. A superset or circuit is one card, laid out the way it's done: **Set 1** with each exercise under it, then **Set 2**. Skipping an exercise or flagging pain sits behind one quiet *${portalEn["log.issues"]}* link under the sets; anything flagged shows as a tag under the title (*${portalEn["log.tagPain"]} · Wall Ball*) and reaches you with the log.`,
        },
        {
          h: portalEn["log.save"],
          p: `One button at the bottom. The recap shows how many of the week's sessions are done, with **${portalEn["log.undo"]}** for a mistake.`,
        },
      ],
      rulesLead: "Rules the portal enforces:",
      rules: [
        "They can log **this week only**, for today or earlier.",
        `They can edit or undo **their own** logs. A session you logged shows ⟦neutral|${portalEn["session.loggedByCoach"]}⟧ and can't be replaced from their phone; one they logged shows ⟦good|${portalEn["session.loggedByYou"]}⟧.`,
      ],
    },
    youSee: {
      h: "What you see afterwards",
      p: [
        "A client's log appears the moment they save, marked ⟦neutral|by client⟧ in the client's **History**, on the program page's logged line, and in the notice on the log page when a session is already logged.",
        "It counts like any log you enter: the block pulse (tonnage, sets, average RPE, e1RM) and the signals (stall, RPE creep, adherence, cardio behind) all read it. **You're not notified** when a client logs; look on the Overview or the client's page.",
      ],
    },
    resetOff: {
      h: "Reset or turn off",
      items: [
        {
          dt: "Reset link",
          dd: "For a link that went to the wrong chat. The old link stops working and **every device signed in through it is signed out**. Copy the new link and send it. Press once to ask, again to confirm.",
        },
        {
          dt: "Turn off",
          dd: "For a client who stops training with you. The portal closes, sessions end, and the Google link is removed. Past logs stay. Turning it on again gives a fresh link.",
        },
      ],
    },
    stuck: {
      h: "When something doesn't work",
      head: ["The client says", "Why, and what to do"],
      rows: [
        [first(portalEn["login.error.not_allowed"], ". "), "The Google account's email isn't the one on their profile. Fix the email, or send the link instead."],
        [first(portalEn["login.error.not_configured"], ". "), "Google access is still limited for the app. The personal link always works."],
        [q("week.emptyProgram"), "They have no **active** program. Approve and activate the draft; they'll see it right away."],
        [`"${portalEn["link.invalid"]}"`, "You reset it or turned the portal off. Copy the new link from their Settings tab."],
        ["It's slow the first time", `Normal for the first visit of the day; it can take up to a minute. They see ${first(portalEn["week.slow"], " — ")}, not an error.`],
        ["\"I logged it but can't find it\"", "Check their History for ⟦neutral|by client⟧. If *Last seen* says \"Not opened yet\", they haven't used the link."],
      ],
    },
  },
};

const th: Guide = {
  title: "พอร์ทัลเมมเบอร์",
  sub: "ส่งลิงก์ให้เมมเบอร์ดูโปรแกรมของสัปดาห์ เมมเบอร์บันทึกเซสชันบนมือถือ แล้วผลจะเข้าข้อมูลของคุณ",
  crumbs: ["คู่มือ", "พอร์ทัลเมมเบอร์"],
  onThisPage: "ในหน้านี้",
  intro:
    "เปิดพอร์ทัลให้เมมเบอร์ คัดลอกข้อความหนึ่งข้อความ แล้ววางใน LINE คุณเปิดให้**ทีละคน** เมมเบอร์ที่ยังไม่ได้เปิดให้จะเข้าไม่ได้ และพอร์ทัลไม่แสดงส่วนที่คุณใช้ทำงานในแอปเลย เห็นแค่โปรแกรมของเมมเบอร์",
  figures: {
    box: "กล่อง Client portal หลังกด Turn on ข้อความใต้ For LINE คือสิ่งที่คุณวางใน LINE ส่วน Last seen จะขึ้นเมื่อเมมเบอร์เปิดแล้ว (ข้อมูลตัวอย่าง)",
    overview: "ตาราง Clients ในหน้า Overview คอลัมน์ Portal คือทางลัด: แตะหนึ่งครั้งเพื่อเปิด แตะอีกครั้งเพื่อคัดลอก (แถวตัวอย่าง)",
    phones:
      "สิ่งที่เมมเบอร์เปิดเจอ: ชื่อโค้ช ตามด้วยเซสชันถัดไปพร้อมปุ่มเขียวปุ่มเดียว จากนั้นหน้าบันทึกที่กรอกไว้ล่วงหน้าตามโปรแกรมของคุณ เมมเบอร์แก้เฉพาะที่ต่างไป (กรอบสีน้ำเงิน) แล้วกดบันทึก (เซสชันและตัวเลขตัวอย่าง)",
    history: "แท็บ History ของเมมเบอร์ เซสชันที่เมมเบอร์บันทึกเองมีป้าย by client ส่วนที่คุณบันทึกไม่มี (แถวตัวอย่าง)",
  },
  sections: {
    setUp: {
      h: "ตั้งค่า",
      steps: [
        { h: "เปิดแท็บ Settings ของเมมเบอร์", p: "`Clients` › `ชื่อเมมเบอร์` › `Settings` กล่อง **Client portal** อยู่บนสุดของหน้า ทางลัด: ที่หน้า *Overview* คอลัมน์ **Portal** จะมี *Turn on…* ข้างเมมเบอร์ที่ยังไม่มีพอร์ทัล กดแล้วจะเปิดแท็บเดียวกันนี้" },
        {
          h: "ตรวจอีเมล",
          p: "ถ้ามีอีเมลในระบบ เมมเบอร์เข้าด้วยบัญชี Google นั้นได้ด้วย (กล่องจะขึ้น `Uses name@example.com`) ถ้าไม่มีจะขึ้น *No email on file* และใช้ได้แค่ลิงก์ เพิ่มอีเมลได้ในโปรไฟล์ หรือข้าม Google ไปเลย",
        },
        {
          h: "กด *Turn on*",
          p: `จะมี **Access link** ส่วนตัวขึ้นมา ระบบยังไม่ส่งอะไรไปหาเมมเบอร์ และไม่เป็นไรถ้ายังไม่มีโปรแกรมที่ใช้งานอยู่: เมมเบอร์จะเห็น "${portalTh["week.emptyProgram"]}" จนกว่าคุณจะเปิดใช้โปรแกรม`,
        },
        {
          h: "ส่งให้เมมเบอร์",
          p: "**Copy message** ใต้ *For LINE* คัดลอกข้อความพร้อมลิงก์ เลือกได้ว่าจะเป็นภาษาอังกฤษหรือไทย (เริ่มเป็นไทยเมื่อชื่อเมมเบอร์เขียนเป็นไทย) แล้ววางใน LINE ส่วน **Copy link** คัดลอกเฉพาะลิงก์ และเมื่อเปิดพอร์ทัลแล้ว หน้า *Overview* ก็มี **Copy link** เดียวกันในคอลัมน์ **Portal**",
        },
        {
          h: "เมมเบอร์เปิดบนมือถือครั้งเดียว",
          p: `หน้าจอมีปุ่ม *${portalTh["link.open"]}* หลังจากนั้นเมมเบอร์จะอยู่ในระบบบนมือถือเครื่องนั้นโดยไม่ต้องใช้รหัสผ่าน *Last seen* จะอัปเดต`,
        },
      ],
      aside: "**ลองเองได้** เปิดลิงก์ในเบราว์เซอร์เดียวกับที่คุณใช้ Program Tracker พอร์ทัลแยกการเข้าสู่ระบบของตัวเอง คุณจึงยังอยู่ในระบบแอปนี้ต่อได้ และเห็นเหมือนที่เมมเบอร์เห็นทุกอย่าง",
    },
    clientSees: {
      h: "สิ่งที่เมมเบอร์เห็น",
      lead: "เฉพาะโปรแกรมที่คุณเปิดใช้ และเฉพาะสิ่งที่จำเป็นต่อการซ้อม",
      can: "เห็นได้",
      canList: [
        "สัปดาห์นี้และสัปดาห์หน้าของโปรแกรมที่**ใช้งานอยู่**",
        "ชื่อเซสชันและวันในสัปดาห์ของแต่ละเซสชัน",
        "ท่าซ้อม พร้อมเซต จำนวนครั้ง กก. RPE เวลาพัก และจังหวะ — %1RM คำนวณเป็น กก. ให้แล้ว",
        "โน้ตของท่าและของเซสชัน รวมถึงคาร์ดิโอที่กำหนด",
        "ชื่อของคุณในฐานะโค้ช",
      ],
      never: "ไม่เห็นเด็ดขาด",
      neverList: ["ร่างโปรแกรม หรือโปรแกรมที่เก็บเข้าคลังแล้ว", "เหตุผลจาก AI ทิศทางโปรแกรม การแบ่งเฟส", "ข้อจำกัด เป้าหมาย 1RM", "สัญญาณเตือน กฎการโค้ช และเมมเบอร์คนอื่น"],
      after: "สัปดาห์หน้าเป็นแบบดูล่วงหน้า เปิดดูได้ แต่ต้องรอให้สัปดาห์นั้นเริ่มก่อนถึงจะบันทึกได้ เมมเบอร์สลับ EN / ไทย ได้ในแถบบนด้วยการแตะครั้งเดียว และระบบจะจำค่าไว้บนมือถือเครื่องนั้น",
    },
    clientLogs: {
      h: "เมมเบอร์บันทึกอย่างไร",
      steps: [
        {
          h: portalTh["week.nextUp"],
          p: `หน้าจะเปิดที่เซสชันแรกที่ยังไม่ได้บันทึกของวันนี้ พร้อมปุ่มเขียว **${portalTh["session.log"]}** เซสชันก่อนหน้าในสัปดาห์นี้ที่ยังไม่ได้บันทึกอยู่ใต้ *${portalTh["week.earlier"]}* ติดป้าย ⟦warn|${portalTh["session.notLogged"]}⟧ ไม่มีคำว่า "พลาด" ให้เห็นเลย`,
        },
        {
          h: "กรอกเซต",
          p: `ระบบกรอก กก. และจำนวนครั้งไว้ให้ล่วงหน้าตามโปรแกรมของคุณ เมมเบอร์แก้เฉพาะที่ต่างไป RPE ไม่บังคับ ซ่อนอยู่หลังปุ่ม *${portalTh["log.rpeShow"]}* แถบ "${portalTh["log.readiness"]}" ก็เหมือนกัน ซูเปอร์เซตและเซอร์กิตรวมอยู่ในการ์ดเดียว เรียงตามที่เล่นจริง คือ **เซต 1** มีทุกท่าอยู่ข้างใต้ แล้วต่อด้วย **เซต 2** ส่วนการข้ามท่าหรือแจ้งว่าเจ็บ ซ่อนอยู่หลังลิงก์ *${portalTh["log.issues"]}* ใต้เซต ท่าไหนที่ข้ามหรือเจ็บจะมีป้ายบอกใต้ชื่อท่า (*${portalTh["log.tagPain"]} · Wall Ball*) และส่งถึงคุณพร้อมบันทึก`,
        },
        {
          h: portalTh["log.save"],
          p: `ปุ่มเดียวที่ด้านล่าง หน้าสรุปบอกว่าเซสชันของสัปดาห์เสร็จไปแล้วกี่เซสชัน พร้อมปุ่ม **${portalTh["log.undo"]}** เผื่อกดผิด`,
        },
      ],
      rulesLead: "กติกาของพอร์ทัล:",
      rules: [
        "บันทึกได้**เฉพาะสัปดาห์นี้** และเฉพาะวันนี้หรือวันก่อนหน้า",
        `แก้หรือเลิกทำได้เฉพาะบันทึก**ของตัวเอง** เซสชันที่คุณบันทึกจะขึ้น ⟦neutral|${portalTh["session.loggedByCoach"]}⟧ และเมมเบอร์แทนที่จากมือถือไม่ได้ ส่วนที่เมมเบอร์บันทึกเองจะขึ้น ⟦good|${portalTh["session.loggedByYou"]}⟧`,
      ],
    },
    youSee: {
      h: "สิ่งที่คุณเห็นหลังจากนั้น",
      p: [
        "บันทึกของเมมเบอร์เข้ามาทันทีที่กดบันทึก พร้อมป้าย ⟦neutral|by client⟧ ใน **History** ของเมมเบอร์ ในบรรทัดที่บันทึกแล้วของหน้าโปรแกรม และในข้อความแจ้งเตือนบนหน้าบันทึกเมื่อเซสชันนั้นมีบันทึกอยู่แล้ว",
        "นับเหมือนบันทึกที่คุณกรอกเอง ทั้ง block pulse (ปริมาณรวม เซต RPE เฉลี่ย e1RM) และสัญญาณเตือน (stall = ติดเพดาน, RPE creep = RPE ไต่ขึ้น, adherence = การทำตามแผน, cardio behind = คาร์ดิโอตามหลัง) ก็คิดจากข้อมูลนี้ด้วย **ระบบไม่แจ้งเตือนคุณ** เมื่อเมมเบอร์บันทึก ต้องเข้าไปดูเองที่ Overview หรือหน้าของเมมเบอร์",
      ],
    },
    resetOff: {
      h: "รีเซ็ตหรือปิด",
      items: [
        {
          dt: "Reset link",
          dd: "ใช้เมื่อส่งลิงก์ผิดแชต ลิงก์เดิมจะใช้ไม่ได้ และ**ทุกเครื่องที่เข้าผ่านลิงก์นั้นจะถูกออกจากระบบ** คัดลอกลิงก์ใหม่แล้วส่งให้เมมเบอร์ กดครั้งแรกเพื่อขอรีเซ็ต กดอีกครั้งเพื่อยืนยัน",
        },
        {
          dt: "Turn off",
          dd: "ใช้เมื่อเมมเบอร์เลิกซ้อมกับคุณ พอร์ทัลจะปิด เครื่องที่เข้าสู่ระบบอยู่จะหลุดออกทั้งหมด และตัดการเชื่อม Google ด้วย บันทึกที่ผ่านมายังอยู่ครบ ถ้าเปิดใหม่ภายหลังจะได้ลิงก์ใหม่",
        },
      ],
    },
    stuck: {
      h: "เมื่อมีอะไรไม่ทำงาน",
      head: ["เมมเบอร์บอกว่า", "สาเหตุ และสิ่งที่ควรทำ"],
      rows: [
        [`"${portalTh["login.error.not_allowed"].split(" ลอง")[0]}"`, "อีเมลของบัญชี Google ไม่ตรงกับที่อยู่ในโปรไฟล์เมมเบอร์ แก้อีเมล หรือส่งลิงก์แทน"],
        [`"${portalTh["login.error.not_configured"].split(" ขอ")[0]}"`, "การเข้าถึงด้วย Google ของแอปยังจำกัดอยู่ ลิงก์ส่วนตัวใช้ได้เสมอ"],
        [`"${portalTh["week.emptyProgram"]}"`, "เมมเบอร์ยังไม่มีโปรแกรมที่**ใช้งานอยู่** อนุมัติและเปิดใช้ร่างโปรแกรม เมมเบอร์จะเห็นทันที"],
        [`"${portalTh["link.invalid"]}"`, "คุณรีเซ็ตลิงก์ หรือปิดพอร์ทัลไปแล้ว คัดลอกลิงก์ใหม่จากแท็บ Settings ของเมมเบอร์"],
        ["เปิดครั้งแรกช้า", `ปกติสำหรับการเปิดครั้งแรกของวัน อาจนานถึงหนึ่งนาที เมมเบอร์จะเห็นข้อความ "${portalTh["week.slow"].split(" — ")[0]}" ไม่ใช่ข้อผิดพลาด`],
        ["\"บันทึกแล้วแต่หาไม่เจอ\"", "ดู History ของเมมเบอร์หาป้าย ⟦neutral|by client⟧ ถ้า *Last seen* ขึ้นว่า \"Not opened yet\" แปลว่าเมมเบอร์ยังไม่ได้ใช้ลิงก์"],
      ],
    },
  },
};

export const GUIDE: Record<Locale, Guide> = { en, th };

/** Section anchors in reading order. */
export const GUIDE_IDS = ["set-up", "client-sees", "client-logs", "you-see", "reset-off", "stuck"] as const;
