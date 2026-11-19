# What's new

## Unreleased

## v0.1.38 — 2026-11-19

### New
- The program page now shows each week's dates (like "W2 · 17–23 Nov"), marks the week your client is in now, and opens on that week. A week that has ended says so.
  - th: หน้าโปรแกรมแสดงวันที่ของแต่ละสัปดาห์แล้ว (เช่น "W2 · 17–23 พ.ย.") มีป้ายบอกว่าตอนนี้เมมเบอร์อยู่สัปดาห์ไหน และเปิดมาที่สัปดาห์นั้นเลย ส่วนสัปดาห์ที่จบไปแล้วก็จะขึ้นว่าจบแล้ว
- Adding or removing a session, or adding, removing or swapping an exercise, now also updates the later weeks, so your client sees the change. Weeks that have ended stay as they were, and sets, reps and loads stay per week. An exercise added this way follows your block's progression. You can undo, or choose to change this week only.
  - th: ตอนนี้ถ้าเพิ่มหรือลบเซสชัน หรือเพิ่ม ลบ หรือเปลี่ยนท่า สัปดาห์ต่อ ๆ ไปก็จะอัปเดตตามด้วย เมมเบอร์จะได้เห็นสิ่งที่คุณแก้ สัปดาห์ที่จบไปแล้วยังเหมือนเดิม ส่วนเซ็ต จำนวนครั้ง และน้ำหนักก็ยังแยกกันรายสัปดาห์ ท่าที่เพิ่มแบบนี้จะเดินตาม progression ของบล็อก จะกดเลิกทำ หรือเลือกเปลี่ยนแค่สัปดาห์นี้ก็ได้
- Choose the day Week 1 starts when you activate a program, and change it later. Pick next Monday to start next week, or an earlier date if your client is already a few weeks in. Weeks before you activated never count as missed. Before the start, your client sees "Your program starts Mon 23 Nov".
  - th: ตอนเปิดใช้โปรแกรม เลือกได้แล้วว่าสัปดาห์ที่ 1 จะเริ่มวันไหน และเปลี่ยนทีหลังก็ได้ ถ้าจะเริ่มสัปดาห์หน้าก็เลือกวันจันทร์หน้า ถ้าเมมเบอร์เล่นมาได้สองสามสัปดาห์แล้วก็เลือกวันที่ย้อนหลังไป สัปดาห์ก่อนวันเปิดใช้จะไม่นับว่าขาดเลย ก่อนถึงวันเริ่ม เมมเบอร์จะเห็นข้อความ "โปรแกรมของคุณเริ่มวันจันทร์ 23 พ.ย."

## v0.1.37 — 2026-11-19

### New
- To check a bug you've reported, support can now open the app as you and see exactly what you saw, without asking for screenshots. A visit is time-limited and logged, and support can't change anything unless they deliberately turn that on. When support looks from one of your tickets, the ticket shows "Support viewed your account to check this".
  - th: เวลาคุณแจ้งบั๊ก ทีมซัพพอร์ตเปิดแอปในมุมมองของคุณได้แล้ว เห็นแบบเดียวกับที่คุณเห็น ไม่ต้องขอภาพหน้าจอ การเข้าดูแต่ละครั้งมีเวลาจำกัดและมีบันทึกไว้ ทีมซัพพอร์ตแก้ไขอะไรไม่ได้ ยกเว้นจะตั้งใจเปิดสิทธิ์นั้นเอง ถ้าเข้าดูจากตั๋วของคุณ ตั๋วนั้นจะขึ้นว่า "ทีมซัพพอร์ตเข้าไปดูบัญชีของคุณเพื่อตรวจเรื่องนี้"

## v0.1.36 — 2026-11-18

### Changed
- The last places that still said "lifting" now say "exercise": the client's week summary, the week grid legend and a few error messages. Your programs and logs are unchanged.
  - th: จุดที่ยังเขียนว่า "lifting" เปลี่ยนเป็น "exercise" หมดแล้ว ทั้งสรุปสัปดาห์ของเมมเบอร์ คำอธิบายในตารางสัปดาห์ และข้อความแจ้งข้อผิดพลาดบางข้อ โปรแกรมและบันทึกการฝึกของคุณยังเหมือนเดิม

## v0.1.35 — 2026-11-18

### Changed
- Sessions built from a list of exercises are now called **exercise sessions** instead of lifting sessions, so mobility work and circuits aren't labelled as lifting. The program editor's button reads **+ Exercise session**, and a client's week shows exercise sessions and exercise days.
  - th: เซสชันที่เป็นรายการท่าออกกำลังกาย ตอนนี้เรียกว่า **exercise session** แทน lifting session เพื่อไม่ให้งานโมบิลิตี้หรือเซอร์กิตถูกเรียกว่ายกเวท ปุ่มในหน้าแก้ไขโปรแกรมเปลี่ยนเป็น **+ Exercise session** และสัปดาห์ของเมมเบอร์แสดงเป็น exercise session กับ exercise day
- When you create your own session type, pick what it records: **Exercises** or **Cardio**. Preset types no longer show a format badge, since their name already says it.
  - th: ตอนสร้างประเภทเซสชันเอง ให้เลือกว่าบันทึกอะไร: **Exercises** หรือ **Cardio** ส่วนประเภท preset ไม่มีป้ายรูปแบบแล้ว เพราะชื่อก็บอกอยู่แล้ว

## v0.1.34 — 2026-11-18

### New
- Session types are now a fixed two-level list: **Cardiovascular** (Aerobic base, Anaerobic endurance, Anaerobic power), **Strength training** (Stability & mobility, Functional movement, Loaded strength, Performance) and **Metabolic** (Circuit, AMRAP). The session type picker groups each sub-type under its main type. Your own types stay in their own section. Your old Strength, Mobility, Circuit, Zone 2 and Intervals types move onto the matching preset, and saved programs keep the names they had.
  - th: ประเภทเซสชันเป็นรายการสองชั้นแบบตายตัวแล้ว: **Cardiovascular** (Aerobic base, Anaerobic endurance, Anaerobic power), **Strength training** (Stability & mobility, Functional movement, Loaded strength, Performance) และ **Metabolic** (Circuit, AMRAP) ช่องเลือกประเภทเซสชันจัดประเภทย่อยไว้ใต้ประเภทหลัก ส่วนประเภทที่คุณสร้างเองยังอยู่ในหมวดของตัวเอง ประเภทเดิมอย่าง Strength, Mobility, Circuit, Zone 2 และ Intervals จะย้ายไปอยู่ใน preset ที่ตรงกัน โปรแกรมที่บันทึกไว้แล้วยังใช้ชื่อเดิม
- Circuit sessions can be lifting or cardio.
  - th: เซสชัน Circuit เป็นได้ทั้งเวทและคาร์ดิโอ
- The language is now part of the link (`/en/…`, `/th/…`), so a link you share opens in the same language. Old links still work. The language switch keeps you on the same page.
  - th: ภาษาอยู่ในลิงก์แล้ว (`/en/…`, `/th/…`) ลิงก์ที่ส่งต่อให้คนอื่นจะเปิดเป็นภาษาเดียวกัน ลิงก์เก่ายังใช้ได้ และปุ่มสลับภาษาจะพาคุณอยู่หน้าเดิม
- When a client signs in to the portal, they come back to the page and language they started from.
  - th: เมื่อเมมเบอร์เข้าสู่ระบบพอร์ทัล จะกลับมาที่หน้าเดิมและภาษาเดิมที่เปิดไว้ก่อนหน้า
- A new guide, in English and Thai, shows how the client portal works, with drawings of each screen. You can copy a client's portal link straight from the overview.
  - th: มีคู่มือใหม่ทั้งภาษาไทยและอังกฤษ อธิบายการใช้พอร์ทัลเมมเบอร์พร้อมภาพวาดของแต่ละหน้าจอ และคัดลอกลิงก์พอร์ทัลของเมมเบอร์ได้จากหน้าภาพรวมเลย
- When you send feedback, pick what it is: a bug, wrong behaviour, an idea or a question. For bugs, say what you expected and what happened. The app attaches recent errors and your last few steps, with emails, phone numbers and sign-in keys removed.
  - th: ตอนส่งฟีดแบ็ก เลือกได้ว่าเป็นบั๊ก การทำงานที่ผิด ไอเดีย หรือคำถาม ถ้าเป็นบั๊กให้บอกว่าคาดว่าจะเกิดอะไรและเกิดอะไรขึ้นจริง แอปจะแนบข้อผิดพลาดล่าสุดและขั้นตอนที่คุณเพิ่งทำไปด้วย โดยตัดอีเมล เบอร์โทร และคีย์เข้าระบบออก
- When a fix ships, rate it 👍 or 👎. A 👎 reopens the ticket, with an optional note on what's still wrong.
  - th: เมื่อแก้ไขเสร็จแล้ว กด 👍 หรือ 👎 ได้ ถ้ากด 👎 ตั๋วจะถูกเปิดใหม่ และเขียนสั้น ๆ ได้ว่ายังผิดตรงไหน

### Fixed
- While a page loads, its placeholder now has the same shape as the page, so nothing jumps when it appears.
  - th: ระหว่างที่หน้ากำลังโหลด โครงที่ขึ้นมาก่อนมีรูปร่างเหมือนหน้าจริงแล้ว พอโหลดเสร็จจึงไม่กระโดด
- "All clients" on the overview opens the clients list, and the portal column there is clearer.
  - th: ปุ่ม "All clients" ในหน้าภาพรวมพาไปที่รายชื่อเมมเบอร์ และคอลัมน์พอร์ทัลในหน้านั้นอ่านง่ายขึ้น
- Links to a page that has moved keep your language and the section you were linked to.
  - th: ลิงก์ไปหน้าที่ย้ายที่แล้วยังคงภาษาและส่วนที่ลิงก์ชี้ไว้

