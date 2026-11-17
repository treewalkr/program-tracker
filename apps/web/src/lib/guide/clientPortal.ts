import { en as portalEn, th as portalTh } from "$lib/portal/messages";
import type { Locale } from "$lib/portal/messages";

/**
 * The client-portal guide, in both languages. The trainer's own buttons
 * (Turn on, Copy link…) stay in English because the trainer app is English;
 * anything the *client* sees is taken from the portal's own dictionary so
 * the guide quotes the exact words on their phone.
 *
 * Inline markup: **bold**, *italic*, `code`, and ⟦tone|label⟧ for a Pill.
 */
export interface Guide {
  title: string;
  sub: string;
  crumbs: [string, string];
  onThisPage: string;
  /** Captions for the drawn figures; the pictures themselves are components. */
  figures: { box: string; week: string; log: string; history: string };
  sections: {
    whatItIs: { h: string; p: string[] };
    setUp: { h: string; steps: { h: string; p: string }[]; aside: string };
    clientSees: { h: string; lead: string; can: string; canList: string[]; never: string; neverList: string[]; after: string };
    clientLogs: { h: string; steps: { h: string; p: string }[]; rulesLead: string; rules: string[] };
    youSee: { h: string; p: string[] };
    resetOff: { h: string; items: { dt: string; dd: string }[] };
    stuck: { h: string; head: [string, string]; rows: [string, string][] };
  };
}

const q = (_l: Locale, k: keyof typeof portalEn) => `"${portalEn[k]}"`;

