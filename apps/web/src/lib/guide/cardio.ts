import type { Locale } from "$lib/portal/messages";
import type { ProgramsGuide } from "./programsWeeks";

/**
 * The "Cardio" guide: prescribing a cardio session (templates, intervals,
 * zones), the member's HR profile, how members log and you review, VO₂max
 * field tests, the weekly session-load target and display units. Same block
 * format as Programs & weeks; trainer buttons stay in English in both languages.
 */
export const CARDIO_GUIDE_IDS = ["prescribe", "intervals", "zones", "logging", "review", "vo2", "target", "units"] as const;
const [prescribe, intervals, zones, logging, review, vo2, target, units] = CARDIO_GUIDE_IDS;

const en: ProgramsGuide = {
  title: "Cardio",
  sub: "Prescribe runs, rides and intervals, read what your members log, and track their fitness over time.",
  crumbs: ["Guide", "Cardio"],
  onThisPage: "On this page",
  intro:
    "A cardio session sits in the week next to strength days. You prescribe it from a template, the member logs it by hand from their phone, and you review it with a note back. Everything is stored in metric; each person can choose to see miles and pounds.",
  sections: [
    {
      id: prescribe,
      h: "Prescribe a cardio session",
      blocks: [
        {
          steps: [
            { h: "Add it to the week", p: "On the program, press *+ Cardio session* and pick its day." },
            {
              h: "Start from a template",
              p: "*Easy / Zone 2*, *Tempo / Threshold*, *Intervals*, *Long / Endurance*, *Continuous* or *Custom*, plus any you've saved. A copy lands in the session: editing it never changes the template, or anything already logged.",
            },
            {
              h: "Set the modality and targets",
              p: "Running, Cycling, Rowing and the rest, or one of your own. Then a time or a distance, and optionally a pace, a zone and a session RPE target. Write instructions for the member in *Notes*.",
            },
          ],
        },
        {
          aside:
            "A session needs a workload — a time, a distance or an interval with one — before the program saves. *Save as template* keeps a session you'll reuse; hide the built-in templates you don't use in *Cardio library*.",
        },
      ],
    },
    {
      id: intervals,
      h: "Build intervals",
      blocks: [
        {
          p: "Press *Build intervals* for warm-up, work, recovery and cool-down. Each row has a repeat count, a time or distance, and a target zone and RPE.",
        },
        {
          list: [
            "A recovery sits under a work row and counts **between** reps: 5 reps get 4 recoveries, unless you tick *Also after the last rep*.",
            "The total adds up as you type, with a timeline of the session underneath.",
            "A distance-only interval adds distance, never a guessed time: the total then says the time is unknown.",
          ],
        },
      ],
    },
    {
      id: zones,
      h: "Heart-rate zones",
      blocks: [
        {
          p: "Zones become bpm once the member has an HR profile: their *Settings* tab › *Heart-rate zones*. Pick a method the numbers you have allow:",
        },
        {
          defs: [
            { dt: "% of max HR", dd: "Needs a max heart rate." },
            { dt: "Heart-rate reserve (Karvonen)", dd: "Needs resting and max heart rate." },
            { dt: "% of threshold (LTHR)", dd: "Needs a lactate-threshold heart rate from a 30-minute test in the same sport (Friel's running zones). It must be below max HR." },
            { dt: "Custom", dd: "Type each zone's band yourself; gaps and overlaps are flagged." },
          ],
        },
        {
          aside:
            "Nothing is estimated: without a max HR there's no % of max, and no 220 − age. Saving makes a new version from a date, so past logs keep the zones they were done with.",
        },
      ],
    },
    {
      id: logging,
      h: "How members log cardio",
      blocks: [
        {
          p: "In the portal the member sees each interval with its zone in bpm. *Log it* opens a short form: time taken and how hard the whole session felt (RPE) are required; distance, average and max heart rate, pain and a note are optional. Per-interval results and calories are folded away.",
        },
        {
          p: "The form works out pace and session load as they type. *I didn't do it today* records a skip with a reason, so the session isn't counted as missed.",
        },
      ],
    },
    {
      id: review,
      h: "Review a logged session",
      blocks: [
        {
          p: "The member's *Cardio* tab lists their sessions with ⟦warn|To review⟧ on new ones. Open one to see the plan next to what they did, add a note, and press *Mark reviewed*.",
        },
        {
          p: "Your note shows on that session in their portal, and in their *Progress* tab. A session you logged for them shows its note only in Progress.",
        },
      ],
    },
    {
      id: vo2,
      h: "VO₂max field tests",
      blocks: [
        {
          p: "In the *Assessments* tab, pick a test, enter the result and the app calculates the estimate: the Cooper 12-minute run, the 1.5-mile run, or the Rockport 1-mile walk (needs the member's sex and bodyweight).",
        },
        {
          aside:
            "These are estimates from field tests, not lab values. Compare a member with the same test over time; the member sees the trend in Progress.",
        },
      ],
    },
    {
      id: target,
      h: "Weekly cardio target",
      blocks: [
        {
          p: "Set it on the member's profile in minutes, sessions or **session load** — session RPE × minutes. A 35-minute run at RPE 7 is a load of 245. Skipped sessions count toward none of these.",
        },
        { p: "The member sees this week against the target at the top of their portal and in Progress." },
      ],
    },
    {
      id: units,
      h: "Miles and pounds",
      blocks: [
        {
          p: "*Settings › Units* switches what you see and type to lb and mi. Members choose their own on the portal's settings page. Saved numbers stay in kg and km, so switching never changes a log.",
        },
      ],
    },
  ],
};