## v0.1.33 — 2026-11-17

### New
- An exercise can now have up to 4 **movement patterns**, e.g. a Bulgarian split squat is Knee-dominant and Hip-dominant. The ★ marks the primary pattern: set balance, role suggestions and day placement count only the primary, so hip work still has to come from real hinges. The other patterns help search, filters, the coverage grid and AI drafts. Functional movement stays one choice.
  - th: ท่าหนึ่งมี **Movement pattern** ได้สูงสุด 4 อัน เช่น Bulgarian split squat เป็นทั้ง Knee-dominant และ Hip-dominant ★ คือ pattern หลัก การนับสมดุลเซ็ต การแนะนำบทบาท และการจัดวันฝึกนับเฉพาะ pattern หลัก งานสะโพกจึงยังต้องมาจากท่า hinge จริง ส่วน pattern อื่นช่วยในการค้นหา ตัวกรอง ตาราง Coverage และร่างโปรแกรมของ AI ส่วน Functional movement ยังเลือกได้อันเดียวเหมือนเดิม
- New **No pattern** tag for mobility, drills and warm-ups. They no longer show as needing a tag, and they don't count toward any pattern in your balance.
  - th: แท็กใหม่ **No pattern** สำหรับท่า mobility ดริล และวอร์มอัพ ท่าเหล่านี้จะไม่ขึ้นว่ายังไม่ได้ติดแท็กอีก และไม่ถูกนับเข้า pattern ไหนในสมดุลเซ็ต
- Tag many exercises at once: select them in the library and use **Add pattern**. Each pattern shows how many of them already have it, and you can remove a pattern from all of them or **Clear patterns**. Every change can be undone from the notice at the bottom.
  - th: ติดแท็กหลายท่าพร้อมกัน: เลือกท่าในคลังท่าแล้วกด **Add pattern** แต่ละ pattern บอกว่ามีกี่ท่าที่ติดแล้ว เอา pattern ออกจากทุกท่าที่เลือก หรือกด **Clear patterns** ได้ ทุกการเปลี่ยนแปลงกดย้อนกลับ (Undo) ได้จากแถบแจ้งเตือนด้านล่าง
- When a new version is out, a small notice at the bottom of the screen tells you and links to What's new. It goes away on its own and waits while you're logging a session.
  - th: เมื่อมีเวอร์ชันใหม่ จะมีแถบแจ้งเตือนเล็ก ๆ ด้านล่างจอพร้อมลิงก์ไปหน้า What's new แถบจะหายไปเอง และจะไม่ขึ้นระหว่างที่คุณบันทึกเซสชัน
- The What's new page can switch between Thai and English.
  - th: หน้า What's new สลับภาษาไทย/อังกฤษได้

### Fixed
- The settings tabs no longer wobble when you scroll with a trackpad.
  - th: แถบแท็บในหน้าตั้งค่าไม่สั่นอีกเมื่อเลื่อนด้วยแทร็กแพด

## v0.1.32 — 2026-11-17

### New
- Feedback has a new **In progress** status, between Accepted and Done, so you can tell when your ticket is being worked on. You get an email when your ticket moves to In progress, as with the other status changes.
  - th: ฟีดแบ็กมีสถานะใหม่ **กำลังดำเนินการ** อยู่ระหว่าง “รับเรื่องแล้ว” กับ “เสร็จแล้ว” ดูได้ว่ามีคนกำลังแก้ตั๋วของคุณอยู่หรือยัง และคุณจะได้รับอีเมลเมื่อตั๋วเปลี่ยนเป็นกำลังดำเนินการ เหมือนสถานะอื่น ๆ

## v0.1.31 — 2026-11-17

### Fixed
- Paste notes: when your notes hold two different weeks, you can now draft them as **A/B weeks**. Pick "A/B weeks" under "Draft which one?" and choose which week is A and which is B. "Use this" fills the builder's Week A and Week B tabs with A/B weeks switched on. It also works on notes you read before this update.
  - th: วางโน้ต: เมื่อโน้ตมีสองสัปดาห์ที่ต่างกัน ตอนนี้ร่างเป็น **สัปดาห์ A/B** ได้ เลือก “A/B weeks” ที่ “Draft which one?” แล้วเลือกว่าสัปดาห์ไหนเป็น A หรือ B กด “Use this” เพื่อเติมแท็บ Week A และ Week B ของตัวสร้างโปรแกรมพร้อมเปิดโหมดสัปดาห์ A/B ใช้ได้กับโน้ตที่อ่านไว้ก่อนอัปเดตนี้ด้วย

## v0.1.30 — 2026-11-17

### New
- Client portal: your clients can see their week and log their own sessions on their phone, in English or Thai. It's off until you turn it on in a client's Settings tab, which gives you a personal access link to send them (with a ready-made LINE message). Google sign-in is coming once it's approved.
  - th: พอร์ทัลเมมเบอร์: เมมเบอร์ดูตารางสัปดาห์และบันทึกเซสชันเองได้บนมือถือ เป็นภาษาไทยหรืออังกฤษ ฟีเจอร์นี้ปิดอยู่จนกว่าคุณจะเปิดในแท็บ Settings ของเมมเบอร์ แล้วคุณจะได้ลิงก์เข้าใช้งานส่วนตัวไว้ส่งให้เมมเบอร์ (พร้อมข้อความ LINE สำเร็จรูป) การเข้าสู่ระบบด้วย Google จะตามมาเมื่อได้รับอนุมัติ
- On the portal, clients see what's next, your session note, last time's set for each exercise, a rest timer, this week's cardio against your target, and whether it's a deload or test week. Your block plan itself stays private.
  - th: ในพอร์ทัล เมมเบอร์จะเห็นเซสชันถัดไป โน้ตของคุณสำหรับเซสชันนั้น เซตครั้งก่อนของแต่ละท่า ตัวจับเวลาพัก คาร์ดิโอสัปดาห์นี้เทียบกับเป้าที่คุณตั้ง และบอกว่าเป็นสัปดาห์ดีโหลดหรือสัปดาห์ทดสอบ ส่วนแผนบล็อกของคุณ เมมเบอร์ไม่เห็น
- Clients can save a set as planned in one tap, add RPE only when they want to, skip an exercise, flag pain, mark a missed set, and rate readiness. The log screen still opens when the phone is offline.
  - th: เมมเบอร์บันทึกเซตตามแผนได้ด้วยการแตะครั้งเดียว ใส่ RPE เฉพาะเมื่ออยากใส่ ข้ามท่า แจ้งว่าเจ็บ ทำเครื่องหมายเซตที่พลาด และให้คะแนนความพร้อมได้ หน้าบันทึกยังเปิดได้แม้มือถือออฟไลน์
- Their logs land in History marked "by client", with how long the session took. Low readiness and client notes show up as signals for you, and sets saved untouched count as volume but don't skew RPE, creep or stall signals.
  - th: บันทึกของเมมเบอร์จะเข้าไปอยู่ใน History พร้อมป้าย "by client" และระยะเวลาของเซสชัน ความพร้อมต่ำและโน้ตจากเมมเบอร์จะขึ้นเป็นสัญญาณเตือนให้คุณ เซตที่บันทึกโดยไม่แก้ตัวเลขนับเป็นวอลุ่ม แต่ไม่ทำให้สัญญาณ RPE, creep หรือ stall คลาดเคลื่อน
- Reset a client's link at any time: the old link and every signed-in phone stop working.
  - th: รีเซ็ตลิงก์ของเมมเบอร์ได้ทุกเมื่อ ลิงก์เก่าและมือถือทุกเครื่องที่เข้าสู่ระบบไว้จะใช้ไม่ได้ทันที

## v0.1.29 — 2026-11-16

### New
- **A/B weeks.** A program can now run two different weeks in turn: Week A on odd weeks, Week B on even weeks. Switch "Weeks" to "A/B weeks" in the program builder or on the program page.
  - th: **สัปดาห์ A/B** โปรแกรมหนึ่งสลับใช้สองสัปดาห์ที่ต่างกันได้แล้ว: Week A ในสัปดาห์คี่ Week B ในสัปดาห์คู่ เปลี่ยน "Weeks" เป็น "A/B weeks" ในตัวสร้างโปรแกรมหรือหน้าโปรแกรม
- In the builder, A/B weeks gives you a Week A and a Week B tab. On the program page each week tab shows its letter.
  - th: ในตัวสร้างโปรแกรม โหมดสัปดาห์ A/B จะมีแท็บ Week A และ Week B ส่วนในหน้าโปรแกรม แท็บแต่ละสัปดาห์จะแสดงตัวอักษรของสัปดาห์นั้น
- "Copy this week to…" on the program page copies a week to every week with the same letter, or to one week. Weeks your client has already logged are never overwritten, and you can undo.
  - th: "Copy this week to…" ในหน้าโปรแกรมคัดลอกสัปดาห์ไปยังทุกสัปดาห์ที่มีตัวอักษรเดียวกัน หรือไปยังสัปดาห์เดียวก็ได้ สัปดาห์ที่เมมเบอร์บันทึกแล้วจะไม่ถูกเขียนทับ และกดย้อนกลับได้
- Progression, block pulse, deloads and "Generate next week" follow each letter: week 3 builds on week 1, week 4 on week 2.
  - th: Progression, Block pulse, ดีโหลด และ "Generate next week" แยกตามตัวอักษร: สัปดาห์ 3 ต่อยอดจากสัปดาห์ 1 สัปดาห์ 4 ต่อยอดจากสัปดาห์ 2
- Paste notes recognises a Week A / Week B program and fills both tabs.
  - th: วางโน้ต (Paste notes) จำโปรแกรม Week A / Week B ได้และเติมให้ทั้งสองแท็บ