const en: Guide = {
  title: "Client portal",
  sub: "Give a client a link to their week. They log sessions on their phone; the logs land in your data.",
  crumbs: ["Guide", "Client portal"],
  onThisPage: "On this page",
  figures: {
    box: "The Client portal box after you press Turn on. The link and the LINE message are what you send; Last seen fills in once they open it. Sample data.",
    week: "What your client opens: your name at the top, then the next session to do with its one green button. Sample session.",
    log: "The log screen at one exercise. Every set is prefilled from your prescription; the client changes only what differed (outlined), then saves. Sample numbers.",
    history: "Their History tab. The session the client logged carries a by client label; the one you logged does not. Sample rows.",
  },
  sections: {
    whatItIs: {
      h: "What it is",
      p: [
        "The portal is a page your client opens on their phone. It shows this week's and next week's sessions from their **active program**, and lets them log what they did, set by set. It replaces the \"send me your numbers in LINE\" step: you no longer type their sessions in by hand.",
        "You turn it on **per client**. A client you haven't turned it on for has no way in. It never shows the parts of the app you work in — only the program.",
      ],
    },
    setUp: {
      h: "Set it up",
      steps: [
        { h: "Open the client's Settings tab", p: "`Clients` › `their name` › `Settings`. The **Client portal** box is the first one on the page." },
        {
          h: "Check their email first",
          p: "If the client has an email on file, they can sign in with the Google account that uses it. The box says `Uses name@example.com`. With no email it says *No email on file* and they can only use the link. You can add one in the client's profile; you can also skip Google entirely.",
        },
        {
          h: "Press *Turn on*",
          p: `The box now shows a personal **Access link**. Nothing is sent to the client yet, and an empty program is fine: they'll see ${q("en", "week.emptyProgram")} until you activate one.`,
        },
        {
          h: "Send it",
          p: "**Copy message** under *For LINE* gives you a ready sentence plus the link, in English or ไทย (switch with EN / ไทย; it starts in the client's language when their name is written in Thai). Paste it into LINE. **Copy link** copies only the link.",
        },
        {
          h: "They open it once on their phone",
          p: `The page says "${portalEn["link.title"].replace("{trainer}", "your name").replace("{name}", "their name")}" with one button, *${portalEn["link.open"]}*. After that they stay signed in on that phone, with no password. The box shows *Last seen* once they've been in.`,
        },
      ],
      aside: "**Try it yourself.** Open the link in the same browser you use for Program Tracker. The portal keeps its own sign-in, so you stay signed in here and see exactly what your client sees.",
    },
    clientSees: {
      h: "What your client sees",
      lead: "Only the program you've activated, and only what they need to train.",
      can: "They can see",
      canList: [
        "This week and next week of the **active** program",
        "Session names and the weekday each one falls on",
        "Exercises, with sets, reps, kg, RPE, rest and tempo — %1RM already worked out into kg",
        "Your exercise and session notes, and cardio prescriptions",
        "Your name, as their coach",
      ],
      never: "They never see",
      neverList: [
        "Drafts, or archived programs",
        "AI rationale, program direction, phasing",
        "Limitations, goals, 1RMs",
        "Signals, your coaching rules, other clients",
      ],
      after: "Next week is a preview; they can open it but can log it only once that week starts. English and ไทย are one tap in the header, and the choice sticks on their phone. Your app stays in English.",
    },
    clientLogs: {
      h: "How your client logs",
      steps: [
        {
          h: portalEn["week.nextUp"],
          p: `The page opens on today's first open session with a green **${portalEn["session.log"]}** button. Earlier sessions this week they haven't logged sit under *${portalEn["week.earlier"]}* as ⟦warn|${portalEn["session.notLogged"]}⟧, never as "missed".`,
        },
        {
          h: "Fill in the sets",
          p: `kg and reps are prefilled from your prescription; they change what differed. RPE is optional behind *${portalEn["log.rpeShow"]}*. An optional ${q("en", "log.readiness")} strip and a notes field sit at the top and bottom.`,
        },
        {
          h: portalEn["log.save"],
          p: `One button at the bottom. The recap shows what they logged and how many of the week's sessions are done, with **${portalEn["log.undo"]}** if they hit it by mistake.`,
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
        "It counts like any log you enter: tonnage, sets, average RPE and e1RM in the block pulse, and the signals (stall, RPE creep, adherence, cardio behind) all read it. **You're not notified** when a client logs. The Overview and the client's page are where it shows up.",
      ],
    },
    resetOff: {
      h: "Reset or turn off",
      items: [
        {
          dt: "Reset link",
          dd: "Use when the link went to the wrong chat or someone else has it. The old link stops working and **every device signed in through it is signed out**. Copy the new link and send it. Press once to ask, again to confirm.",
        },
        {
          dt: "Turn off",
          dd: "Use when the client stops training with you. The portal closes, sessions end, and the Google link is removed. Their past logs stay. Turning it on again later gives a fresh link.",
        },
      ],
    },
    stuck: {
      h: "When something doesn't work",
      head: ["The client says", "Why, and what to do"],
      rows: [
        [q("en", "login.error.not_allowed").split(". ")[0] + `"`, "The Google account's email isn't the one on the client's profile. Fix the email, or send the link instead."],
        [`"${portalEn["login.error.not_configured"].split(". ")[0]}"`, "Google access is still limited for the app. The personal link always works."],
        [q("en", "week.emptyProgram"), "They have no **active** program. Approve and activate the draft; they'll see it right away."],
        [`"${portalEn["link.invalid"]}"`, "You reset it, or turned the portal off. Copy the new link from their Settings tab."],
        ["It's slow on the first open", `Normal for the first visit of the day; it can take up to a minute. They see a line that says ${q("en", "week.slow").split(" — ")[0]}", not an error.`],
        ["\"I logged it but I can't find it\"", "Check the client's History for ⟦neutral|by client⟧. If *Last seen* says \"Not opened yet\", they haven't used the link."],
      ],
    },
  },
};

const th: Guide = {
  title: "พอร์ทัลลูกค้า",
  sub: "ส่งลิงก์ให้ลูกค้าดูโปรแกรมของสัปดาห์ ลูกค้าบันทึกเซสชันบนมือถือ แล้วผลจะเข้าข้อมูลของคุณ",
  crumbs: ["คู่มือ", "พอร์ทัลลูกค้า"],
  onThisPage: "ในหน้านี้",
  figures: {
    box: "กล่อง Client portal หลังกด Turn on ลิงก์และข้อความ LINE คือสิ่งที่คุณส่งให้ลูกค้า ส่วน Last seen จะขึ้นเมื่อลูกค้าเปิดแล้ว (ข้อมูลตัวอย่าง)",
    week: "สิ่งที่ลูกค้าเห็นเมื่อเปิดลิงก์: ชื่อโค้ชอยู่ด้านบน ตามด้วยเซสชันถัดไปที่ต้องทำ พร้อมปุ่มเขียวปุ่มเดียว (เซสชันตัวอย่าง)",
    log: "หน้าบันทึกของท่าหนึ่ง ทุกเซตถูกกรอกไว้ตามโปรแกรมของคุณ ลูกค้าแก้เฉพาะที่ต่างไป (กรอบสีน้ำเงิน) แล้วกดบันทึก (ตัวเลขตัวอย่าง)",
    history: "แท็บ History ของลูกค้า เซสชันที่ลูกค้าบันทึกเองมีป้าย by client ส่วนที่คุณบันทึกไม่มี (แถวตัวอย่าง)",
  },
  sections: {
    whatItIs: {
      h: "พอร์ทัลคืออะไร",
      p: [
        "พอร์ทัลคือหน้าเว็บที่ลูกค้าเปิดบนมือถือ แสดงเซสชันของสัปดาห์นี้และสัปดาห์หน้าจาก**โปรแกรมที่ใช้งานอยู่** และให้ลูกค้าบันทึกสิ่งที่ทำจริงเป็นรายเซต ไม่ต้องรอให้ลูกค้าส่งตัวเลขมาทาง LINE แล้วพิมพ์ลงให้เองอีกต่อไป",
        "คุณเปิดให้**ทีละคน** ลูกค้าที่คุณยังไม่ได้เปิดให้จะเข้าไม่ได้ และพอร์ทัลไม่แสดงส่วนที่คุณใช้ทำงานในแอป — แสดงแค่โปรแกรม",
      ],
    },
    setUp: {
      h: "ตั้งค่า",
      steps: [
        { h: "เปิดแท็บ Settings ของลูกค้า", p: "`Clients` › `ชื่อลูกค้า` › `Settings` กล่อง **Client portal** อยู่บนสุดของหน้า" },
        {
          h: "ตรวจอีเมลของลูกค้าก่อน",
          p: "ถ้าลูกค้ามีอีเมลในระบบ จะเข้าสู่ระบบด้วยบัญชี Google ที่ใช้อีเมลนั้นได้ กล่องจะขึ้นว่า `Uses name@example.com` ถ้าไม่มีอีเมลจะขึ้นว่า *No email on file* และลูกค้าใช้ได้แค่ลิงก์ คุณเพิ่มอีเมลได้ในโปรไฟล์ของลูกค้า หรือจะข้าม Google ไปเลยก็ได้",
        },
        {
          h: "กด *Turn on*",
          p: `กล่องจะแสดง **Access link** ส่วนตัวของลูกค้า ยังไม่มีอะไรถูกส่งไปหาลูกค้า และไม่เป็นไรถ้ายังไม่มีโปรแกรม: ลูกค้าจะเห็น "${portalTh["week.emptyProgram"]}" จนกว่าคุณจะเปิดใช้โปรแกรม`,
        },
        {
          h: "ส่งให้ลูกค้า",
          p: "**Copy message** ใต้ *For LINE* ให้ข้อความพร้อมลิงก์ ทั้งภาษาอังกฤษและไทย (สลับด้วย EN / ไทย โดยจะเริ่มเป็นภาษาไทยเมื่อชื่อลูกค้าเขียนเป็นไทย) แล้ววางใน LINE ส่วน **Copy link** คัดลอกเฉพาะลิงก์",
        },
        {
          h: "ลูกค้าเปิดลิงก์บนมือถือครั้งเดียว",
          p: `หน้าจอจะขึ้นว่า "${portalTh["link.title"].replace("{trainer}", "ชื่อคุณ").replace("{name}", "ชื่อลูกค้า")}" พร้อมปุ่ม *${portalTh["link.open"]}* หลังจากนั้นลูกค้าจะยังอยู่ในระบบบนมือถือเครื่องนั้นโดยไม่ต้องใช้รหัสผ่าน กล่องจะแสดง *Last seen* เมื่อลูกค้าเข้ามาแล้ว`,
        },
      ],
      aside: "**ลองเองได้** เปิดลิงก์ในเบราว์เซอร์เดียวกับที่คุณใช้ Program Tracker พอร์ทัลแยกการเข้าสู่ระบบของตัวเอง คุณจึงยังอยู่ในแอปนี้และเห็นเหมือนที่ลูกค้าเห็น",
    },
    clientSees: {
      h: "สิ่งที่ลูกค้าเห็น",
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
      neverList: [
        "ร่างโปรแกรม หรือโปรแกรมที่เก็บเข้าคลังแล้ว",
        "เหตุผลจาก AI ทิศทางโปรแกรม การแบ่งเฟส",
        "ข้อจำกัด เป้าหมาย 1RM",
        "สัญญาณเตือน กฎการโค้ช และลูกค้าคนอื่น",
      ],
      after: "สัปดาห์หน้าเป็นแบบดูล่วงหน้า เปิดดูได้แต่บันทึกได้เมื่อสัปดาห์นั้นเริ่มแล้ว สลับ English / ไทย ได้ในแถบบนด้วยการแตะครั้งเดียว และระบบจะจำค่าไว้บนมือถือของลูกค้า ส่วนแอปของคุณยังเป็นภาษาอังกฤษ",
    },
    clientLogs: {
      h: "ลูกค้าบันทึกอย่างไร",
      steps: [
        {
          h: portalTh["week.nextUp"],
          p: `หน้าจะเปิดที่เซสชันแรกที่ยังไม่ได้บันทึกของวันนี้ พร้อมปุ่มเขียว **${portalTh["session.log"]}** เซสชันก่อนหน้าที่ยังไม่ได้บันทึกอยู่ใต้ *${portalTh["week.earlier"]}* พร้อมป้าย ⟦warn|${portalTh["session.notLogged"]}⟧ ไม่เคยใช้คำว่า "พลาด"`,
        },
        {
          h: "กรอกเซต",
          p: `กก. และจำนวนครั้งถูกกรอกไว้ล่วงหน้าตามโปรแกรมของคุณ ลูกค้าแก้เฉพาะที่ต่างไป RPE ไม่บังคับ อยู่หลังปุ่ม *${portalTh["log.rpeShow"]}* ส่วน "${portalTh["log.readiness"]}" และช่องโน้ตไม่บังคับเช่นกัน`,
        },
        {
          h: portalTh["log.save"],
          p: `ปุ่มเดียวที่ด้านล่าง หน้าสรุปแสดงสิ่งที่บันทึกและจำนวนเซสชันของสัปดาห์ที่เสร็จแล้ว พร้อมปุ่ม **${portalTh["log.undo"]}** เผื่อกดผิด`,
        },
      ],
      rulesLead: "กติกาที่พอร์ทัลบังคับใช้:",
      rules: [
        "บันทึกได้**เฉพาะสัปดาห์นี้** สำหรับวันนี้หรือก่อนหน้า",
        `แก้หรือเลิกทำได้เฉพาะบันทึก**ของตัวเอง** เซสชันที่คุณบันทึกจะขึ้น ⟦neutral|${portalTh["session.loggedByCoach"]}⟧ และลูกค้าแทนที่จากมือถือไม่ได้ ส่วนที่ลูกค้าบันทึกเองจะขึ้น ⟦good|${portalTh["session.loggedByYou"]}⟧`,
      ],
    },
    youSee: {
      h: "สิ่งที่คุณเห็นหลังจากนั้น",
      p: [
        "บันทึกของลูกค้าเข้ามาทันทีที่กดบันทึก พร้อมป้าย ⟦neutral|by client⟧ ใน **History** ของลูกค้า ในบรรทัดที่บันทึกแล้วของหน้าโปรแกรม และในแจ้งเตือนบนหน้าบันทึกเมื่อเซสชันนั้นมีบันทึกอยู่แล้ว",
        "นับเหมือนบันทึกที่คุณกรอกเอง: ปริมาณรวม เซต RPE เฉลี่ย และ e1RM ใน block pulse รวมถึงสัญญาณเตือน (stall, RPE creep, adherence, cardio behind) อ่านจากข้อมูลนี้ **คุณจะไม่ได้รับแจ้งเตือน** เมื่อลูกค้าบันทึก ให้ดูได้ที่ Overview และหน้าของลูกค้า",
      ],
    },
    resetOff: {
      h: "รีเซ็ตหรือปิด",
      items: [
        {
          dt: "Reset link",
          dd: "ใช้เมื่อส่งลิงก์ผิดแชต หรือมีคนอื่นได้ลิงก์ไป ลิงก์เดิมจะใช้ไม่ได้ และ**ทุกเครื่องที่เข้าผ่านลิงก์นั้นจะถูกออกจากระบบ** คัดลอกลิงก์ใหม่แล้วส่งให้ลูกค้า กดครั้งแรกเพื่อขอ กดอีกครั้งเพื่อยืนยัน",
        },
        {
          dt: "Turn off",
          dd: "ใช้เมื่อลูกค้าเลิกซ้อมกับคุณ พอร์ทัลจะปิด เซสชันที่เข้าอยู่สิ้นสุด และตัดการเชื่อม Google บันทึกที่ผ่านมายังอยู่ ถ้าเปิดใหม่ภายหลังจะได้ลิงก์ใหม่",
        },
      ],
    },
    stuck: {
      h: "เมื่อมีอะไรไม่ทำงาน",
      head: ["ลูกค้าบอกว่า", "สาเหตุ และสิ่งที่ควรทำ"],
      rows: [
        [`"${portalTh["login.error.not_allowed"].split(" ลอง")[0]}"`, "อีเมลของบัญชี Google ไม่ตรงกับที่อยู่ในโปรไฟล์ลูกค้า แก้อีเมล หรือส่งลิงก์แทน"],
        [`"${portalTh["login.error.not_configured"].split(" ขอ")[0]}"`, "การเข้าถึงด้วย Google ของแอปยังจำกัดอยู่ ลิงก์ส่วนตัวใช้ได้เสมอ"],
        [`"${portalTh["week.emptyProgram"]}"`, "ลูกค้ายังไม่มีโปรแกรมที่**ใช้งานอยู่** อนุมัติและเปิดใช้ร่างโปรแกรม ลูกค้าจะเห็นทันที"],
        [`"${portalTh["link.invalid"]}"`, "คุณรีเซ็ตลิงก์ หรือปิดพอร์ทัลไปแล้ว คัดลอกลิงก์ใหม่จากแท็บ Settings ของลูกค้า"],
        ["เปิดครั้งแรกช้า", `เป็นเรื่องปกติของการเปิดครั้งแรกของวัน อาจใช้เวลาถึงหนึ่งนาที ลูกค้าจะเห็นข้อความ "${portalTh["week.slow"].split(" — ")[0]}" ไม่ใช่ข้อผิดพลาด`],
        ["\"บันทึกแล้วแต่หาไม่เจอ\"", "ดู History ของลูกค้าหาป้าย ⟦neutral|by client⟧ ถ้า *Last seen* ขึ้นว่า \"Not opened yet\" แปลว่าลูกค้ายังไม่ได้ใช้ลิงก์"],
      ],
    },
  },
};

export const GUIDE: Record<Locale, Guide> = { en, th };

/** Section anchors shared by both languages, in reading order. */
export const GUIDE_IDS = ["what-it-is", "set-up", "client-sees", "client-logs", "you-see", "reset-off", "stuck"] as const;
