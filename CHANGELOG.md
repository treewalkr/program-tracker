# What's new

## Unreleased

### Improved
- Overview opens much faster, especially with many members: it now loads everything in one go instead of fetching each member one by one.
  - th: หน้า Overview เปิดเร็วขึ้นมาก โดยเฉพาะตอนมีเมมเบอร์เยอะ เพราะตอนนี้โหลดข้อมูลทั้งหมดในครั้งเดียว ไม่ต้องดึงทีละคนแล้ว

### Fixed
- On a short phone, members logging a session now see Set 1 above the Save session button, and the field they type in stays clear of it.
  - th: บนมือถือจอเตี้ย ตอนเมมเบอร์บันทึกเซสชัน เซ็ตแรกจะอยู่เหนือปุ่ม Save session แล้ว และช่องที่กำลังพิมพ์ก็ไม่โดนปุ่มบัง

## v0.1.57 — 2026-11-27

### New
- **Add an exercise while logging.** On Log a session, **+ Add exercise** under the last card adds one that isn't in the program: pick it from the library, or create a new one there. Its sets start from the member's last time on it (3 × 10 if they've never done it). Turn on **Also add to program** to put it in the same session for every later week, using the sets you just logged as targets.
  - th: **เพิ่มท่าระหว่างบันทึกได้แล้ว** ในหน้า Log a session กด **+ Add exercise** ใต้การ์ดท่าสุดท้ายเพื่อเพิ่มท่าที่ไม่มีในโปรแกรม เลือกจากคลังหรือสร้างท่าใหม่ตรงนั้นเลยก็ได้ เซ็ตจะขึ้นตามครั้งล่าสุดที่เมมเบอร์ทำท่านั้น (ถ้ายังไม่เคยทำ จะขึ้น 3 × 10) ถ้าเปิด **Also add to program** ท่านี้จะเข้าไปอยู่ในเซสชันเดียวกันของทุกสัปดาห์ถัดไป โดยใช้เซ็ตที่เพิ่งบันทึกเป็นเป้า
- Swap exercise on the log page can also create a new exercise.
  - th: ตอน Swap exercise ในหน้า Log ก็สร้างท่าใหม่ได้เหมือนกัน

## v0.1.56 — 2026-11-27

### Fixed
- On an iPhone or iPad, tapping an option in a list now picks it. Before, a tap did nothing: members couldn't pick an RPE on a cardio log, and the exercise, label and session-type pickers ignored taps.
  - th: บน iPhone หรือ iPad แตะตัวเลือกในรายการแล้วเลือกได้แล้ว ก่อนหน้านี้แตะแล้วไม่มีอะไรเกิดขึ้น เมมเบอร์เลือก RPE ตอนบันทึกคาร์ดิโอไม่ได้ ส่วนตัวเลือกท่าออกกำลังกาย ป้าย และประเภทเซสชันก็ไม่รับการแตะ
- After you sign in or leave view-as, the app only ever takes you back to a page on this site.
  - th: หลังล็อกอินหรือออกจากโหมด view-as แอปจะพากลับไปแค่หน้าในเว็บนี้เท่านั้น

## v0.1.55 — 2026-11-27

### Fixed
- Overview no longer marks a planned session done because of a different kind of log that day. A run the member logged without picking a session now counts only for a cardio session, and shows on its own when that day has only strength planned.
  - th: Overview ไม่ขึ้นว่าเซสชันที่วางแผนไว้เสร็จแล้ว เพียงเพราะวันนั้นมีบันทึกคนละประเภท ถ้าเมมเบอร์บันทึกการวิ่งโดยไม่ได้เลือกเซสชัน ก็จะนับให้แค่เซสชันคาร์ดิโอ และถ้าวันนั้นวางแผนไว้แค่เวท การวิ่งนั้นจะขึ้นแยกต่างหาก
- Two of your own labels that start with the same word now get different chips ("Speed L", "Speed S") instead of the same one. A chip you typed yourself never changes.
  - th: ป้ายของเราเองสองอันที่ขึ้นต้นด้วยคำเดียวกันจะได้ชิปไม่ซ้ำกันแล้ว เช่น "Speed L" กับ "Speed S" ส่วนชิปที่พิมพ์เองจะไม่เปลี่ยน
- "Already in the library" no longer shows for an exercise that shares just one word with another, such as "BB standing biceps" and "Biceps rope curl".
  - th: ข้อความ "Already in the library" ไม่ขึ้นแล้ว ถ้าท่าออกกำลังกายมีคำตรงกับอีกท่าแค่คำเดียว เช่น "BB standing biceps" กับ "Biceps rope curl"
- The guide's "On this page" list highlights the section a search took you to, not the one above it.
  - th: รายการ "On this page" ในคู่มือไฮไลต์หัวข้อที่ค้นหาแล้วกระโดดไป ไม่ใช่หัวข้อที่อยู่ก่อนหน้า
- Pages no longer jump while loading on a phone or tablet: the placeholder tabs are the same height as the real ones.
  - th: หน้าเว็บบนมือถือหรือแท็บเล็ตไม่กระตุกตอนโหลดแล้ว เพราะแท็บที่ขึ้นระหว่างรอสูงเท่าแท็บจริง
- Messages say "Member not found." and "This program changed since you opened it", and the Thai guides say เมมเบอร์ throughout.
  - th: ข้อความในแอปเปลี่ยนเป็น "Member not found." และ "This program changed since you opened it" ส่วนคู่มือภาษาไทยก็ใช้คำว่าเมมเบอร์ทั้งหมดแล้ว

## v0.1.54 — 2026-11-27

### Improved
- **"Member" everywhere.** The app, the guides, the AI's notes and its warnings now say member instead of client. Searching the guides for "client" still finds the member answers.
  - th: ใช้คำว่า "เมมเบอร์" ทุกที่แล้ว ทั้งในแอป คู่มือ โน้ตและคำเตือนของ AI ถ้าค้นคู่มือด้วยคำว่า "client" ก็ยังเจอคำตอบเรื่องเมมเบอร์เหมือนเดิม
- Date fields say far dates in months or years ("10 months ago", "36 years ago") instead of a long count of days.
  - th: ช่องวันที่บอกวันที่ไกล ๆ เป็นเดือนหรือปีแล้ว เช่น "10 months ago" หรือ "36 years ago" ไม่ต้องนับเป็นวันยาว ๆ
- Easier tapping on a phone: small buttons and links get a full 44px tap area, the update notice sits below the top bar and any draft notices, the Feedback button stays clear of the exercise drawer, and the feedback page's buttons wrap instead of being cut off.
  - th: กดบนมือถือง่ายขึ้น ปุ่มและลิงก์เล็ก ๆ มีพื้นที่กด 44px เต็ม ๆ ข้อความแจ้งอัปเดตอยู่ใต้แถบด้านบนและใต้ข้อความแจ้งดราฟต์ ปุ่ม Feedback ไม่บังลิ้นชักท่าออกกำลังกาย ส่วนปุ่มในหน้าฟีดแบ็กก็ขึ้นบรรทัดใหม่แทนที่จะโดนตัด
- The Cardio switch on a new member says what keeps it on.
  - th: สวิตช์ Cardio ตอนเพิ่มเมมเบอร์ใหม่บอกแล้วว่าทำไมถึงเปิดค้างอยู่

### Fixed
- Dates now show correctly in date fields (for example Change start and a member's birth date) instead of coming up blank.
  - th: ช่องวันที่แสดงวันที่ถูกต้องแล้ว เช่น Change start และวันเกิดของเมมเบอร์ ไม่ขึ้นว่างเปล่าอีก
- Working in pounds: the log sheet's weight hint names the unit, the e1RM's source set and the "Log as prescribed?" dialog show loads in pounds as typed.
  - th: สำหรับคนที่ใช้ปอนด์ คำใบ้น้ำหนักในหน้าบันทึกบอกหน่วยแล้ว ส่วนเซ็ตที่ใช้คำนวณ e1RM และหน้าต่าง "Log as prescribed?" ก็แสดงน้ำหนักเป็นปอนด์ตรงตามที่พิมพ์
- An archived program no longer marks a week as "now": the week that was under way says so, and later weeks stay upcoming.
  - th: โปรแกรมที่ archive แล้วไม่ขึ้นว่าสัปดาห์ไหนเป็น "now" อีก สัปดาห์ที่กำลังทำอยู่ตอน archive จะบอกไว้ ส่วนสัปดาห์หลังจากนั้นยังเป็น upcoming
- When you approve a draft with cardio, easy runs no longer get stuck before the key runs are placed, and a moved key run keeps off an easy run's day.
  - th: ตอนอนุมัติดราฟต์ที่มีคาร์ดิโอ รันเบา ๆ จะไม่ล็อกวันไว้ก่อนรันหลัก และรันหลักที่ย้ายวันก็ไม่ไปทับวันของรันเบา
- After Log it, the trainer log sheet's header shows the log you just saved.
  - th: พอกด Log it แล้ว หัวของหน้าบันทึกฝั่งเทรนเนอร์จะแสดงบันทึกที่เพิ่งเซฟ
- The Members count in the sidebar updates when a member is added or archived.
  - th: จำนวน Members ที่แถบด้านข้างอัปเดตทันทีเมื่อเพิ่มหรือ archive เมมเบอร์
- A long role label's short chip stays short and on one line, and stays automatic when you rename the label.
  - th: ชิปสั้นของป้ายท่าที่ชื่อยาวจะสั้นและอยู่บรรทัดเดียว และยังตั้งให้อัตโนมัติเหมือนเดิมเมื่อเปลี่ยนชื่อป้าย

## v0.1.53 — 2026-11-26

### New
- **Members can log last week's sessions.** A session the member forgot (say Sunday's, remembered on Monday) shows under "Last week — not logged" on their week page and can still be logged. It's dated on its planned day. Anything older than last week stays closed.
  - th: เมมเบอร์บันทึกเซสชันของสัปดาห์ที่แล้วได้ เช่น ลืมบันทึกวันอาทิตย์แล้วเพิ่งนึกได้วันจันทร์ เซสชันนั้นจะขึ้นในหัวข้อ "สัปดาห์ที่แล้ว — ยังไม่ได้บันทึก" ในหน้าสัปดาห์ และยังบันทึกได้ วันที่จะเป็นวันที่วางแผนไว้ ส่วนเซสชันที่เก่ากว่าสัปดาห์ที่แล้วยังบันทึกไม่ได้เหมือนเดิม
- **Pause or archive a member.** The member's Settings tab has a Member status: Active, Paused or Archived. Archiving hides them from Overview and the default Members list and turns their portal off. Their program and logs are kept, and you can set them back to Active any time.
  - th: พักหรือเก็บเมมเบอร์เข้าคลังได้แล้ว แท็บ Settings ของเมมเบอร์มีสถานะให้เลือก Active, Paused หรือ Archived ถ้าเลือก Archived เมมเบอร์จะหายจาก Overview และรายชื่อ Members ปกติ พอร์ทัลของเขาก็จะปิดด้วย แต่โปรแกรมกับบันทึกยังอยู่ครบ และเปลี่ยนกลับเป็น Active เมื่อไหร่ก็ได้
- **Delete a program that was never used.** A draft, or an archived program with no logged sessions, now has a Delete button. Programs with logs can't be deleted, so a member's history is never lost.
  - th: ลบโปรแกรมที่ไม่เคยใช้ได้แล้ว ดราฟต์ หรือโปรแกรมที่ archive แล้วแต่ไม่มีเซสชันที่บันทึกไว้ จะมีปุ่ม Delete ส่วนโปรแกรมที่มีบันทึกแล้วลบไม่ได้ ประวัติของเมมเบอร์จึงไม่หาย
- **Feedback on strength logs.** Open a strength session in the member's History tab to mark it reviewed and leave a note. The member sees it in their portal, the same as cardio feedback.
  - th: ให้ฟีดแบ็กบันทึกเวทได้แล้ว เปิดเซสชันเวทในแท็บ History ของเมมเบอร์ เพื่อกดว่ารีวิวแล้วและเขียนโน้ตถึงเขา เมมเบอร์จะเห็นในพอร์ทัลเหมือนฟีดแบ็กคาร์ดิโอ
- **Plyometric label.** A new built-in exercise label for reactive jumps, hops and bounds. Auto-suggest picks it for names like pogo jumps, box jumps and bounds. Cleans, throws and swings stay Power.
  - th: มีป้ายท่าใหม่ชื่อ Plyometric สำหรับท่ากระโดด กระโดดสั้น ๆ และ bound ระบบเลือกป้ายนี้ให้เองกับท่าอย่าง pogo jump, box jump และ bound ส่วน clean, throw และ swing ยังเป็น Power เหมือนเดิม

### Improved
- When you activate a block whose Week 1 starts later, a warning says the current program stops now and the member has nothing to log until then.
  - th: ตอนเปิดใช้บล็อกที่ Week 1 เริ่มทีหลัง จะมีคำเตือนว่าโปรแกรมปัจจุบันจะหยุดทันที และเมมเบอร์จะไม่มีอะไรให้บันทึกจนถึงวันนั้น

### Fixed
- A session you log for a member can no longer be dated in the future.
  - th: เซสชันที่เทรนเนอร์บันทึกให้เมมเบอร์ ใส่วันที่ในอนาคตไม่ได้แล้ว

## v0.1.52 — 2026-11-26

### New
- **Members see what you logged for them.** If you log a member's session, it shows on their week card. They can open it read-only and see your note first.
  - th: เซสชันที่เทรนเนอร์บันทึกให้ เมมเบอร์จะเห็นในการ์ดของสัปดาห์นั้นด้วย เปิดดูได้แต่แก้ไม่ได้ และเห็นโน้ตของเทรนเนอร์ก่อนอย่างอื่น
- **Portal links open well from LINE.** A link opened inside LINE, Messenger or Instagram asks the member to open it in Safari or Chrome, so their sign-in sticks. A member who's already signed in goes straight to their program. Shared links show a neutral preview title.
  - th: ลิงก์พอร์ทัลที่เปิดจาก LINE, Messenger หรือ Instagram จะชวนเมมเบอร์ไปเปิดใน Safari หรือ Chrome แทน จะได้ไม่หลุดจากระบบ ถ้าล็อกอินไว้แล้วก็เข้าโปรแกรมได้เลย ส่วนพรีวิวตอนแชร์ลิงก์จะขึ้นชื่อกลาง ๆ ไม่บอกข้อมูลส่วนตัว
- **Member page shows what's waiting.** A draft still being written, or a block you haven't activated yet, now shows at the top of the member's page. Until this week has chain sets, the chains panel shows last week's.
  - th: หน้าเมมเบอร์บอกแล้วว่ามีอะไรค้างอยู่ ถ้ามีดราฟต์ที่ AI กำลังเขียน หรือบล็อกที่ยังไม่ได้เปิดใช้ จะขึ้นไว้ด้านบนเลย และถ้าสัปดาห์นี้ยังไม่มีเซ็ตในแผง chains แผงจะโชว์ของสัปดาห์ก่อนไปก่อน
- **Try again on a failed draft.** If an AI draft fails, Try again runs it again with the same brief.
  - th: ดราฟต์ AI ที่ล้มเหลว กด Try again ได้เลย ระบบจะรันใหม่ด้วย brief เดิม

### Improved
- **Phones and iPad, across the app.** On a touch screen, fields use 16px text so the iPhone doesn't zoom, and buttons, links and list rows are at least 44px. Bars stay clear of the notch and home indicator. Menus, dropdowns, tooltips (long-press) and wide tables fit the screen. The program editor, Generate, draft chat, templates, the library pages and Feedback were all reworked for small screens.
  - th: บนมือถือและ iPad ทั้งแอป ช่องกรอกใช้ตัวอักษร 16px บน iPhone จะได้ไม่ซูมเอง ปุ่ม ลิงก์ และแถวรายการใหญ่อย่างน้อย 44px แถบด้านบนและล่างไม่ทับรอยบากหรือแถบโฮม เมนู ดรอปดาวน์ คำอธิบายที่ขึ้นตอนกดค้าง และตารางกว้าง ๆ พอดีจอทั้งหมด ส่วนตัวแก้โปรแกรม Generate แชตดราฟต์ เทมเพลต หน้าไลบรารี และ Feedback ก็ปรับให้ใช้บนจอเล็กได้สะดวกขึ้นแล้ว
- **Logging on the gym floor.** Set 1 is on the member log's first screen. Tapping a pre-filled number selects it, so typing replaces it, and Enter moves to the next box. The rest timer keeps running when the member switches apps.
  - th: บันทึกในยิมง่ายขึ้น หน้าบันทึกของเมมเบอร์มีเซ็ตแรกให้เห็นตั้งแต่หน้าแรก แตะตัวเลขที่กรอกไว้แล้วจะเลือกทั้งช่อง พิมพ์ทับได้เลย กด Enter ก็ไปช่องถัดไป ตัวจับเวลาพักก็ไม่หยุดตอนสลับแอป
- **Nothing gets lost on the way out.** Library forms, templates, coaching rules, vocabulary, examples, member settings and a new client all ask before you leave with unsaved changes. The Generate brief survives a detour, and a new program draft saves when you leave.
  - th: ข้อมูลไม่หายตอนออกจากหน้า ฟอร์มในไลบรารี เทมเพลต coaching rules, vocabulary, examples, ตั้งค่าเมมเบอร์ และฟอร์มเพิ่มเมมเบอร์ใหม่ จะถามก่อนทุกครั้งถ้ายังมีอะไรไม่ได้เซฟ brief ใน Generate ไม่หายถ้าแวะไปหน้าอื่น และดราฟต์โปรแกรมใหม่เซฟไว้ให้ตอนออกจากหน้า
- **Cardio review.** Heart rate is checked against your bpm band, not its zone. The review shows the member's per-rep results. Speed, split and pace are named for the activity, and times read like 1 h 44 min.
  - th: ตอนรีวิวคาร์ดิโอ ระบบเทียบชีพจรกับช่วง bpm ที่เทรนเนอร์ตั้งไว้ ไม่ใช่โซน แสดงผลทีละ rep ของเมมเบอร์ ใช้คำ speed, split หรือ pace ตามประเภทกิจกรรม และเขียนเวลาแบบ 1 h 44 min
- **Plainer error messages.** Server errors and dropped connections are explained in plain words.
  - th: ข้อความ error อ่านง่ายขึ้น เวลาเซิร์ฟเวอร์มีปัญหาหรือเน็ตหลุด จะบอกเป็นภาษาธรรมดา

### Fixed
- **Member logs are safer.** A member's draft survives going offline and works only on their own account. An older tab can no longer overwrite a newer log, and a save that already went through isn't saved twice. Your feedback stays when a member re-saves a log. They're warned first that re-saving clears your Reviewed mark, and that removing the log deletes your note.
  - th: บันทึกของเมมเบอร์ปลอดภัยขึ้น ดราฟต์ไม่หายแม้ออฟไลน์ และผูกกับบัญชีของเมมเบอร์คนนั้นเท่านั้น แท็บเก่าเขียนทับบันทึกที่ใหม่กว่าไม่ได้แล้ว และบันทึกที่เซฟไปแล้วจะไม่ถูกเซฟซ้ำ ถ้าเมมเบอร์เซฟบันทึกใหม่ ฟีดแบ็กของเทรนเนอร์ยังอยู่ แต่ระบบจะเตือนก่อนว่าเครื่องหมาย Reviewed จะหายไป ถ้าลบบันทึก ระบบก็เตือนว่าโน้ตของเทรนเนอร์จะหายไปด้วย
- Thai aliases keep their vowel and tone marks.
  - th: alias ภาษาไทยไม่ทำสระและวรรณยุกต์หายแล้ว
- A skipped cardio session shows as "not done", not as missed, on Overview and in the program editor.
  - th: เซสชันคาร์ดิโอที่เมมเบอร์ข้าม ขึ้นว่า "not done" ทั้งใน Overview และตัวแก้โปรแกรม ไม่ขึ้นว่าพลาด

## v0.1.51 — 2026-11-24

### New
- **Progression schemes show their shape.** Each scheme draws its weeks as a small bar chart, coloured by what each week pushes (volume, intensity or deload), with a week-by-week table under it, so schemes are easy to tell apart. A new scheme starts from a preset under "Start from", and the week editor lists one week per line.
  - th: หน้า Progression schemes ดูรูปทรงของแต่ละ scheme ได้ในแวบเดียว ทุก scheme มีกราฟแท่งเล็ก ๆ หนึ่งแท่งต่อสัปดาห์ สีบอกว่าสัปดาห์นั้นเน้นอะไร (volume, intensity หรือ deload) และมีตารางรายสัปดาห์อยู่ข้างใต้ ตอนสร้าง scheme ใหม่ เลือก preset ใน "Start from" แล้วค่อยปรับต่อได้เลย ส่วนตัวแก้สัปดาห์ก็เรียงหนึ่งสัปดาห์ต่อหนึ่งบรรทัดแล้ว
- **Start a template from a built-in.** New template has a "Start from" row of the built-in templates. Pick one to fill Body with its rules, then edit them. If you've already written your own, it asks before replacing it. New template also has its own link, /templates/new.
  - th: เริ่มเทมเพลตใหม่จาก built-in ได้แล้ว หน้า New template มีแถว "Start from" รวมเทมเพลต built-in ไว้ เลือกอันไหนก็จะเติมกฎของอันนั้นลงใน Body ให้แก้ต่อ ถ้าเขียนของตัวเองไว้แล้ว ระบบจะถามก่อนทับ หน้านี้ยังมีลิงก์ของตัวเองด้วย คือ /templates/new
- **All clients, by trainer (admins).** The All clients page groups clients under each trainer, with a strip showing how recently each one logged and counts of who's gone quiet, never logged or run past their plan. Click a trainer to open their list.
  - th: หน้า All clients ของแอดมินจัดกลุ่มเมมเบอร์ตามเทรนเนอร์ แต่ละคนมีแถบสีบอกว่าเมมเบอร์บันทึกล่าสุดเมื่อไหร่ และบอกจำนวนคนที่เงียบไป ยังไม่เคยบันทึก หรือเลยแผนไปแล้ว คลิกที่เทรนเนอร์เพื่อกางดูรายชื่อ

### Improved
- **Every form field and dropdown matches.** Text boxes, notes, dates and dropdowns across the app share one look, size and keyboard behaviour, from the program editor and session log to Generate, Coaching rules, Examples and member forms. On a phone they're 40px tall with 16px text, so the iPhone doesn't zoom in when you tap one.
  - th: ช่องกรอกและดรอปดาวน์ทั้งแอปหน้าตาเหมือนกันแล้ว ทั้งช่องข้อความ ช่องโน้ต ช่องวันที่ และดรอปดาวน์ ใช้ขนาดและปุ่มคีย์บอร์ดแบบเดียวกันหมด ตั้งแต่ตัวแก้โปรแกรม หน้าบันทึกเซสชัน ไปจนถึง Generate, Coaching rules, Examples และฟอร์มของเมมเบอร์ บนมือถือช่องสูง 40px ตัวอักษร 16px แตะแล้ว iPhone ก็ไม่ซูมเข้าเอง
- **Templates on phones and iPad** open as a list first. Tap a template to read it full screen, and Back returns to the list.
  - th: บนมือถือและ iPad หน้า Templates จะเปิดเป็นรายการก่อน แตะเทมเพลตไหนก็เปิดอ่านเต็มจอ กด Back ก็กลับมาที่รายการ
- **Tidier phones.** Tabs and rows of buttons stay on one line and scroll sideways, with a soft fade at the edge while there's more. Scrollbars are hidden on phones and touch screens, search boxes run full width, and list filters share one row.
  - th: บนมือถือ แท็บและแถวปุ่มอยู่บรรทัดเดียว เลื่อนด้านข้างได้ ถ้ายังมีต่อ ขอบจะจางให้รู้ บนมือถือและจอสัมผัสไม่มี scrollbar แล้ว ช่องค้นหากว้างเต็มจอ ส่วนตัวกรองในหน้ารายการก็อยู่แถวเดียวกัน
- **Number cells.** Up and down arrows step the number in a table cell, and on a phone you can type a minus in week targets and progression. On touch screens the cells show their edges, so you can see where to tap.
  - th: ในช่องตัวเลขของตาราง กดลูกศรขึ้นลงเพื่อเพิ่มหรือลดค่าได้ บนมือถือใส่เครื่องหมายลบในเป้าหมายรายสัปดาห์และ progression ได้แล้ว ส่วนบนจอสัมผัส ช่องจะมีขอบให้เห็นว่าต้องแตะตรงไหน
- Pages in the side menu show ‹ Back when you opened them from another page.
  - th: หน้าที่อยู่ในเมนูด้านข้าง ถ้าเปิดมาจากหน้าอื่นจะมีปุ่ม ‹ Back ด้วย

### Fixed
- On Coaching rules, the member picker stays inside its column.
  - th: หน้า Coaching rules ตัวเลือกเมมเบอร์ไม่ล้นออกนอกคอลัมน์แล้ว
- The date field when logging a member's session has room for the full date.
  - th: ช่องวันที่ตอนบันทึกเซสชันของเมมเบอร์กว้างพอให้เห็นวันที่เต็ม ๆ แล้ว

## v0.1.50 — 2026-11-24

### New
- **A Back button on phones and the home-screen app.** PT opened from the home screen on an iPhone or iPad has no browser back button, so pages inside a member, program or guide now show ‹ Back at the top left. It returns to the page you came from, or to the page above if you opened it from a link. Members' session and settings pages work the same way.
  - th: มีปุ่มย้อนกลับบนมือถือและแอปที่เปิดจากหน้าโฮม เวลาเปิด PT จากหน้าโฮมของ iPhone หรือ iPad จะไม่มีปุ่มย้อนกลับของเบราว์เซอร์ หน้าย่อยอย่างหน้าเมมเบอร์ โปรแกรม หรือคู่มือ จึงมีปุ่ม ‹ Back ที่มุมซ้ายบน กดแล้วกลับไปหน้าที่เพิ่งมา ถ้าเปิดมาจากลิงก์ก็จะไปหน้าหลักของส่วนนั้น หน้าเซสชันและหน้าตั้งค่าของเมมเบอร์ก็ใช้แบบเดียวกัน

## v0.1.49 — 2026-11-24

### Improved
- **Draft chat reads like a document.** Beside the draft, your questions read as headings and the answers sit in one centred column, with the message box floating at the bottom. The newest reply always stays clear of the box, and an empty chat says so instead of showing a blank panel.
  - th: แชตร่างโปรแกรมอ่านง่ายขึ้น ตอนเปิดคู่กับร่าง คำถามของคุณจะเป็นหัวข้อ คำตอบเรียงเป็นคอลัมน์เดียวตรงกลาง ช่องพิมพ์ลอยอยู่ด้านล่าง คำตอบล่าสุดไม่โดนช่องพิมพ์บังแล้ว และถ้ายังไม่มีข้อความก็จะบอกไว้ ไม่ปล่อยเป็นกล่องว่าง
- **Bigger tap targets on phones.** Buttons are 44px tall on a phone, including Snooze, Open program, the Good/Bad draft rating, Sessions/Compare and each exercise's Note on draft review.
  - th: บนมือถือ ปุ่มสูง 44px กดง่ายขึ้น รวมถึง Snooze, Open program, ปุ่มให้คะแนนร่าง Good/Bad, Sessions/Compare และปุ่ม Note ของแต่ละท่าในหน้ารีวิวร่าง
- **Arrow keys move between tabs**, and Home and End jump to the first and last tab.
  - th: ใช้ปุ่มลูกศรสลับแท็บได้แล้ว กด Home หรือ End เพื่อไปแท็บแรกหรือแท็บสุดท้าย

### Fixed
- Saving a program that changed in another tab, or through an approved AI fill, no longer overwrites the newer version. You'll see "This program changed since you opened it" and can reload the latest.
  - th: ถ้าโปรแกรมถูกแก้จากแท็บอื่น หรือถูกเปลี่ยนจากการอนุมัติร่างที่ AI เติมไว้ ตอนกดบันทึกจะไม่ทับเวอร์ชันที่ใหม่กว่าแล้ว จะขึ้นข้อความ "This program changed since you opened it" ให้โหลดเวอร์ชันล่าสุดแทน
- Approving the same draft twice at once no longer creates two programs.
  - th: กดอนุมัติร่างเดียวกันซ้ำพร้อมกัน จะไม่ได้โปรแกรมออกมาสองอันแล้ว
- On the Members list, a member's limitations show as text under their name on a phone, and on a computer the flag can be reached with the keyboard.
  - th: ในหน้า Members บนมือถือจะเห็นข้อจำกัดของเมมเบอร์เป็นข้อความใต้ชื่อ ส่วนบนคอมพิวเตอร์ใช้คีย์บอร์ดไปที่ธงเพื่ออ่านได้
- On Templates, the "Distill for client" row wraps on a phone instead of sticking out of the card.
  - th: หน้า Templates แถว "Distill for client" ขึ้นบรรทัดใหม่บนมือถือ ไม่ล้นออกนอกการ์ดแล้ว
- The Direction box on a member's page is labelled for screen readers.
  - th: ช่อง Direction ในหน้าเมมเบอร์มีชื่อกำกับให้โปรแกรมอ่านหน้าจอแล้ว
- The program editor marks a negative rest or an RPE it can't read right on the set, and says which exercise and set to fix.
  - th: ตัวแก้โปรแกรมจะไฮไลต์เวลาพักที่ติดลบ หรือ RPE ที่อ่านไม่ออก ตรงเซตนั้นเลย และบอกว่าต้องแก้ท่าไหน เซตไหน
- In pounds, the session logger's suggested load is rounded like the prescription (110 lb, not 110.2), and Use fills the rounded value.
  - th: ถ้าใช้หน่วยปอนด์ น้ำหนักที่แนะนำในหน้าบันทึกเซสชันจะปัดแบบเดียวกับในโปรแกรม (110 lb ไม่ใช่ 110.2) และปุ่ม Use ก็ใส่ค่าที่ปัดแล้ว
- Delete buttons that ask "Really…?" no longer make pages scroll sideways on a phone.
  - th: ปุ่มลบที่ถามยืนยันอีกครั้ง ไม่ทำให้หน้าเลื่อนออกด้านข้างบนมือถือแล้ว
- The Feedback button no longer covers Save changes on a program, or the hint under the message box in draft chat.
  - th: ปุ่ม Feedback ไม่บังปุ่ม Save changes ในหน้าโปรแกรม และไม่บังคำแนะนำใต้ช่องพิมพ์ในแชตร่างแล้ว

## v0.1.48 — 2026-11-23

### New
- **Movement prep and main work.** Every session now has two parts. Movement prep is an optional warm-up of up to 8 exercises, and it never counts toward volume, progress or PRs. Main work is everything that counts. Use "+ Movement prep" or "Move to movement prep" to put an exercise there. Members tick prep off as a checklist and log sets only on main work, and history shows "Prep 3/4". The AI plans prep to suit each session, and pasted notes with a "Warm-up" heading land in prep. Movement Prep is no longer a role label, and old programs keep reading it as prep.
  - th: ทุกเซสชันแบ่งเป็นสองส่วนแล้ว ส่วนแรกคือเตรียมร่างกาย ใส่ท่าวอร์มได้ไม่เกิน 8 ท่า จะใส่หรือไม่ใส่ก็ได้ และไม่นับรวมในวอลุ่ม ความคืบหน้า หรือ PR ส่วนที่สองคือท่าหลัก ซึ่งนับทุกอย่างตามเดิม เพิ่มท่าเข้าส่วนเตรียมร่างกายได้ด้วยปุ่ม "+ Movement prep" หรือ "Move to movement prep" ฝั่งเมมเบอร์แค่ติ๊กท่าเตรียมร่างกายว่าทำแล้ว และบันทึกเซตเฉพาะท่าหลัก ในประวัติจะเห็นเป็น "Prep 3/4" AI จะเลือกท่าเตรียมร่างกายให้เข้ากับแต่ละเซสชัน และถ้าโน้ตที่วางมีหัวข้อ "Warm-up" ท่าใต้หัวข้อนั้นจะเข้าส่วนเตรียมร่างกายให้เอง ป้าย Movement Prep ไม่อยู่ในรายการ role แล้ว แต่โปรแกรมเก่าที่ใช้ป้ายนี้ยังนับเป็นส่วนเตรียมร่างกายเหมือนเดิม

### Fixed
- The Feedback page now uses the full page width like other pages, and note fields on feedback cards run the full card width.
  - th: หน้า Feedback ใช้พื้นที่เต็มความกว้างเหมือนหน้าอื่นแล้ว ช่องโน้ตในการ์ดฟีดแบ็กก็ยาวเต็มการ์ดด้วย

## v0.1.47 — 2026-11-23

### Improved
- **Clearer close-ups in feedback.** When you click something small to send feedback, the close-up now takes in the area around it and outlines your pick in red, so it's plain what you meant.
  - th: พอคลิกจุดเล็ก ๆ เพื่อส่งฟีดแบ็ก ภาพระยะใกล้ก็จะเก็บพื้นที่รอบ ๆ มาด้วย แล้ววงสิ่งที่คุณเลือกไว้ด้วยกรอบสีแดง ดูแล้วรู้เลยว่าหมายถึงตรงไหน

### Fixed
- When the Feedback page can't load, it now shows just the reason and a Try again button.
- On a phone, Feedback page buttons are full-size tap targets, and reply dates no longer break over two lines.

## v0.1.46 — 2026-11-23

### New
- **Client logs on the Overview.** When a member logs a session in the portal, it now shows in a new Client logs panel under Needs review: what they did, when, and their note. Tap Seen to clear it, and their next log brings it back.
  - th: พอเมมเบอร์บันทึกเซสชันในพอร์ทัล ก็จะขึ้นในช่อง Client logs ใหม่ใต้ Needs review บอกว่าเล่นอะไร วันไหน พร้อมโน้ตที่เขียนไว้ กด Seen แล้วรายการก็หายไป จนกว่าเมมเบอร์คนนั้นจะบันทึกอีก

### Improved
- **A calmer Needs review.** The most important signals sit at the top, and a filter splits them into Check in and Plan ahead. Weeks ending soon share one row with a link per member, and Hide 1 wk tucks any signal away for a week.
  - th: Needs review โล่งขึ้น สัญญาณที่สำคัญที่สุดอยู่บนสุด มีตัวกรองแยก Check in กับ Plan ahead สัปดาห์ที่ใกล้จบรวมเป็นแถวเดียว แยกลิงก์ตามเมมเบอร์ ส่วนสัญญาณไหนยังไม่อยากเห็น กด Hide 1 wk ซ่อนไว้หนึ่งสัปดาห์ได้เลย
- **"From last week" folds into one line.** It shows only how many sessions were missed or not logged. Tap Show to list them, one line per member, and this device remembers your choice.
  - th: From last week ย่อเหลือบรรทัดเดียว บอกแค่จำนวนเซสชันที่พลาดหรือยังไม่ได้บันทึก อยากดูรายการก็กด Show จะเห็นเรียงบรรทัดละเมมเบอร์ และเครื่องนี้จะจำไว้ว่าคุณเปิดหรือปิดไว้

## v0.1.45 — 2026-11-23

### New
- **Bodyweight or weight on your log sheet too.** Each set on your own log sheet now has the same BW / kg switch your members have, and one tap carries it to the later rounds. Unweighted step-ups no longer need a 0, and "Did it as prescribed" shows those sets as "BW×10".
  - th: ในหน้าบันทึกของคุณเอง ทุกเซตมีปุ่มสลับ BW / กก. เหมือนฝั่งเมมเบอร์แล้ว กดครั้งเดียวรอบถัดไปก็เปลี่ยนตาม สเต็ปอัปที่ไม่ถือน้ำหนักไม่ต้องกรอก 0 อีก และตอนกด "Did it as prescribed" เซตพวกนี้ก็ขึ้นเป็น "BW×10"

### Improved
- **Cleaner logging screens.** On the member log, targets read one way, the BW / kg switch sits on the label line, and a circuit has one "Add a set" line. On your log sheet, phone cards are lighter and full exercise names show on desktop.
  - th: หน้าบันทึกทั้งสองฝั่งดูง่ายขึ้น ฝั่งเมมเบอร์ เป้าหมายแสดงแบบเดียวกันทุกเซต ปุ่ม BW / กก. อยู่บรรทัดเดียวกับหัวช่อง และเซอร์กิตมีปุ่มเพิ่มเซตบรรทัดเดียว ส่วนฝั่งคุณ การ์ดบนมือถือโล่งขึ้น บนเดสก์ท็อปก็เห็นชื่อท่าเต็ม

### Fixed
- Cable and machine moves now always open in kg, even when the last log had no weight.
  - th: ท่าเคเบิลและท่าเครื่องเปิดมาเป็น กก. เสมอแล้ว แม้ครั้งก่อนจะไม่ได้กรอกน้ำหนัก
- "Log as prescribed?" no longer counts timed moves like SkiErg as missing a load.
  - th: หน้าต่าง "Log as prescribed?" ไม่นับท่าจับเวลาอย่าง SkiErg ว่าขาดน้ำหนักแล้ว

## v0.1.44 — 2026-11-23

### New
- **Circuits and supersets log round by round.** On the portal, members now see each round as "Set 1" with every exercise in it, the way they do it on the floor. The card also says what it is, like "Circuit · 3 rounds".
  - th: เซอร์กิตกับซูเปอร์เซตในพอร์ทัลเรียงเป็นรอบแล้ว เมมเบอร์จะเห็น "เซต 1" พร้อมทุกท่าในรอบนั้น ตรงกับที่เล่นจริง หัวการ์ดก็บอกด้วยว่าเป็นเซอร์กิตหรือซูเปอร์เซต กี่รอบ
- **Bodyweight or weight, set by set.** Members can mark any set as bodyweight (BW) or enter a weight, and one tap carries it to the later rounds. Bodyweight moves start as BW, and a vest or belt goes in as added weight. You see these sets as "BW × 10" in History.
  - th: เมมเบอร์เลือกได้ทีละเซตว่าเล่นน้ำหนักตัว (BW) หรือใส่น้ำหนัก กดครั้งเดียวรอบถัดไปก็เปลี่ยนตาม ท่าบอดี้เวทเริ่มที่ BW ให้เลย ถ้าใส่เวสต์หรือเข็มขัดถ่วงก็กรอกเฉพาะน้ำหนักที่เพิ่ม ส่วนฝั่งคุณจะเห็นเซตแบบนี้เป็น "BW × 10" ใน History
- **A cleaner log screen.** Skip and "Something hurt" now sit behind one "Skip or pain?" link under the sets, so the sets come first. Anything a member flags still shows as a tag at the top of the card.
  - th: หน้าบันทึกโล่งขึ้น ปุ่มข้ามท่ากับแจ้งเจ็บย้ายไปอยู่ในลิงก์ "ข้ามท่า หรือเจ็บ?" ใต้เซต เมมเบอร์เลยเห็นเซตก่อนอย่างอื่น แต่ถ้ามีท่าไหนข้ามหรือเจ็บ ก็ยังขึ้นป้ายไว้บนหัวการ์ดอยู่ดี

### Fixed
- The progress bar on the member log no longer greys out exercises a member scrolled past without changing, which looked like they'd been skipped. Exercise names in a group have their spaces back ("SkiErg + Wall Ball").
  - th: แถบความคืบหน้าในหน้าบันทึกไม่ขึ้นสีเทาตรงท่าที่เมมเบอร์เลื่อนผ่านโดยไม่ได้แก้อะไรแล้ว เพราะดูเหมือนข้ามท่าไป ชื่อท่าในกลุ่มก็กลับมามีเว้นวรรคถูกต้อง ("SkiErg + Wall Ball")

## v0.1.43 — 2026-11-22

### New
- **The AI answers every piece of feedback.** Send feedback and the AI answers it, even when it isn't sure. It says so plainly when it's only a best guess, and may ask you a question or for a screenshot. Bugs and ideas still go to the owner, who decides what happens next. If you write back "solved" or "works now", it closes the feedback for you.
  - th: ส่งฟีดแบ็กมาเรื่องไหน AI ก็ตอบให้ทุกเรื่อง แม้จะยังไม่แน่ใจ ถ้าเป็นแค่การเดา AI จะบอกตรง ๆ และอาจถามกลับหรือขอภาพหน้าจอเพิ่ม ส่วนบั๊กกับไอเดียใหม่ยังส่งต่อให้เจ้าของแอปตัดสินใจเหมือนเดิม และถ้าตอบกลับว่า "ได้แล้ว" หรือ "ใช้ได้แล้ว" AI จะปิดเรื่องนั้นให้เอง

## v0.1.42 — 2026-11-22

### New
- **Smarter AI cardio.** The AI now works out paces from the member's race goal: tempo a little slower than race pace, interval reps a little faster, easy and long runs well slower. It keeps easy and long runs at RPE 2–3, plans at most one or two hard sessions a week, and only calls a session "VO₂max" when the reps really are that hard. It also puts runs on the member's cardio days.
  - th: AI วางคาร์ดิโอเก่งขึ้น คิดเพซจากเป้าแข่งของเมมเบอร์ให้เอง เทมโปช้ากว่าเพซแข่งนิดหน่อย ช่วงหนักของอินเทอร์วัลเร็วกว่าเล็กน้อย ส่วนวิ่งเบาและลองรันช้ากว่าชัดเจน วิ่งเบากับลองรันอยู่ที่ RPE 2–3 เซสชันหนักไม่เกิน 1–2 ครั้งต่อสัปดาห์ และจะเรียกว่า "VO₂max" ก็ต่อเมื่อช่วงหนักหนักถึงระดับนั้นจริง ๆ แถมยังวางวิ่งลงวันคาร์ดิโอของเมมเบอร์ด้วย
- **Targets on every interval.** Each interval can have its own pace, bpm range and note, and recoveries can have a zone and pace too. The pace follows the activity: per km or mile for running and walking, per 500 m for rowing, km/h for cycling. Members see the same targets in the portal.
  - th: อินเทอร์วัลแต่ละช่วงกำหนดเพซ ช่วง bpm และโน้ตของตัวเองได้ ช่วงพักก็ใส่โซนกับเพซได้ด้วย เพซจะเปลี่ยนตามประเภท วิ่งกับเดินเป็นต่อกม. หรือต่อไมล์ พายเรือเป็นต่อ 500 ม. ปั่นจักรยานเป็นกม./ชม. เมมเบอร์ก็เห็นเป้าเดียวกันในพอร์ทัล
- **See the full interval plan in a draft.** In the AI draft review, open a cardio session's breakdown to see each part with its zone, bpm and pace before you approve.
  - th: ตอนรีวิวดราฟต์จาก AI กดเปิดรายละเอียดเซสชันคาร์ดิโอ ก็เห็นทุกช่วงพร้อมโซน bpm และเพซได้ก่อนอนุมัติ

### Fixed
- Approving a draft now moves a hard run off a heavy leg day, as the draft's checks said it would.
  - th: ตอนอนุมัติดราฟต์ ระบบย้ายวิ่งหนักออกจากวันเล่นขาหนักให้แล้ว ตรงกับที่หน้าตรวจดราฟต์บอกไว้
- AI tempo and interval runs get the session type Anaerobic endurance instead of Aerobic base.
  - th: เทมโปกับอินเทอร์วัลที่ AI เขียน ได้ประเภทเซสชัน Anaerobic endurance แทน Aerobic base แล้ว
- "Why this session" notes no longer lose session names or start with a stray comma.
  - th: โน้ต "Why this session" ไม่หลุดชื่อเซสชัน และไม่ขึ้นต้นด้วยจุลภาคเกินมาแล้ว

## v0.1.41 — 2026-11-22

### New
- **Cardio, built out.** A cardio session can now hold intervals: warm-up, work reps with recovery between them, and cool-down. Each part can have a time or distance, an HR zone or bpm range, and an RPE. The editor adds up the total time as you go, and won't guess a time for a part given only by distance.
  - th: เซสชันคาร์ดิโอใส่อินเทอร์วัลได้แล้ว ทั้งวอร์มอัพ ช่วงหนักหลายรอบพร้อมช่วงพักระหว่างรอบ และคูลดาวน์ แต่ละช่วงกำหนดเวลาหรือระยะ โซนหรือช่วง bpm และ RPE ได้ ระบบรวมเวลาให้ทันที ส่วนช่วงที่กำหนดแค่ระยะ ระบบจะไม่เดาเวลาให้
- **Cardio templates and modalities.** Start a session from 6 built-in templates (Easy / Zone 2, Tempo, Intervals, Long, Continuous, Custom) or save your own. A new **Cardio library** page manages your templates and your own modalities, like "Assault bike".
  - th: เริ่มเซสชันคาร์ดิโอจากเทมเพลต 6 แบบที่มีให้ หรือบันทึกเทมเพลตของคุณเองก็ได้ หน้าใหม่ **Cardio library** ใช้จัดการเทมเพลตและประเภทคาร์ดิโอที่เพิ่มเอง เช่น "Assault bike"
- **Richer cardio logs.** A log now takes the time in mm:ss, session RPE, distance, average and max heart rate, pain with a note, calories, and optional results for each interval. Pace and session load are worked out for you. A session can also be marked as not done, with a reason, and it won't count as done or as missed.
  - th: บันทึกคาร์ดิโอกรอกเวลาเป็นนาทีกับวินาที RPE ทั้งเซสชัน ระยะทาง ชีพจรเฉลี่ยและสูงสุด อาการเจ็บพร้อมโน้ต แคลอรี และผลแยกรายช่วงได้ (ไม่บังคับ) เพซกับโหลดระบบคำนวณให้ ถ้าเมมเบอร์ไม่ได้เล่น ก็บันทึกว่าไม่ได้เล่นพร้อมเหตุผลได้ด้วย ระบบจะไม่นับว่าเล่นแล้วหรือขาด
- **Review cardio on the new Cardio tab.** Each member page has a Cardio tab with weekly session load, distance by activity, and the cardio logs to review. Open a log to see the plan next to what was done, write feedback, and mark it reviewed. The member sees your feedback in the portal. Pain on a cardio log now raises the pain flag too.
  - th: หน้าเมมเบอร์มีแท็บ Cardio ใหม่ แสดงโหลดรายสัปดาห์ ระยะทางแยกตามประเภท และบันทึกคาร์ดิโอที่รอรีวิว เปิดบันทึกแล้วจะเห็นแผนเทียบกับที่เล่นจริง เขียนฟีดแบ็กแล้วกดรีวิวได้เลย เมมเบอร์จะเห็นฟีดแบ็กในพอร์ทัล ส่วนอาการเจ็บในบันทึกคาร์ดิโอก็ขึ้นเป็นสัญญาณเตือนด้วย
- **Every new log keeps a copy of its plan.** Editing a program later no longer changes what a past log is compared against. This works for strength sessions too.
  - th: บันทึกใหม่ทุกครั้งเก็บสำเนาแผนไว้ด้วย แก้โปรแกรมทีหลัง บันทึกเก่าก็ยังเทียบกับแผนตอนที่เล่นจริง ใช้กับเซสชันเวทด้วย
- **HR zones per member.** In a member's Settings, set HR zones by % of max HR, heart-rate reserve (Karvonen), % of LTHR, or your own table. Each change is a new version from a date, so older sessions keep the zones they had. Nothing estimates max HR from age; an untested max HR is marked as approximate.
  - th: ตั้ง HR zone ของเมมเบอร์แต่ละคนได้ในแท็บ Settings เลือกได้ว่าจะคิดจาก % ของชีพจรสูงสุด, ชีพจรสำรอง (Karvonen), % ของ LTHR หรือกรอกตารางเอง ทุกครั้งที่แก้จะเป็นเวอร์ชันใหม่ตามวันที่เริ่มใช้ เซสชันก่อนหน้าก็ยังใช้โซนเดิม ระบบไม่เดาชีพจรสูงสุดจากอายุ และถ้ายังไม่ได้เทสต์จริงจะบอกว่าเป็นค่าประมาณ
- **VO₂max field tests.** A new Assessments tab records the Cooper 12-minute run, the 1.5-mile run and the Rockport 1-mile walk, with a trend chart for each. Results are estimates from field tests and say so.
  - th: แท็บ Assessments ใหม่ใช้บันทึกเทส VO₂max ได้ 3 แบบ คือวิ่ง 12 นาที (Cooper), วิ่ง 1.5 ไมล์ และเดิน 1 ไมล์ (Rockport) พร้อมกราฟแนวโน้มแยกตามแบบ ผลที่ได้เป็นค่าประมาณจากการทดสอบภาคสนาม และระบบก็บอกไว้ชัด
- **Weekly cardio target by session load.** Set the weekly target as session load (RPE × minutes) instead of zone-minutes. Existing zone-minutes targets were cleared, so set a new one where you need it.
  - th: เป้าคาร์ดิโอรายสัปดาห์ตั้งเป็นโหลด (RPE × นาที) แทน zone-minutes แล้ว เป้าแบบ zone-minutes เดิมถูกล้างออก ถ้ายังต้องใช้ ก็ตั้งใหม่ได้เลย
- **Miles and pounds.** In Settings › Units, show distances in km or mi and weights in kg or lb across the whole app. Everything is still stored in kg and km, so switching never changes a number. Members choose their own units in the portal.
  - th: เลือกแสดงระยะทางเป็นกม. หรือไมล์ และน้ำหนักเป็นกก. หรือปอนด์ได้ทั้งแอปที่ Settings › Units ข้อมูลยังเก็บเป็นกก. กับกม. เหมือนเดิม สลับไปมาตัวเลขก็ไม่เปลี่ยน ส่วนเมมเบอร์เลือกหน่วยของตัวเองในพอร์ทัลได้
- **Cardio in the member portal.** Members see each interval with its zone and bpm, log cardio with the new form, and get a **Progress** tab with this week's cardio, their VO₂max trend and your latest feedback. A new portal settings page holds units and language.
  - th: ในพอร์ทัล เมมเบอร์จะเห็นอินเทอร์วัลแต่ละช่วงพร้อมโซนและ bpm บันทึกคาร์ดิโอด้วยฟอร์มใหม่ และมีแท็บ **พัฒนาการ** ที่รวมคาร์ดิโอสัปดาห์นี้ แนวโน้ม VO₂max และฟีดแบ็กล่าสุดจากคุณ หน้าตั้งค่าใหม่ของพอร์ทัลใช้เลือกหน่วยและภาษา
- **AI writes cardio with intervals** and uses the member's HR zones when they have them. It never invents max HR, LTHR or VO₂max.
  - th: AI เขียนคาร์ดิโอแบบมีอินเทอร์วัลได้ และใช้ HR zone ของเมมเบอร์ถ้ามี โดยไม่เดาชีพจรสูงสุด LTHR หรือ VO₂max เอง
- A new **Cardio** guide explains all of this, in English and Thai.
  - th: มีคู่มือ **Cardio** ใหม่ อธิบายทุกเรื่องข้างบน ทั้งภาษาไทยและอังกฤษ
- Pick **Multi-movement** as a pattern, and give an exercise up to 5 patterns.
  - th: เลือกแพตเทิร์น **Multi-movement** ได้แล้ว และท่าหนึ่งใส่แพตเทิร์นได้สูงสุด 5 แบบ
- The AI brief can now be up to 6,000 characters, and the generate page shows how much you've used.
  - th: บรีฟให้ AI ยาวได้ถึง 6,000 ตัวอักษร และหน้าสร้างโปรแกรมจะแสดงว่าใช้ไปเท่าไรแล้ว

### Fixed
- Form fields look and size the same across the app, and buttons match the field height.
  - th: ช่องกรอกทั้งแอปหน้าตาและขนาดเท่ากันแล้ว ปุ่มก็สูงเท่าช่องกรอก
- Thai text uses the right font in Safari too.
  - th: ข้อความภาษาไทยใช้ฟอนต์ถูกตัวบน Safari ด้วยแล้ว
- Error messages name the field that needs fixing.
  - th: ข้อความแจ้งข้อผิดพลาดบอกชื่อช่องที่ต้องแก้แล้ว
- Small fixes to the ⌘K hint, the roster hover and duplicate tags.
  - th: แก้จุดเล็ก ๆ ที่ปุ่มลัด ⌘K การชี้เมาส์ในรายชื่อเมมเบอร์ และแท็กซ้ำ

## v0.1.40 — 2026-11-20

### New
- Four new role labels: **Movement Prep**, **Strength / Supplemental**, **Conditioning** and **Mobility / Recovery**. Exercises now sort in this order: Movement Prep, Power, Primary, Secondary, Strength, Strength / Supplemental, Auxiliary, Core, Conditioning, Mobility / Recovery. Each label has a clearer meaning, and the AI reads it.
  - th: มีป้ายบทบาทใหม่ 4 แบบ: **Movement Prep**, **Strength / Supplemental**, **Conditioning** และ **Mobility / Recovery** ท่าในเซสชันจะเรียงตามลำดับนี้: Movement Prep, Power, Primary, Secondary, Strength, Strength / Supplemental, Auxiliary, Core, Conditioning, Mobility / Recovery แต่ละป้ายมีความหมายชัดขึ้น และ AI ใช้ความหมายนี้ด้วย
- When you paste notes or add an exercise that has no role yet, it gets one from its name: warm-ups get Movement Prep, bike, erg, sled and intervals get Conditioning, and stretches and foam rolling get Mobility / Recovery.
  - th: เมื่อวางโน้ตหรือเพิ่มท่าที่ยังไม่มีบทบาท ระบบจะเลือกบทบาทจากชื่อท่า: ท่าวอร์มอัพเป็น Movement Prep จักรยาน เครื่อง erg สเลด และอินเทอร์วัลเป็น Conditioning ส่วนการยืดเหยียดและโฟมโรลเป็น Mobility / Recovery
- Search the guides: press **⌘K** (Ctrl+K on Windows) on any page and type a question, like "sick" or "ป่วย". Pick a result to jump straight to the step that answers it. The Guide page also has a search bar, and `/` opens it there.
  - th: ค้นหาในคู่มือได้แล้ว: กด **⌘K** (Ctrl+K บน Windows) จากหน้าไหนก็ได้ แล้วพิมพ์คำถาม เช่น "ป่วย" หรือ "sick" เลือกผลลัพธ์แล้วจะพาไปที่ขั้นตอนที่ตอบเรื่องนั้นทันที หน้าคู่มือมีช่องค้นหาด้วย และกด `/` เพื่อเปิดได้

### Fixed
- If you already made your own label with the same name as a new built-in one (like "Conditioning"), both labels can be edited again. Yours shows a note asking you to rename it.
  - th: ถ้าคุณเคยสร้างป้ายชื่อเดียวกับป้ายใหม่ของระบบ (เช่น "Conditioning") ตอนนี้แก้ไขได้ทั้งสองป้ายแล้ว ป้ายของคุณจะมีข้อความเตือนให้เปลี่ยนชื่อ
- Long role label names stay on one line in Vocabulary.
  - th: ชื่อป้ายบทบาทที่ยาวแสดงเป็นบรรทัดเดียวในหน้า Vocabulary

## v0.1.39 — 2026-11-20

### New
- A new guide, Programs & weeks, explains with pictures how weeks, A/B weeks, missed sessions, mid-block edits and moving Week 1 later work. Find it under Guide.
  - th: มีคู่มือใหม่ "โปรแกรมและสัปดาห์" อธิบายพร้อมภาพว่าสัปดาห์ สัปดาห์ A/B เซสชันที่ขาด การแก้กลางบล็อก และการเลื่อนสัปดาห์ที่ 1 ออกไปทำงานยังไง ดูได้ที่เมนูคู่มือ
- Add the app to your iPhone home screen and it opens like an app, with the new PT icon.
  - th: เพิ่มแอปไว้ที่หน้าจอโฮมของ iPhone ได้แล้ว เปิดขึ้นมาเหมือนแอปทั่วไป พร้อมไอคอน PT ใหม่

### Changed
- Clients are now called Members in the menu and guides.
  - th: เมนูและคู่มือเรียกลูกค้าว่า "เมมเบอร์" แล้ว
- The language switch is now one click: tap it to swap between English and Thai.
  - th: ปุ่มเปลี่ยนภาษากดครั้งเดียวก็สลับไทย-อังกฤษได้เลย

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
  - th: เวลาคุณแจ้งบั๊ก ทีมซัพพอร์ตเปิดแอปในมุมมองของคุณได้แล้ว เห็นแบบเดียวกับที่คุณเห็นโดยไม่ต้องขอภาพหน้าจอ การเข้าดูแต่ละครั้งจำกัดเวลาและมีบันทึกไว้ ทีมซัพพอร์ตแก้อะไรไม่ได้ เว้นแต่จะตั้งใจเปิดสิทธิ์นั้นเอง ถ้าเข้าดูจากเรื่องที่คุณแจ้ง เรื่องนั้นจะขึ้นว่า "ทีมซัพพอร์ตเข้าไปดูบัญชีของคุณเพื่อตรวจเรื่องนี้"

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
  - th: พอการแก้ไขขึ้นระบบแล้ว คุณกด 👍 หรือ 👎 ได้ ถ้ากด 👎 เรื่องจะกลับมาเปิดใหม่ และเขียนบอกสั้น ๆ ได้ว่ายังผิดตรงไหน

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
  - th: ฟีดแบ็กมีสถานะใหม่ **กำลังดำเนินการ** คั่นระหว่าง “รับเรื่องแล้ว” กับ “เสร็จแล้ว” ดูได้ว่ามีคนลงมือแก้เรื่องที่คุณแจ้งแล้วหรือยัง และพอเรื่องเปลี่ยนเป็นกำลังดำเนินการ ก็จะได้อีเมลแจ้งเหมือนสถานะอื่น ๆ

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
  - th: คลิกรหัสฟีดแบ็ก (เช่น FB-012) เพื่อคัดลอก

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
  - th: ฟีดแบ็กซ้ำ: ลิงก์เรื่องหนึ่งไปยังเรื่องก่อนหน้าที่แจ้งปัญหาเดียวกันได้ และจะขึ้นว่า "Duplicate of FB-nnn" พอเรื่องต้นทางแก้เสร็จหรือปิดไป เรื่องที่ซ้ำก็ปิดตามไปด้วย แล้วระบบจะบอกคนที่แจ้งไว้ให้รู้
- For admins: each ticket shows whether it's ready for an automatic fix, and links to the fix's pull request once one exists.
  - th: สำหรับแอดมิน: ฟีดแบ็กแต่ละเรื่องบอกว่าพร้อมให้แก้อัตโนมัติหรือยัง และพอมี pull request ของการแก้แล้ว ก็จะลิงก์ไปให้ด้วย
- Feedback replies come faster: the agent now checks for new tickets every minute and only runs when there's something to answer.
  - th: ตอบฟีดแบ็กเร็วขึ้น: เอเจนต์เช็กเรื่องใหม่ทุกนาที และทำงานเฉพาะตอนที่มีอะไรต้องตอบ

### Fixed
- On phones, the mute bell stays on the ticket's header line.
  - th: บนมือถือ กระดิ่งปิดเสียงยังอยู่ที่บรรทัดหัวของฟีดแบ็กเหมือนเดิม

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
  - th: การ์ดฟีดแบ็กใช้กับคีย์บอร์ดหรือโปรแกรมอ่านหน้าจอได้ง่ายขึ้น: กรอบโฟกัสชัดขึ้น พื้นที่คลิกใหญ่ขึ้น มีหัวข้อทุกการ์ด และชื่อปุ่มบอกด้วยว่าเป็นของฟีดแบ็กเรื่องไหน
- Week cells showing "+n" no longer overflow.
  - th: ช่องสัปดาห์ที่แสดง "+n" ไม่ล้นอีกแล้ว

## v0.1.19 — 2026-11-11

### New
- Feedback tickets close themselves when their fix goes live. The ticket shows "Release marked it Done" with the version, and the reporter is told to reload.
  - th: พอการแก้ของเรื่องไหนขึ้นระบบจริง เรื่องนั้นจะปิดเอง โดยขึ้นว่า "Release marked it Done" พร้อมเลขเวอร์ชัน และบอกคนที่แจ้งให้รีโหลดหน้า
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
  - th: แก้ฟีดแบ็กหลังส่งไปแล้วได้: เปลี่ยนข้อความหรือรูปภาพก็ได้ เรื่องนั้นจะบอกเวลาที่แก้ และอีกฝ่ายจะเห็นว่ามีการแก้ที่ยังไม่ได้อ่าน
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
  - th: แนบรูปในฟีดแบ็กและคำตอบได้ จะเลือกไฟล์หรือวางรูปก็ได้ ระบบย่อขนาดให้ก่อนอัปโหลด คลิกรูปไหนก็ดูขนาดเต็มได้
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
  - th: รายละเอียดของฟีดแบ็กพับเก็บไว้หลังปุ่ม Details ปุ่มนี้จำไว้ด้วยว่าคุณเลือกเปิดหรือปิด

### Fixed
- Feedback ticket pages that can no longer be opened now show as plain text instead of a broken link.
  - th: หน้าที่อ้างถึงในฟีดแบ็กแต่เปิดไม่ได้แล้ว จะขึ้นเป็นข้อความธรรมดาแทนลิงก์เสีย

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
  - th: ในฟีดแบ็ก ถ้าเปิดหน้าที่อ้างถึงไม่ได้หรือหาจุดที่ชี้ไว้ไม่เจอ ปุ่ม "Show me" จะเปิดภาพหน้าจอแทน และภาพหน้าจอก็เปิดเป็นขนาดเต็ม
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
  - th: คำตอบฟีดแบ็กอาจมาจากผู้ช่วย AI ซึ่งจะมีป้าย "AI answer" กำกับ ผู้ช่วยนี้ตอบเฉพาะเรื่องที่ตรวจกับแอปได้ เช่น "มีฟีเจอร์นี้อยู่แล้ว" หรือ "เพิ่มเข้ามาหลังจากคุณแจ้ง" ถ้าคำตอบผิด ตอบกลับในฟีดแบ็กเรื่องนั้นได้เลย
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