- **The AI now writes every week of a block**, not one week copied onto every week. Pick the block length (up to 12 weeks) and Same every week or A/B weeks on the generate page; it remembers your last choice. Review and chat show a tab for each week.
  - th: **AI เขียนทุกสัปดาห์ของบล็อกแล้ว** ไม่ใช่เขียนสัปดาห์เดียวแล้วคัดลอกไปทุกสัปดาห์ เลือกความยาวบล็อก (สูงสุด 12 สัปดาห์) และ Same every week หรือ A/B weeks ในหน้าสร้างโปรแกรม ระบบจำตัวเลือกล่าสุดไว้ให้ หน้ารีวิวและแชตมีแท็บแยกแต่ละสัปดาห์
- **Fill remaining weeks with AI**: write the first week (or Week A and Week B) yourself, then let the AI write the rest. Weeks your client has logged stay as they are.
  - th: **Fill remaining weeks with AI**: เขียนสัปดาห์แรก (หรือ Week A และ Week B) เอง แล้วให้ AI เขียนสัปดาห์ที่เหลือ สัปดาห์ที่เมมเบอร์บันทึกแล้วจะคงไว้เหมือนเดิม
- "Approve" on an AI draft is now called "Create program".
  - th: ปุ่ม "Approve" บนร่างจาก AI เปลี่ยนชื่อเป็น "Create program"
- **You're told when an AI draft is done**, wherever you are in the app: "Ada's draft is ready" with a Review button, or a note if it failed. It stays until you dismiss it. If the tab is in the background, your browser shows a notification too. The app asks for permission the first time you generate.
  - th: **แจ้งเตือนเมื่อร่างจาก AI เสร็จ** ไม่ว่าคุณจะอยู่หน้าไหนในแอป: "Ada's draft is ready" พร้อมปุ่ม Review หรือแจ้งถ้าล้มเหลว ข้อความจะอยู่จนกว่าคุณจะปิด ถ้าแท็บอยู่เบื้องหลัง เบราว์เซอร์จะแสดงการแจ้งเตือนด้วย แอปจะขออนุญาตในครั้งแรกที่คุณสร้างร่าง

### Fixed
- Turning A/B weeks off now asks whether every week should use Week A or Week B, or keep its own workouts, so the program really is the same every week.
  - th: เมื่อปิดสัปดาห์ A/B ระบบจะถามว่าจะให้ทุกสัปดาห์ใช้ Week A หรือ Week B หรือคงเวิร์กเอาต์ของแต่ละสัปดาห์ไว้ เพื่อให้โปรแกรมเหมือนกันทุกสัปดาห์จริง ๆ
- The selected option in switches like "Same every week | A/B weeks" is easier to see.
  - th: ตัวเลือกที่เลือกอยู่ในสวิตช์อย่าง "Same every week | A/B weeks" มองเห็นง่ายขึ้น
- Week tabs show logged sessions with a check mark (✓2), so the count isn't confused with the A/B letter.
  - th: แท็บสัปดาห์แสดงจำนวนเซสชันที่บันทึกแล้วพร้อมเครื่องหมายถูก (✓2) จะได้ไม่สับสนกับตัวอักษร A/B
- Applying an AI fill is refused if the program changed after the fill was drafted, so your edits are never overwritten.
  - th: ถ้าคุณแก้โปรแกรมหลังจากที่ AI ร่างสัปดาห์ที่เหลือไว้แล้ว ระบบจะไม่นำร่างนั้นมาใช้ การแก้ไขของคุณจึงไม่ถูกเขียนทับ
- Opening the generate page while a draft is being written goes straight to its progress, instead of flashing the form first.
  - th: ถ้าเปิดหน้าสร้างโปรแกรมตอนที่ AI กำลังเขียนร่างอยู่ ระบบจะพาไปหน้าความคืบหน้าทันที ไม่มีฟอร์มกะพริบขึ้นมาก่อน
- On phones, the "copied" message no longer covers the save bar.
  - th: บนมือถือ ข้อความ "copied" ไม่บังแถบบันทึกอีกแล้ว

### Changed
- AI drafts take longer, about 2–5 minutes, because the AI writes every week. The generate page shows the expected wait.
  - th: ร่างจาก AI ใช้เวลานานขึ้น ประมาณ 2–5 นาที เพราะ AI เขียนทุกสัปดาห์ หน้าสร้างโปรแกรมจะบอกเวลารอโดยประมาณ
- Z.ai is turned off; drafts use DeepSeek.
  - th: ปิดการใช้ Z.ai แล้ว ร่างทั้งหมดใช้ DeepSeek

## v0.1.28 — 2026-11-13

### New
- Leaving a page with unsaved changes now asks in a proper in-app dialog instead of the browser's pop-up. On the log sheet you can leave and keep your entries as a draft on this device; in the program editor you can save and leave in one tap.
  - th: ถ้าออกจากหน้าที่ยังมีการแก้ไขไม่ได้บันทึก ระบบจะถามผ่านกล่องโต้ตอบในแอป แทนป๊อปอัปของเบราว์เซอร์ ในหน้าบันทึกเซสชัน คุณออกจากหน้าแล้วเก็บข้อมูลที่กรอกไว้เป็นร่างบนเครื่องนี้ได้ ส่วนในตัวแก้ไขโปรแกรม บันทึกแล้วออกได้ด้วยการแตะครั้งเดียว
- Skipping or switching a block on the log sheet, and discarding template edits, ask in the same dialog.
  - th: การข้ามหรือสลับบล็อกในหน้าบันทึกเซสชัน และการทิ้งการแก้ไขเทมเพลต ก็ถามผ่านกล่องโต้ตอบเดียวกัน
- Click a feedback ticket's handle (like FB-012) to copy it.
  - th: คลิกรหัสตั๋วฟีดแบ็ก (เช่น FB-012) เพื่อคัดลอก

## v0.1.27 — 2026-11-12

### New
- A fresh sign-in page. Admins can pick its layout (classic, split, bold or minimal) and accent colour in Settings › Login page, with a live preview before saving.
  - th: หน้าเข้าสู่ระบบใหม่ แอดมินเลือกเลย์เอาต์ (classic, split, bold หรือ minimal) และสีเน้นได้ที่ Settings › Login page พร้อมพรีวิวสดก่อนบันทึก
- Settings is split into pages: Appearance, Notifications, Coaching and About, with a side menu (tabs at the top on a phone). Each page has its own link.
  - th: หน้าตั้งค่าแบ่งเป็นหน้าย่อย: Appearance, Notifications, Coaching และ About มีเมนูด้านข้าง (บนมือถือเป็นแท็บด้านบน) แต่ละหน้ามีลิงก์ของตัวเอง
- Admins get a Workspace section in Settings with the Login page, AI answers (with the AI dataset counts) and Email templates. Old links to these pages still work.
  - th: แอดมินมีส่วน Workspace ในหน้าตั้งค่า รวม Login page, AI answers (พร้อมจำนวนข้อมูลชุด AI) และ Email templates ลิงก์เก่าไปหน้าเหล่านี้ยังใช้ได้

### Fixed
- "Manage in Settings" in feedback emails now opens your notification settings.
  - th: "Manage in Settings" ในอีเมลฟีดแบ็กเปิดไปที่การตั้งค่าการแจ้งเตือนของคุณแล้ว

## v0.1.26 — 2026-11-12

### New
- 8 built-in rule templates based on training research (weekly volume, effort, rep ranges and rest, frequency, double progression, exercise selection, warm-up order, short on time). Switch them on under Rules on a client's Generate page, or copy one to your library to edit it.
  - th: เทมเพลตกฎในตัว 8 แบบ อิงงานวิจัยด้านการฝึก (วอลุ่มต่อสัปดาห์, ความหนัก, ช่วงจำนวนครั้งและเวลาพัก, ความถี่, double progression, การเลือกท่า, ลำดับวอร์มอัพ, เวลาน้อย) เปิดใช้ได้ที่ Rules ในหน้า Generate ของเมมเบอร์ หรือคัดลอกไปไว้ในคลังของคุณเพื่อแก้ไข
- The Templates page is easier to browse: a searchable list on the left, and the chosen template opens on the right with its summary, evidence and exact text.
  - th: หน้า Templates ดูง่ายขึ้น: รายการค้นหาได้อยู่ด้านซ้าย เทมเพลตที่เลือกเปิดทางขวาพร้อมสรุป หลักฐานอ้างอิง และข้อความฉบับเต็ม

## v0.1.25 — 2026-11-12

### New
- Rearrange a draft by hand, in the chat pane and on the review page: the ⋯ menu on each exercise moves it up or down, puts it in a superset with the exercise above or below, takes it out of a superset, or moves it to another session. Select mode ticks several exercises and moves or supersets them together. Every edit can be undone.
  - th: จัดเรียงร่างเองได้ ทั้งในช่องแชตและหน้ารีวิว: เมนู ⋯ ของแต่ละท่าใช้เลื่อนขึ้นลง จับเป็นซูเปอร์เซตกับท่าด้านบนหรือด้านล่าง เอาออกจากซูเปอร์เซต หรือย้ายไปเซสชันอื่น โหมดเลือก (Select) ติ๊กหลายท่าแล้วย้ายหรือจับซูเปอร์เซตพร้อมกันได้ ทุกการแก้ไขกดย้อนกลับได้
- The AI knows about your hand edits: a short "Edited the draft by hand" line in the chat lists what you changed, and the AI keeps those changes unless you ask otherwise.
  - th: AI รู้ว่าคุณแก้อะไรเอง: บรรทัดสั้น ๆ "Edited the draft by hand" ในแชตจะบอกสิ่งที่คุณเปลี่ยน และ AI จะคงการเปลี่ยนแปลงนั้นไว้ เว้นแต่คุณสั่งเป็นอย่างอื่น