const th: ProgramsGuide = {
  title: "คาร์ดิโอ",
  sub: "สั่งวิ่ง ปั่น และอินเทอร์วัล ดูผลที่เมมเบอร์บันทึก แล้วติดตามความฟิตไปเรื่อย ๆ",
  crumbs: ["คู่มือ", "คาร์ดิโอ"],
  onThisPage: "ในหน้านี้",
  intro:
    "เซสชันคาร์ดิโออยู่ในสัปดาห์เดียวกับวันเวท คุณสั่งจากเทมเพลต เมมเบอร์กรอกผลเองจากมือถือ แล้วคุณรีวิวพร้อมส่งโน้ตกลับ ทุกค่าเก็บเป็นหน่วยเมตริก แต่ละคนเลือกดูเป็นไมล์และปอนด์ได้เอง",
  sections: [
    {
      id: prescribe,
      h: "สั่งเซสชันคาร์ดิโอ",
      blocks: [
        {
          steps: [
            { h: "เพิ่มลงในสัปดาห์", p: "ในหน้าโปรแกรม กด *+ Cardio session* แล้วเลือกวัน" },
            {
              h: "เริ่มจากเทมเพลต",
              p: "*Easy / Zone 2*, *Tempo / Threshold*, *Intervals*, *Long / Endurance*, *Continuous* หรือ *Custom* รวมถึงเทมเพลตที่คุณเซฟไว้ ระบบจะคัดลอกมาใส่เซสชัน แก้ตรงนี้แล้วเทมเพลตกับผลที่บันทึกไปแล้วไม่เปลี่ยน",
            },
            {
              h: "ใส่ประเภทกีฬาและเป้า",
              p: "วิ่ง ปั่น กรรเชียงบก ฯลฯ หรือที่คุณเพิ่มเอง จากนั้นใส่เวลาหรือระยะทาง จะใส่เพซ โซน และ RPE เป้าหมายด้วยก็ได้ คำแนะนำถึงเมมเบอร์เขียนไว้ใน *Notes*",
            },
          ],
        },
        {
          aside:
            "เซสชันต้องมีปริมาณงานก่อนถึงจะเซฟโปรแกรมได้ คือมีเวลา ระยะทาง หรืออินเทอร์วัลที่มีอย่างใดอย่างหนึ่ง *Save as template* ใช้เก็บเซสชันที่จะใช้ซ้ำ ส่วนเทมเพลตในตัวที่ไม่ใช้ ซ่อนได้ใน *Cardio library*",
        },
      ],
    },
    {
      id: intervals,
      h: "สร้างอินเทอร์วัล",
      blocks: [
        {
          p: "กด *Build intervals* เพื่อใส่วอร์มอัพ ช่วงหนัก ช่วงพัก และคูลดาวน์ แต่ละแถวมีจำนวนรอบ เวลาหรือระยะทาง และโซนกับ RPE เป้าหมาย",
        },
        {
          list: [
            "ช่วงพักอยู่ใต้แถวช่วงหนัก และนับเฉพาะ**ระหว่าง**รอบ 5 รอบจึงได้ช่วงพัก 4 ครั้ง เว้นแต่ติ๊ก *Also after the last rep*",
            "เวลารวมคำนวณให้ระหว่างพิมพ์ พร้อมไทม์ไลน์ของทั้งเซสชันด้านล่าง",
            "อินเทอร์วัลที่มีแค่ระยะทางจะบวกเฉพาะระยะ ไม่เดาเวลาให้ เวลารวมจะขึ้นว่ายังไม่รู้",
          ],
        },
      ],
    },
    {
      id: zones,
      h: "โซนชีพจร",
      blocks: [
        {
          p: "โซนจะแสดงเป็น bpm เมื่อเมมเบอร์มีโปรไฟล์ชีพจรแล้ว ตั้งได้ที่แท็บ *Settings* › *Heart-rate zones* ของเขา เลือกวิธีตามค่าที่มี",
        },
        {
          defs: [
            { dt: "% ของชีพจรสูงสุด", dd: "ต้องมีชีพจรสูงสุด" },
            { dt: "Heart-rate reserve (Karvonen)", dd: "ต้องมีชีพจรขณะพักและชีพจรสูงสุด" },
            { dt: "% ของ threshold (LTHR)", dd: "ต้องมีชีพจรที่ lactate threshold จากการทดสอบ 30 นาทีในกีฬาเดียวกัน (โซนวิ่งของ Friel) และต้องต่ำกว่าชีพจรสูงสุด" },
            { dt: "Custom", dd: "พิมพ์ช่วง bpm ของแต่ละโซนเอง ระบบจะเตือนถ้ามีช่องว่างหรือช่วงทับกัน" },
          ],
        },
        {
          aside:
            "ระบบไม่ประมาณค่าให้ ไม่มีชีพจรสูงสุดก็ใช้ % ของชีพจรสูงสุดไม่ได้ และไม่ใช้สูตร 220 − อายุ ทุกครั้งที่เซฟจะเป็นเวอร์ชันใหม่ที่เริ่มจากวันที่กำหนด ผลเก่าจึงยังใช้โซนของตอนนั้นอยู่",
        },
      ],
    },
    {
      id: logging,
      h: "เมมเบอร์กรอกผลคาร์ดิโอยังไง",
      blocks: [
        {
          p: "ในพอร์ทัล เมมเบอร์เห็นแต่ละช่วงพร้อมโซนเป็น bpm ปุ่ม *กรอกผล* เปิดฟอร์มสั้น ๆ ที่ต้องกรอกคือเวลาที่ใช้กับความเหนื่อยทั้งเซสชัน (RPE) ส่วนระยะทาง ชีพจรเฉลี่ย ชีพจรสูงสุด อาการเจ็บ และข้อความถึงโค้ชไม่บังคับ ผลแยกรายช่วงกับแคลอรีพับเก็บไว้",
        },
        {
          p: "ฟอร์มคำนวณเพซกับโหลดให้ระหว่างกรอก ถ้ากด *วันนี้ไม่ได้เล่น* จะบันทึกเป็นการข้ามพร้อมเหตุผล เซสชันนั้นจึงไม่นับเป็นขาด",
        },
      ],
    },
    {
      id: review,
      h: "รีวิวเซสชันที่บันทึกแล้ว",
      blocks: [
        {
          p: "แท็บ *Cardio* ของเมมเบอร์แสดงเซสชันทั้งหมด อันใหม่จะมี ⟦warn|To review⟧ เปิดดูจะเห็นแผนเทียบกับที่ทำจริง ใส่โน้ตแล้วกด *Mark reviewed*",
        },
        {
          p: "โน้ตของคุณจะขึ้นที่เซสชันนั้นในพอร์ทัลของเมมเบอร์ และในแท็บ *พัฒนาการ* ถ้าเป็นเซสชันที่คุณบันทึกให้ โน้ตจะขึ้นแค่ในแท็บพัฒนาการ",
        },
      ],
    },
    {
      id: vo2,
      h: "ทดสอบ VO₂max ภาคสนาม",
      blocks: [
        {
          p: "ในแท็บ *Assessments* เลือกแบบทดสอบ ใส่ผล แล้วแอปจะคำนวณค่าประมาณให้ มีวิ่ง 12 นาที (Cooper) วิ่ง 1.5 ไมล์ และเดิน 1 ไมล์ (Rockport) ซึ่งต้องมีเพศและน้ำหนักตัวของเมมเบอร์",
        },
        {
          aside: "ค่าเหล่านี้เป็นค่าประมาณจากการทดสอบภาคสนาม ไม่ใช่ผลจากแล็บ ให้เทียบกับแบบทดสอบเดิมของคนเดิม เมมเบอร์จะเห็นแนวโน้มในแท็บพัฒนาการ",
        },
      ],
    },
    {
      id: target,
      h: "เป้าคาร์ดิโอรายสัปดาห์",
      blocks: [
        {
          p: "ตั้งได้ในโปรไฟล์เมมเบอร์ เป็นนาที จำนวนเซสชัน หรือ**โหลด** คือ RPE ทั้งเซสชัน × นาที เช่น วิ่ง 35 นาทีที่ RPE 7 ได้โหลด 245 เซสชันที่ข้ามจะไม่นับรวม",
        },
        { p: "เมมเบอร์เห็นยอดสัปดาห์นี้เทียบกับเป้าที่หัวพอร์ทัลและในแท็บพัฒนาการ" },
      ],
    },
    {
      id: units,
      h: "ไมล์และปอนด์",
      blocks: [
        {
          p: "*Settings › Units* เปลี่ยนหน่วยที่คุณเห็นและพิมพ์เป็น lb กับ mi ส่วนเมมเบอร์เลือกเองได้ในหน้าตั้งค่าของพอร์ทัล ค่าที่บันทึกยังเป็น kg กับ km เปลี่ยนหน่วยแล้วผลที่บันทึกไว้จึงไม่เปลี่ยน",
        },
      ],
    },
  ],
};

export const CARDIO_GUIDE: Record<Locale, ProgramsGuide> = { en, th };