- Your exercise order sticks: once you edit a draft, it is no longer re-sorted by role, in later versions or after approving.
  - th: ลำดับท่าที่คุณจัดจะคงอยู่: เมื่อแก้ร่างแล้ว จะไม่ถูกเรียงใหม่ตามบทบาทอีก ทั้งในเวอร์ชันถัดไปและหลังอนุมัติ
- Back-to-back hand edits stay in one draft version, and the row of version buttons is now one compact picker that says who made each version (You or AI) and what changed.
  - th: การแก้ไขเองติด ๆ กันรวมอยู่ในร่างเวอร์ชันเดียว และแถวปุ่มเวอร์ชันกลายเป็นตัวเลือกกะทัดรัดอันเดียว บอกว่าใครทำแต่ละเวอร์ชัน (You หรือ AI) และเปลี่ยนอะไรไป
- Click your chosen 👍/👎 on an AI answer again to remove the rating.
  - th: คลิก 👍/👎 ที่เลือกไว้บนคำตอบของ AI ซ้ำเพื่อยกเลิกคะแนน

### Fixed
- When the AI rebuilds a draft, it now sees which exercises are in a superset, so supersets aren't lost.
  - th: เมื่อ AI สร้างร่างใหม่ จะเห็นแล้วว่าท่าไหนอยู่ในซูเปอร์เซต ซูเปอร์เซตจึงไม่หาย
- A change the AI proposed before your hand edit can no longer be built over that edit.
  - th: AI จะไม่เอาข้อเสนอที่ร่างไว้ก่อนคุณแก้เอง ไปสร้างทับการแก้ไขของคุณอีก

## v0.1.24 — 2026-11-11

### New
- AI answers to your feedback now show how confident the AI was (High or Medium).
  - th: คำตอบจาก AI ต่อฟีดแบ็กของคุณแสดงระดับความมั่นใจของ AI แล้ว (High หรือ Medium)
- Rate an AI answer with 👍 or 👎. On 👎 you can pick what was wrong and add a comment, and the AI takes another look.
  - th: ให้คะแนนคำตอบของ AI ด้วย 👍 หรือ 👎 ถ้ากด 👎 เลือกได้ว่าผิดตรงไหนและเพิ่มความเห็น แล้ว AI จะกลับไปดูอีกรอบ
- For admins: each AI answer shows the reporter's rating, and the feedback list shows the 👍/👎 tally for AI answers.
  - th: สำหรับแอดมิน: คำตอบ AI แต่ละอันแสดงคะแนนจากผู้แจ้ง และรายการฟีดแบ็กแสดงยอดรวม 👍/👎 ของคำตอบ AI

## v0.1.23 — 2026-11-11

### New
- Program sessions are easier to scan. Each session is its own card with a header band, exercise rows alternate shading, and a superset or circuit is one framed block with its rounds in the header. This applies on the client's program tab, the draft chat preview and the draft review.
  - th: เซสชันในโปรแกรมกวาดตาอ่านง่ายขึ้น แต่ละเซสชันเป็นการ์ดของตัวเองพร้อมแถบหัว แถวท่าสลับสีพื้น ซูเปอร์เซตหรือเซอร์กิตเป็นกรอบเดียวโดยมีจำนวนรอบอยู่ที่หัว ใช้กับแท็บโปรแกรมของเมมเบอร์ พรีวิวในแชตร่าง และหน้ารีวิวร่าง
- In the narrower chat preview, set chips stay on the same line as the exercise name when they fit.
  - th: ในพรีวิวแชตที่แคบกว่า ชิปเซตจะอยู่บรรทัดเดียวกับชื่อท่าถ้าพื้นที่พอ
- The clients list is redesigned: search by name or email, filter by status (Needs review, No program), sort by name, last trained or recently added, and page through long rosters.
  - th: ออกแบบรายชื่อเมมเบอร์ใหม่: ค้นหาด้วยชื่อหรืออีเมล กรองตามสถานะ (Needs review, No program) เรียงตามชื่อ วันที่ฝึกล่าสุด หรือที่เพิ่มล่าสุด และแบ่งหน้าเมื่อรายชื่อยาว
- Overview shows this training week as a day board.
  - th: หน้า Overview แสดงสัปดาห์การฝึกนี้เป็นกระดานรายวัน
- For admins: with "Auto-send confident" on, AI answers to feedback now go out on their own at medium confidence too, not only high.
  - th: สำหรับแอดมิน: เมื่อเปิด "Auto-send confident" คำตอบ AI ต่อฟีดแบ็กที่ความมั่นใจระดับ Medium จะส่งออกเองด้วย ไม่ใช่แค่ระดับ High

### Fixed
- Set chips no longer spill past the edge of a mid-width session card.
  - th: ชิปเซตไม่ล้นขอบการ์ดเซสชันขนาดกลางอีกแล้ว
- When you build a chat change that adds an exercise, it no longer lands in the middle of a superset and splits it in two.
  - th: เมื่อสร้างการเปลี่ยนแปลงจากแชตที่เพิ่มท่า ท่าใหม่จะไม่ไปแทรกกลางซูเปอร์เซตจนแยกเป็นสองชุดอีก
- A client's last session shows the right calendar day in the clients list.
  - th: เซสชันล่าสุดแสดงวันที่ถูกต้องในรายชื่อเมมเบอร์

## v0.1.22 — 2026-11-11

### New
- Duplicate feedback tickets: a ticket can be linked to an earlier one about the same thing. It shows "Duplicate of FB-nnn", and when the original is fixed or closed, its duplicates close with it and their reporters are told.
  - th: ตั๋วฟีดแบ็กซ้ำ: ตั๋วหนึ่งลิงก์กับตั๋วก่อนหน้าที่เป็นเรื่องเดียวกันได้ จะแสดง "Duplicate of FB-nnn" และเมื่อตั๋วต้นเรื่องถูกแก้หรือปิด ตั๋วที่ซ้ำจะปิดตามพร้อมแจ้งผู้แจ้งด้วย
- For admins: each ticket shows whether it's ready for an automatic fix, and links to the fix's pull request once one exists.
  - th: สำหรับแอดมิน: ตั๋วแต่ละใบบอกว่าพร้อมให้แก้อัตโนมัติหรือยัง และลิงก์ไปยัง pull request ของการแก้เมื่อมีแล้ว
- Feedback replies come faster: the agent now checks for new tickets every minute and only runs when there's something to answer.
  - th: ตอบฟีดแบ็กเร็วขึ้น: เอเจนต์ตรวจตั๋วใหม่ทุกนาที และทำงานเฉพาะเมื่อมีเรื่องให้ตอบ

### Fixed
- On phones, the mute bell stays on the ticket's header line.
  - th: บนมือถือ กระดิ่งปิดเสียงอยู่บนบรรทัดหัวของตั๋วตามเดิม

## v0.1.21 — 2026-11-11

### New
- After you save a log, a recap shows what was logged, plus a "Next" button to the next client still due today.
  - th: หลังบันทึกเซสชัน จะมีสรุปสิ่งที่บันทึก พร้อมปุ่ม "Next" ไปยังเมมเบอร์คนถัดไปที่ยังต้องฝึกวันนี้
- Exercise cards on the log sheet are tidier. Swap, Flag and Skip are now in a "More" menu, and "+ Set" stays visible.
  - th: การ์ดท่าในหน้าบันทึกเซสชันเป็นระเบียบขึ้น Swap, Flag และ Skip ย้ายไปอยู่ในเมนู "More" ส่วน "+ Set" ยังมองเห็นตลอด

### Fixed
- Tapping a suggested load like "→ 62.5" now explains where it comes from before you use it, including on phones.
  - th: แตะน้ำหนักที่แนะนำ เช่น "→ 62.5" จะอธิบายที่มาก่อนให้คุณใช้ รวมถึงบนมือถือด้วย

## v0.1.20 — 2026-11-11

### New
- Won't fix can carry a reason. It's posted as a reply, and the reporter's email quotes it, so they get one email.
  - th: Won't fix ใส่เหตุผลได้ เหตุผลจะโพสต์เป็นคำตอบ และอีเมลถึงผู้แจ้งจะยกข้อความนั้นมาด้วย ผู้แจ้งจึงได้อีเมลฉบับเดียว
- Feedback cards are calmer. The reply box opens from a Reply link, Accept is no longer green, and one "Show details" toggle covers the whole list.
  - th: การ์ดฟีดแบ็กดูสบายตาขึ้น ช่องตอบเปิดจากลิงก์ Reply ปุ่ม Accept ไม่เป็นสีเขียวแล้ว และมีปุ่ม "Show details" อันเดียวคุมทั้งรายการ
- Feedback cards show "Saved" on the triage note, show errors on the card itself, and show a spinner while busy. The pinned screenshot has a caption.
  - th: การ์ดฟีดแบ็กแสดง "Saved" ที่โน้ตคัดแยก แสดงข้อผิดพลาดบนการ์ดเลย และแสดงไอคอนหมุนระหว่างทำงาน ภาพหน้าจอที่ปักหมุดมีคำบรรยาย
- Training week: with more than eight clients, the on-track ones fold into one line. "Show all" brings them back.
  - th: Training week: ถ้ามีเมมเบอร์เกินแปดคน คนที่ตามแผนอยู่จะถูกพับเหลือบรรทัดเดียว กด "Show all" เพื่อแสดงทั้งหมด
- Training week: the counter colours each part on its own. Missed is red, to log is amber, and due today is neutral.
  - th: Training week: ตัวนับลงสีแยกแต่ละส่วน ที่พลาดเป็นสีแดง ที่ยังต้องบันทึกเป็นสีเหลืองอำพัน และที่ถึงกำหนดวันนี้เป็นสีกลาง ๆ
- Training week: "+n" appears when a day has more than three extra sessions, and the legend explains the marks. Partly done days get their own look, and narrow history shows week dates.
  - th: Training week: "+n" จะขึ้นเมื่อวันหนึ่งมีเซสชันเพิ่มเกินสาม และคำอธิบายสัญลักษณ์บอกความหมายของแต่ละเครื่องหมาย วันที่ทำไปบางส่วนมีหน้าตาของตัวเอง และประวัติแบบแคบแสดงวันที่ของสัปดาห์

### Fixed
- The triage note is now private. Reporters no longer see it.
  - th: โน้ตคัดแยกเป็นส่วนตัวแล้ว ผู้แจ้งมองไม่เห็นอีก
- Feedback cards are easier to use with a keyboard or screen reader: clearer focus rings, bigger click targets, a heading per card, and button names that include the ticket.
  - th: การ์ดฟีดแบ็กใช้กับคีย์บอร์ดหรือโปรแกรมอ่านหน้าจอได้ง่ายขึ้น: กรอบโฟกัสชัดขึ้น พื้นที่คลิกใหญ่ขึ้น มีหัวข้อทุกการ์ด และชื่อปุ่มระบุตั๋ว
- Week cells showing "+n" no longer overflow.
  - th: ช่องสัปดาห์ที่แสดง "+n" ไม่ล้นอีกแล้ว

## v0.1.19 — 2026-11-11

### New
- Feedback tickets close themselves when their fix goes live. The ticket shows "Release marked it Done" with the version, and the reporter is told to reload.
  - th: ตั๋วฟีดแบ็กปิดเองเมื่อการแก้ไขขึ้นระบบจริง ตั๋วจะแสดง "Release marked it Done" พร้อมเลขเวอร์ชัน และแจ้งผู้แจ้งให้รีโหลด
- Training week on a Monday: last week's missed and not-yet-logged sessions still count in the counter and row order, shown as e.g. "3 from last week".
  - th: Training week ในวันจันทร์: เซสชันที่พลาดหรือยังไม่บันทึกของสัปดาห์ก่อนยังนับในตัวนับและลำดับแถว แสดงเป็น เช่น "3 from last week"

### Fixed
- Training week: missed sessions now stand out the most, with a strong red border and bold label. Done sessions are a quiet green tint.
  - th: Training week: เซสชันที่พลาดเด่นที่สุดแล้ว ด้วยขอบแดงเข้มและป้ายตัวหนา ส่วนเซสชันที่เสร็จแล้วเป็นสีเขียวอ่อน ๆ
- Better contrast for due-today text and the red counter in the dimmed dark theme.
  - th: ข้อความ "ถึงกำหนดวันนี้" และตัวนับสีแดงในธีมมืดแบบหรี่ มีคอนทราสต์ดีขึ้น

## v0.1.18 — 2026-11-10

### New
- Edit your feedback tickets after sending them: change the text or the images. The ticket shows when it was edited, and the other side sees the edit as unread.
  - th: แก้ไขตั๋วฟีดแบ็กหลังส่งได้: เปลี่ยนข้อความหรือรูปภาพ ตั๋วจะบอกเวลาที่แก้ และอีกฝ่ายจะเห็นการแก้ไขเป็นยังไม่ได้อ่าน
- Training week: a session now gets two days' grace before it counts as missed. Until then it shows in amber as "not logged yet".
  - th: Training week: เซสชันมีเวลาผ่อนผันสองวันก่อนนับว่าพลาด ระหว่างนั้นจะแสดงเป็นสีเหลืองอำพันว่า "not logged yet"
- Training week: the counter counts days and changes colour as the week runs out. Idle clients are listed as links, each with the reason it's idle.
  - th: Training week: ตัวนับนับเป็นวันและเปลี่ยนสีเมื่อสัปดาห์ใกล้หมด เมมเบอร์ที่ไม่มีความเคลื่อนไหวแสดงเป็นลิงก์ พร้อมเหตุผลของแต่ละคน
- Training week: today's column is highlighted, and the legend only lists the states you can see.
  - th: Training week: ไฮไลต์คอลัมน์วันนี้ และคำอธิบายสัญลักษณ์แสดงเฉพาะสถานะที่มองเห็นอยู่
- Logging "as prescribed" now shows every set it will save before you confirm. Sets you typed yourself are in bold.
  - th: การบันทึกแบบ "as prescribed" แสดงทุกเซตที่จะบันทึกก่อนให้คุณยืนยัน เซตที่คุณพิมพ์เองเป็นตัวหนา
- Saving a log is confirmed in the save bar.
  - th: แถบบันทึกยืนยันให้เห็นเมื่อบันทึกเซสชันสำเร็จ

### Fixed
- Week grid cells are all the same height, tags stay within two lines at any width, and extra sessions are marked by type. Cardio shows its unit.
  - th: ช่องตารางสัปดาห์สูงเท่ากันหมด แท็กอยู่ภายในสองบรรทัดทุกความกว้าง และเซสชันเพิ่มมีเครื่องหมายบอกประเภท คาร์ดิโอแสดงหน่วยด้วย
- On narrow screens the week grid keeps the latest history weeks and gives the legend its own line.
  - th: บนจอแคบ ตารางสัปดาห์เก็บประวัติสัปดาห์ล่าสุดไว้ และให้คำอธิบายสัญลักษณ์อยู่บรรทัดของตัวเอง
- Better contrast for amber warnings in dark mode and for planned history squares.
  - th: คำเตือนสีเหลืองอำพันในโหมดมืด และช่องประวัติที่วางแผนไว้ มีคอนทราสต์ดีขึ้น
- The Feedback button sits in the log sheet's save bar instead of covering the sets.
  - th: ปุ่ม Feedback ย้ายไปอยู่ในแถบบันทึกของหน้าบันทึกเซสชัน ไม่บังเซตอีก
- The image tray shows a clearer upload count and whole-image thumbnails.
  - th: ถาดรูปภาพแสดงจำนวนที่อัปโหลดชัดขึ้น และภาพย่อแสดงเต็มรูป
- The sidebar scrollbar only shows when you hover over it.
  - th: แถบเลื่อนของแถบด้านข้างแสดงเฉพาะเมื่อเอาเมาส์ไปวาง

## v0.1.17 — 2026-11-10

### New
- Attach images to feedback tickets and replies. Pick or paste them, and they're shrunk before upload. Click any image to view it full size.
  - th: แนบรูปในตั๋วฟีดแบ็กและคำตอบได้ เลือกไฟล์หรือวางรูป ระบบจะย่อขนาดก่อนอัปโหลด คลิกรูปเพื่อดูขนาดเต็ม
- The log sheet on a phone folds the session pickers and readiness away, so the sets come first.
  - th: หน้าบันทึกเซสชันบนมือถือพับตัวเลือกเซสชันและความพร้อมเก็บไว้ ให้เซตขึ้นมาก่อน

### Fixed
- Progression scheme sources are corrected and checked. Every citation now has its journal, volume and pages. Where a preset rests on coaching practice rather than a study, it now says so.
  - th: แหล่งอ้างอิงของ Progression scheme ได้รับการแก้และตรวจสอบแล้ว ทุกการอ้างอิงมีชื่อวารสาร ฉบับ และหน้า ถ้าพรีเซ็ตไหนอิงประสบการณ์การโค้ชมากกว่างานวิจัย ก็จะบอกไว้
- The log sheet switches to its narrow layout based on its own width, not the window's.
  - th: หน้าบันทึกเซสชันเปลี่ยนเป็นเลย์เอาต์แคบตามความกว้างของตัวเอง ไม่ใช่ของหน้าต่าง
- Save becomes the main button on the log sheet once you've entered something.
  - th: ปุ่ม Save กลายเป็นปุ่มหลักในหน้าบันทึกเซสชันเมื่อคุณกรอกข้อมูลแล้ว

## v0.1.16 — 2026-11-10

### New
- Progression schemes: 7 built-in presets backed by training research. They cover linear strength 3:1, block, hypertrophy volume ramp, weekly undulating, peak & taper, novice linear and return to training. Each one has real week-by-week numbers, a short "why" and its sources.
  - th: Progression schemes: พรีเซ็ตในตัว 7 แบบที่มีงานวิจัยรองรับ ได้แก่ linear strength 3:1, block, hypertrophy volume ramp, weekly undulating, peak & taper, novice linear และ return to training แต่ละแบบมีตัวเลขจริงรายสัปดาห์ เหตุผลสั้น ๆ และแหล่งอ้างอิง
- A new Progression schemes page in the Library. Duplicate a preset to make it your own, hide the ones you don't use, and create, edit or delete your own schemes. Each week can have a target, a progression rule and a note.
  - th: หน้า Progression schemes ใหม่ใน Library คัดลอกพรีเซ็ตมาปรับเป็นของคุณ ซ่อนอันที่ไม่ใช้ และสร้าง แก้ไข หรือลบ scheme ของคุณเองได้ แต่ละสัปดาห์มีเป้าหมาย กฎ progression และโน้ตได้
- The new-program page lists presets and your schemes in one dropdown. Picking one fills in the block's phases.
  - th: หน้าสร้างโปรแกรมใหม่รวมพรีเซ็ตและ scheme ของคุณไว้ในดรอปดาวน์เดียว เลือกแล้วจะเติมเฟสของบล็อกให้
- Loading screens now show the shape of the page while it loads.
  - th: หน้าจอโหลดแสดงโครงหน้าระหว่างรอโหลด
- Feedback tickets keep their details behind a Details toggle that remembers your choice.
  - th: ตั๋วฟีดแบ็กเก็บรายละเอียดไว้หลังปุ่ม Details ซึ่งจำการเลือกของคุณไว้

### Fixed
- Feedback ticket pages that can no longer be opened now show as plain text instead of a broken link.
  - th: หน้าในตั๋วฟีดแบ็กที่เปิดไม่ได้แล้วแสดงเป็นข้อความธรรมดา แทนลิงก์เสีย

## v0.1.15 — 2026-11-10

### New
- Supersets and circuits. In the program editor, click "Superset with next" to pair exercises. They show as A1/A2 with one rounds count for the group. Change it once and every exercise in the group follows.
  - th: ซูเปอร์เซตและเซอร์กิต ในตัวแก้ไขโปรแกรม คลิก "Superset with next" เพื่อจับคู่ท่า จะแสดงเป็น A1/A2 โดยมีจำนวนรอบเดียวสำหรับทั้งกลุ่ม เปลี่ยนครั้งเดียว ทุกท่าในกลุ่มเปลี่ยนตาม
- Supersets show as a group on the program page, client page and AI draft review.
  - th: ซูเปอร์เซตแสดงเป็นกลุ่มในหน้าโปรแกรม หน้าเมมเบอร์ และหน้ารีวิวร่างจาก AI
- Logging a superset goes round by round on one card: A1, A2, then the next round. Enter moves in the same order.
  - th: บันทึกซูเปอร์เซตทีละรอบในการ์ดเดียว: A1, A2 แล้วรอบถัดไป ปุ่ม Enter เลื่อนตามลำดับเดียวกัน
- Pasted notes with "Superset x 3 sets" or A1/A2 labels now come in as real supersets.
  - th: โน้ตที่วางซึ่งมี "Superset x 3 sets" หรือป้าย A1/A2 จะเข้ามาเป็นซูเปอร์เซตจริง
- AI-written programs can include supersets.
  - th: โปรแกรมที่ AI เขียนมีซูเปอร์เซตได้
- The feedback mute toggle uses bell icons.
  - th: ปุ่มปิดเสียงฟีดแบ็กใช้ไอคอนกระดิ่ง

### Fixed
- A program you build by hand now saves in the order you built it, instead of being re-sorted by exercise label.
  - th: โปรแกรมที่สร้างเองบันทึกตามลำดับที่คุณจัด ไม่ถูกเรียงใหม่ตามป้ายท่า

## v0.1.14 — 2026-11-10

### New
- On a feedback ticket, "Show me" opens the screenshot when the page can't be opened or the element can't be found, and screenshots open full size.
  - th: ในตั๋วฟีดแบ็ก "Show me" จะเปิดภาพหน้าจอแทนเมื่อเปิดหน้านั้นไม่ได้หรือหาองค์ประกอบไม่เจอ และภาพหน้าจอเปิดขนาดเต็ม
- Pasted programs with suggested exercise matches show "Did you mean …" buttons. Tap one to pick it, and it's remembered for next time.
  - th: โปรแกรมที่วางซึ่งมีท่าที่ระบบเดาว่าตรงกัน จะแสดงปุ่ม "Did you mean …" แตะเพื่อเลือก แล้วระบบจะจำไว้ใช้ครั้งหน้า

### Fixed
- Supersets and circuits from a pasted program keep their pairs together. Exercises stay in the pasted order instead of being re-sorted by role.
  - th: ซูเปอร์เซตและเซอร์กิตจากโปรแกรมที่วางยังจับคู่กันเหมือนเดิม ท่าเรียงตามที่วาง ไม่ถูกเรียงใหม่ตามบทบาท
- A header like "Superset x 3 sets" now gives each exercise under it 3 sets.
  - th: หัวข้ออย่าง "Superset x 3 sets" ให้ทุกท่าที่อยู่ใต้หัวข้อได้ 3 เซต
- A pasted exercise is no longer swapped for a look-alike (e.g. "Single leg throwball" became "Single-Leg Hop"). Unsure matches are only suggested, and only matches you pick are remembered.
  - th: ท่าที่วางไม่ถูกสลับเป็นท่าที่ชื่อคล้ายกันอีก (เช่น "Single leg throwball" กลายเป็น "Single-Leg Hop") ท่าที่ไม่แน่ใจจะเป็นแค่คำแนะนำ และจะจำเฉพาะท่าที่คุณเลือก
- A client page that can't load now says so instead of loading forever.
  - th: หน้าเมมเบอร์ที่โหลดไม่ได้จะแจ้งให้ทราบ ไม่โหลดค้างไปเรื่อย ๆ

## v0.1.13 — 2026-11-10

### New
- Feedback replies can now come from an AI assistant, marked with an "AI answer" badge. It answers questions it can check against the app, like "this already exists" or "this was added after you reported it". Reply on the ticket if the answer is wrong.
  - th: คำตอบฟีดแบ็กอาจมาจากผู้ช่วย AI โดยมีป้าย "AI answer" กำกับ AI จะตอบเรื่องที่ตรวจสอบกับแอปได้ เช่น "มีฟีเจอร์นี้อยู่แล้ว" หรือ "เพิ่มเข้ามาหลังจากคุณแจ้ง" ถ้าคำตอบผิด ตอบกลับในตั๋วได้เลย
- Feedback replies show formatting such as **bold** text and lists.
  - th: คำตอบฟีดแบ็กแสดงการจัดรูปแบบ เช่น ตัว**หนา**และรายการ
- On phones the sidebar is replaced by a slim icon rail that stays put.
  - th: บนมือถือ แถบด้านข้างเปลี่ยนเป็นแถบไอคอนบาง ๆ ที่อยู่กับที่

### Fixed
- Tapping Save session more than once no longer creates duplicate logs of the same session. Replacing an earlier log can be undone.
  - th: แตะ Save session หลายครั้งจะไม่สร้างบันทึกซ้ำของเซสชันเดียวกันอีก การแทนที่บันทึกเดิมกดย้อนกลับได้
- The feedback button no longer covers the pain warning.
  - th: ปุ่มฟีดแบ็กไม่บังคำเตือนอาการเจ็บอีก
- Flag and skip-reason chips are easier to tap on phones.
  - th: ชิป Flag และเหตุผลการข้ามแตะง่ายขึ้นบนมือถือ

## v0.1.12 — 2026-11-10

### New
- Readiness and flags on the log sheet: record how the client slept and how sore they are, and flag any exercise for pain or technique, or mark it skipped with a reason. Both show on the client's History.
  - th: ความพร้อมและการแจ้งปัญหาในหน้าบันทึกเซสชัน: บันทึกว่าเมมเบอร์นอนเป็นอย่างไรและปวดเมื่อยแค่ไหน แจ้งปัญหาของท่าใดก็ได้ว่าเจ็บหรือเรื่องเทคนิค หรือทำเครื่องหมายว่าข้ามพร้อมเหตุผล ทั้งหมดแสดงใน History ของเมมเบอร์
- A pain flag (or a skip because of pain) raises a "pain flag" alert for 14 days, so you check in before loading that exercise again. AI drafts see readiness and flags from recent sessions.
  - th: การแจ้งว่าเจ็บ (หรือข้ามเพราะเจ็บ) จะขึ้นการเตือน "pain flag" นาน 14 วัน ให้คุณถามอาการก่อนเพิ่มน้ำหนักท่านั้นอีก ร่างจาก AI เห็นความพร้อมและการแจ้งเตือนจากเซสชันล่าสุดด้วย

### Fixed
- Session reasoning shows in the right "Why this session" panel in draft review.
  - th: เหตุผลของเซสชันแสดงในแผง "Why this session" ที่ถูกต้องในหน้ารีวิวร่าง
- While a draft is generating, the timer sits next to the title.
  - th: ระหว่างสร้างร่าง ตัวจับเวลาอยู่ข้างชื่อเรื่อง
- The flag menu's Done button is easier to tap on phones.
  - th: ปุ่ม Done ในเมนู Flag แตะง่ายขึ้นบนมือถือ

## v0.1.11 — 2026-11-10

### New
- Logging a session is faster: fill a value down the column, press Enter to move to the next cell, skip an exercise, and keep the Save button in view. Picking a date picks the session scheduled for it.
  - th: บันทึกเซสชันได้เร็วขึ้น: เติมค่าลงทั้งคอลัมน์ กด Enter ไปช่องถัดไป ข้ามท่า และปุ่ม Save อยู่ในสายตาตลอด เลือกวันที่แล้วจะเลือกเซสชันที่นัดไว้วันนั้นให้
- Logging is safer: sessions already logged that day show up, and you're asked before logging a duplicate. You get a summary to confirm, Undo after saving, a warning before leaving with unsaved sets, and drafts that survive a reload.
  - th: บันทึกได้ปลอดภัยขึ้น: แสดงเซสชันที่บันทึกแล้วในวันนั้น และถามก่อนบันทึกซ้ำ มีสรุปให้ยืนยัน กด Undo ได้หลังบันทึก มีคำเตือนก่อนออกจากหน้าโดยยังไม่บันทึกเซต และร่างยังอยู่แม้รีโหลดหน้า
- Suggested loads on the log sheet. RPE-only sets suggest a kg from the client's recent lifts, every set shows its e1RM with a PR badge, and off-target RPE is flagged. Remaining sets adjust after a set that ran hot or easy, and back-offs follow today's top set.
  - th: น้ำหนักแนะนำในหน้าบันทึกเซสชัน เซตที่กำหนดแค่ RPE จะแนะนำน้ำหนัก (kg) จากการยกล่าสุดของเมมเบอร์ ทุกเซตแสดง e1RM พร้อมป้าย PR และเตือนเมื่อ RPE ไม่ตรงเป้า เซตที่เหลือปรับตามเมื่อเซตก่อนหนักหรือเบากว่าที่คาด และเซต back-off อิงจาก top set ของวันนี้
- Deload rules: set your default deload in Settings, override it per client, and the Deload button and AI drafts follow it.
  - th: กฎดีโหลด: ตั้งค่าดีโหลดเริ่มต้นใน Settings ปรับแยกรายเมมเบอร์ได้ และปุ่ม Deload กับร่างจาก AI จะทำตามกฎนี้
- The training week on the dashboard is a grid with six weeks of history per client. Clients who need attention are listed first, and tapping a day opens the logger on that session.
  - th: สัปดาห์การฝึกในแดชบอร์ดเป็นตารางที่มีประวัติหกสัปดาห์ต่อเมมเบอร์ เมมเบอร์ที่ต้องดูแลขึ้นก่อน และแตะที่วันจะเปิดหน้าบันทึกของเซสชันนั้น
- Session cards line up sets, reps, load and effort in columns, group top sets and back-offs, and include a notation key.
  - th: การ์ดเซสชันจัดเซต จำนวนครั้ง น้ำหนัก และความหนักเป็นคอลัมน์ จัดกลุ่ม top set กับ back-off และมีคำอธิบายสัญลักษณ์
- Colour themes: pick a palette for light and dark mode, including high contrast, colourblind-friendly, paper and dimmed.
  - th: ธีมสี: เลือกชุดสีสำหรับโหมดสว่างและโหมดมืด มีทั้งคอนทราสต์สูง เป็นมิตรกับคนตาบอดสี แบบกระดาษ และแบบหรี่

### Fixed
- Sidebar and account menu alignment tidied up.
  - th: จัดแนวแถบด้านข้างและเมนูบัญชีให้เรียบร้อย
- Session balance counts isolation and carry sets.
  - th: สมดุลเซสชันนับเซต isolation และ carry ด้วย
- Empty reasoning panels no longer show in draft review.
  - th: แผงเหตุผลที่ว่างเปล่าไม่แสดงในหน้ารีวิวร่างอีก
- "Week 1" is no longer cut off in the deload settings.
  - th: "Week 1" ไม่ถูกตัดในการตั้งค่าดีโหลดอีก

## v0.1.10 — 2026-11-09

### New
- New client form follows the intake conversation: goals and limitations come first, 1RMs can wait for the first week, and the Add bar stays on screen. "Add & generate program" takes you straight to drafting their first programme.
  - th: ฟอร์มเพิ่มเมมเบอร์ใหม่เรียงตามลำดับการพูดคุยครั้งแรก: เป้าหมายและข้อจำกัดมาก่อน 1RM รอไว้กรอกสัปดาห์แรกได้ และแถบ Add อยู่บนจอตลอด "Add & generate program" พาไปร่างโปรแกรมแรกได้ทันที
- Training days are now one row of day chips that fits a phone. Cardio days, the long-session day and the weekly cardio target sit under one Cardio switch, with a one-line summary of the week.
  - th: วันฝึกเป็นชิปวันแถวเดียวที่พอดีจอมือถือ วันคาร์ดิโอ วันเซสชันยาว และเป้าคาร์ดิโอรายสัปดาห์อยู่ใต้สวิตช์ Cardio อันเดียว พร้อมสรุปสัปดาห์ในบรรทัดเดียว
- Client settings are grouped into clear boxes, with a save bar that follows you down the page, a Discard button and ⌘S.
  - th: การตั้งค่าเมมเบอร์จัดเป็นกล่องชัดเจน มีแถบบันทึกที่เลื่อนตามลงไป ปุ่ม Discard และ ⌘S
- The History tab shows lift trends with e1RM charts, an 8-week / 6-month / all-time range switch and sessions grouped by week.
  - th: แท็บ History แสดงแนวโน้มการยกด้วยกราฟ e1RM สลับช่วง 8 สัปดาห์ / 6 เดือน / ทั้งหมดได้ และจัดกลุ่มเซสชันตามสัปดาห์
- The programme page shows the sets logged under each session.
  - th: หน้าโปรแกรมแสดงเซตที่บันทึกไว้ใต้แต่ละเซสชัน
- A What's new page, with a dot on the version number when there's a new release.
  - th: หน้า What's new พร้อมจุดบนเลขเวอร์ชันเมื่อมีรุ่นใหม่
- A refreshed sidebar: account menu at the bottom, tooltips on the collapsed rail, and ⌘B to toggle it.
  - th: แถบด้านข้างโฉมใหม่: เมนูบัญชีอยู่ด้านล่าง มีคำอธิบายเมื่อชี้บนแถบที่ย่อไว้ และกด ⌘B เพื่อเปิด/ปิด

### Fixed
- AI drafts that hit the length limit say so instead of retrying in vain.
  - th: ร่างจาก AI ที่ยาวเกินขีดจำกัดจะแจ้งให้ทราบ ไม่ลองซ้ำไปเปล่า ๆ
- The all-clients list and admin client page fit narrow screens, and long cardio lines wrap on session cards.
  - th: รายชื่อเมมเบอร์ทั้งหมดและหน้าเมมเบอร์ของแอดมินพอดีจอแคบ และบรรทัดคาร์ดิโอยาว ๆ ตัดขึ้นบรรทัดใหม่ในการ์ดเซสชัน
- The name error on a new client only shows after you've typed and left the field, or pressed Add.
  - th: ข้อผิดพลาดเรื่องชื่อของเมมเบอร์ใหม่แสดงหลังจากคุณพิมพ์แล้วออกจากช่อง หรือกด Add เท่านั้น

## v0.1.9 — 2026-11-09

### New
- Paste a client's training history from your notes and save it as past programmes and session logs — with undo.
  - th: วางประวัติการฝึกของเมมเบอร์จากโน้ต แล้วบันทึกเป็นโปรแกรมเก่าและบันทึกเซสชันได้ และกดย้อนกลับได้
- Admins can open any client read-only and see their active programme and this week.
  - th: แอดมินเปิดดูเมมเบอร์คนใดก็ได้แบบอ่านอย่างเดียว เห็นโปรแกรมที่ใช้อยู่และสัปดาห์นี้
- The all-clients list shows each client's programme and links straight to them.
  - th: รายชื่อเมมเบอร์ทั้งหมดแสดงโปรแกรมของแต่ละคน และลิงก์ไปหาเมมเบอร์ได้ทันที

### Fixed
- Deload weeks now lower the load index the way the deload rule says.
  - th: สัปดาห์ดีโหลดลดดัชนีน้ำหนักตามที่กฎดีโหลดกำหนดแล้ว
- Client dates in the admin directory show as calendar days, so the list loads.
  - th: วันที่ของเมมเบอร์ในไดเรกทอรีของแอดมินแสดงเป็นวันตามปฏิทิน รายการจึงโหลดได้

## v0.1.8 — 2026-11-09

### New
- Admins get an all-clients page in the sidebar, and each trainer's client count links to their clients.
  - th: แอดมินมีหน้ารวมเมมเบอร์ทั้งหมดในแถบด้านข้าง และจำนวนเมมเบอร์ของเทรนเนอร์แต่ละคนลิงก์ไปยังเมมเบอร์ของคนนั้น

## v0.1.7 — 2026-11-09

### New
- A Vocabulary page for your exercise aliases, glossary and role labels.
  - th: หน้า Vocabulary สำหรับชื่อเรียกอื่นของท่า อภิธานศัพท์ และป้ายบทบาท
- Pasted notes are read in your own shorthand, keeping loads, cues and circuit headers; new words from an import can be added to your glossary.
  - th: ระบบอ่านโน้ตที่วางตามชวเลขของคุณเอง และเก็บน้ำหนัก คิว กับหัวข้อเซอร์กิตไว้ คำใหม่จากการนำเข้าเพิ่มลงอภิธานศัพท์ได้
- Your personal exercise aliases are matched before the shared ones.
  - th: ระบบจับคู่ชื่อเรียกท่าส่วนตัวของคุณก่อนชื่อที่ใช้ร่วมกัน

### Fixed
- Example programmes are picked on the client's goal, level and training days.
  - th: โปรแกรมตัวอย่างเลือกตามเป้าหมาย ระดับ และวันฝึกของเมมเบอร์
- Pattern balance counts hard sets.
  - th: Pattern balance นับเฉพาะ hard set
- Leaving a programme with unsaved edits asks before closing, and discarding edits resets the phasing editor.
  - th: ออกจากโปรแกรมที่ยังไม่บันทึกการแก้ไขจะถามก่อนปิด และการทิ้งการแก้ไขจะรีเซ็ตตัวแก้ไขเฟสด้วย

## v0.1.6 — 2026-11-08

### New
- Paste a programme from your notes on the new-programme page; exercises are matched to your catalog with a suggested role.
  - th: วางโปรแกรมจากโน้ตในหน้าสร้างโปรแกรมใหม่ได้ ระบบจับคู่ท่ากับคลังท่าของคุณ พร้อมแนะนำบทบาทให้
- Name your own exercise roles and rank them — drafts and new programmes order exercises by your ranks.
  - th: ตั้งชื่อบทบาทของท่าเองและจัดอันดับได้ ร่างและโปรแกรมใหม่จะเรียงท่าตามอันดับของคุณ
- Client basics: phone, experience, age, sex and size, plus 1RMs when you add a client. The AI takes them into account.
  - th: ข้อมูลพื้นฐานของเมมเบอร์: เบอร์โทร ประสบการณ์ อายุ เพศ และขนาดร่างกาย รวมถึง 1RM ตอนเพิ่มเมมเบอร์ AI นำข้อมูลเหล่านี้มาพิจารณาด้วย
- Edit progression rules in the draft block plan editor.
  - th: แก้ไขกฎ progression ได้ในตัวแก้ไขแผนบล็อกของร่าง

### Fixed
- Pressing deload a second time undoes it instead of deloading twice.
  - th: กดดีโหลดครั้งที่สองจะยกเลิกดีโหลด ไม่ดีโหลดซ้ำสองรอบ
- Stalls compare %1RM prescriptions correctly.
  - th: การตรวจ stall เปรียบเทียบโปรแกรมแบบ %1RM ได้ถูกต้อง
- Holds swapped into a timed slot are read as seconds.
  - th: ท่าค้างที่สลับเข้าช่องแบบจับเวลาถูกอ่านเป็นวินาที
- Moving a session to another weekday shows up in the programme changes.
  - th: การย้ายเซสชันไปวันอื่นแสดงในรายการเปลี่ยนแปลงของโปรแกรม

## v0.1.5 — 2026-11-08

- Maintenance and reliability updates.
  - th: ปรับปรุงการดูแลระบบและความเสถียร

## v0.1.4 — 2026-11-08

### New
- Prescribe sets as %1RM, RPE ranges, RIR, tempo or AMRAP with a stop RPE; loads resolve from each client's 1RMs.
  - th: กำหนดเซตเป็น %1RM, ช่วง RPE, RIR, tempo หรือ AMRAP พร้อม RPE ที่ให้หยุดได้ น้ำหนักคำนวณจาก 1RM ของเมมเบอร์แต่ละคน
- Set per-week progression rules and preview them before applying.
  - th: ตั้งกฎ progression รายสัปดาห์ และดูตัวอย่างก่อนใช้จริงได้
- Client run days and long-run day: cardio is placed around key runs and heavy lower days, and the AI suggests weekdays that follow the same rules.
  - th: วันวิ่งและวันวิ่งยาวของเมมเบอร์: คาร์ดิโอจัดรอบ ๆ การวิ่งสำคัญและวันขาหนัก และ AI แนะนำวันในสัปดาห์ตามกฎเดียวกัน
- Client email is now optional, and a half-filled new-client form is kept if you leave the page.
  - th: อีเมลเมมเบอร์ไม่บังคับแล้ว และฟอร์มเพิ่มเมมเบอร์ที่กรอกค้างไว้จะยังอยู่ถ้าคุณออกจากหน้า
- Updated movement patterns and muscle groups, with kinetic-chain defaults rebuilt on the sling model.
  - th: อัปเดต movement pattern และกลุ่มกล้ามเนื้อ พร้อมค่าเริ่มต้นของ kinetic chain ที่สร้างใหม่ตาม sling model
- The theme picker moved into Settings, and the sidebar opens and closes smoothly.
  - th: ตัวเลือกธีมย้ายไปอยู่ใน Settings และแถบด้านข้างเปิดปิดได้ลื่นไหล

### Fixed
- Deload weeks are described and applied the same way everywhere.
  - th: สัปดาห์ดีโหลดอธิบายและใช้งานเหมือนกันทุกที่
- 1RM dates no longer shift when you save again.
  - th: วันที่ของ 1RM ไม่เลื่อนอีกเมื่อบันทึกซ้ำ
- Chain counts are labelled as sets touching each chain, not a balance score.
  - th: ตัวเลขของ chain ระบุว่าเป็นจำนวนเซตที่เกี่ยวกับแต่ละ chain ไม่ใช่คะแนนความสมดุล

## v0.1.3 — 2026-11-08

### New
- Phone-friendly session logger: skip a set, add an extra set, swap an exercise and see last time's numbers per slot.
  - th: หน้าบันทึกเซสชันที่ใช้บนมือถือได้สะดวก: ข้ามเซต เพิ่มเซต สลับท่า และดูตัวเลขครั้งก่อนของแต่ละช่อง
- Tap a block pulse cell to see the sets behind it and the top lift.
  - th: แตะช่องใน Block pulse เพื่อดูเซตที่อยู่เบื้องหลังและการยกที่ดีที่สุด
- The AI cites each client's dated training log when it drafts and answers questions.
  - th: AI อ้างอิงบันทึกการฝึกพร้อมวันที่ของเมมเบอร์แต่ละคนเมื่อร่างโปรแกรมและตอบคำถาม
- Coaching rules: leave a note on a draft or chat reply, and confirmed rules are applied in every future draft.
  - th: กฎการโค้ช: เขียนโน้ตไว้ที่ร่างหรือคำตอบในแชต กฎที่ยืนยันแล้วจะถูกใช้ในทุกร่างต่อจากนี้
- Chat proposals can change cardio sessions, and a built draft keeps only the proposed changes, listing what stayed as before.
  - th: ข้อเสนอจากแชตเปลี่ยนเซสชันคาร์ดิโอได้ และร่างที่สร้างแล้วจะเปลี่ยนเฉพาะสิ่งที่เสนอ พร้อมบอกว่าอะไรคงเดิม
- A fuller draft diff covering rep ranges, loads, sessions, cardio and the block plan.
  - th: การเปรียบเทียบร่างที่ครบขึ้น ครอบคลุมช่วงจำนวนครั้ง น้ำหนัก เซสชัน คาร์ดิโอ และแผนบล็อก
- DeepSeek Flash is the default model.
  - th: DeepSeek Flash เป็นโมเดลเริ่มต้น

### Fixed
- Signals are fairer: cardio behind, adherence, RPE creep and stall are judged by block week and pro-rated from the start date.
  - th: สัญญาณเตือนยุติธรรมขึ้น: คาร์ดิโอตามหลัง การทำตามแผน RPE creep และ stall ตัดสินตามสัปดาห์ของบล็อก และคิดตามสัดส่วนนับจากวันเริ่ม
- Signals show on a client's page even without a programme.
  - th: สัญญาณเตือนแสดงในหน้าเมมเบอร์แม้ยังไม่มีโปรแกรม
- Block pulse counts back-off sets and keeps timed holds out of tonnage and e1RM.
  - th: Block pulse นับเซต back-off และไม่นำท่าค้างแบบจับเวลาไปคิดในน้ำหนักรวมและ e1RM
- Today's date and the log window use your local calendar day.
  - th: วันที่วันนี้และช่วงเวลาบันทึกใช้วันตามปฏิทินท้องถิ่นของคุณ
- Thai text uses a matching typeface.
  - th: ข้อความภาษาไทยใช้ฟอนต์ที่เข้าชุดกัน

## v0.1.2 — 2026-11-07

### New
- Dark theme, with a system / light / dark switch.
  - th: ธีมมืด พร้อมสวิตช์ system / light / dark
- Thumbs up or down, reasons and notes on AI replies, drafts and messages.
  - th: กดถูกใจหรือไม่ถูกใจ พร้อมเหตุผลและโน้ต บนคำตอบ ร่าง และข้อความจาก AI
- Email preferences in Settings, with one-click unsubscribe.
  - th: ตั้งค่าอีเมลใน Settings พร้อมยกเลิกการรับอีเมลในคลิกเดียว

### Fixed
- Programme rows fit narrow columns beside the sidebar.
  - th: แถวโปรแกรมพอดีกับคอลัมน์แคบข้างแถบด้านข้าง

## v0.1.1 — 2026-11-07

### New
- The client chat keeps unsent text and your last model choice; Return adds a line and Cmd/Ctrl+Return sends.
  - th: แชตเมมเบอร์เก็บข้อความที่ยังไม่ส่งและโมเดลที่เลือกล่าสุดไว้ Return ขึ้นบรรทัดใหม่ และ Cmd/Ctrl+Return ส่งข้อความ
- Collapse the sidebar to an icon rail.
  - th: ย่อแถบด้านข้างเหลือแถบไอคอนได้
- Settings › About shows the app and server versions.
  - th: Settings › About แสดงเวอร์ชันของแอปและเซิร์ฟเวอร์

### Fixed
- The model picker closes when you tap outside it.
  - th: ตัวเลือกโมเดลปิดเมื่อแตะด้านนอก
- The chat composer fits the narrow draft column.
  - th: ช่องพิมพ์แชตพอดีกับคอลัมน์ร่างที่แคบ

## v0.1.0 — 2026-11-07

### New
- First release.
  - th: รุ่นแรก
- Clients with a training schedule, cardio target and coaching context.
  - th: เมมเบอร์พร้อมตารางฝึก เป้าคาร์ดิโอ และบริบทการโค้ช
- Programme builder: week-by-week lifting and cardio sessions, phasing (base, volume, intensity, deload, transition) and weekly targets.
  - th: ตัวสร้างโปรแกรม: เซสชันเวทและคาร์ดิโอรายสัปดาห์ การแบ่งเฟส (base, volume, intensity, deload, transition) และเป้าหมายรายสัปดาห์
- AI drafts the next block with its reasoning and a diff against the current one — nothing goes live until you approve and activate it.
  - th: AI ร่างบล็อกถัดไปพร้อมเหตุผลและการเปรียบเทียบกับบล็อกปัจจุบัน ไม่มีอะไรใช้งานจริงจนกว่าคุณจะอนุมัติและเปิดใช้
- Revise a draft with your feedback, or ask the client chat to propose changes beside a live preview.
  - th: แก้ร่างตามความเห็นของคุณ หรือให้แชตเมมเบอร์เสนอการเปลี่ยนแปลงข้างพรีวิวสด
- Log lifting and cardio sessions as clients report back.
  - th: บันทึกเซสชันเวทและคาร์ดิโอตามที่เมมเบอร์รายงานกลับมา
- Block pulse: tonnage, sets, average RPE and best e1RM per week, each traceable to logged sets.
  - th: Block pulse: น้ำหนักรวม จำนวนเซต RPE เฉลี่ย และ e1RM สูงสุดต่อสัปดาห์ ทุกตัวเลขย้อนดูเซตที่บันทึกไว้ได้
- Needs-review signals — block ending, deload due, RPE creep, stall, adherence, cardio behind — with snooze.
  - th: สัญญาณที่ต้องตรวจ ได้แก่ บล็อกใกล้จบ ถึงเวลาดีโหลด RPE creep, stall การทำตามแผน และคาร์ดิโอตามหลัง เลื่อนการเตือน (snooze) ได้
- Exercise catalog with movement patterns, pattern balance and kinetic-chain balance.
  - th: คลังท่าพร้อม movement pattern, pattern balance และ kinetic-chain balance
- AI-drafted client messages you approve and copy in one tap.
  - th: ข้อความถึงเมมเบอร์ที่ AI ร่างให้ อนุมัติและคัดลอกได้ด้วยการแตะครั้งเดียว
