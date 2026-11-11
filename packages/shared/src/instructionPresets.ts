// ---------------------------------------------------------------------------
// Built-in instruction templates. Read-only and versioned with the code: every
// trainer sees the current set under Rules on the Generate page, and can copy
// one into their own library to edit. Each `content` lands in the prompt as
// written (headed lists), so keep it under InstructionTemplateInput's 4000
// characters. `sources` were each checked against PubMed or the publisher;
// the numbers in the rules are a practical synthesis, not quotes. Client-specific facts (injuries, equipment) never belong here.
// Deloads are not a template: the app already applies the trainer's deload
// rule (deload.ts).
// ---------------------------------------------------------------------------

export interface InstructionPreset {
  key: string;
  name: string;
  /** One plain line: what it does / when to switch it on. */
  summary: string;
  /** Short citations — shown to the trainer, never sent to the model. */
  sources: string[];
  content: string;
}

export const INSTRUCTION_PRESETS: readonly InstructionPreset[] = [
  {
    key: "weekly-volume",
    name: "Weekly volume",
    summary: "Enough hard sets per muscle to grow, without junk volume.",
    sources: ["Schoenfeld 2017 dose-response meta-analysis", "Pelland dose-response meta-regression (preprint 2024)"],
    content: `Rules:
- Aim for roughly 10-20 hard sets per muscle group per week; start near 10-12 and add sets only when progress stalls.
- Smaller or secondary roles (e.g. biceps hit by rows) can sit at the low end: count indirect work as about half a set.
- Keep any single session to about 8 hard sets per muscle group; split the rest across other days.
- Stop adding sets once the client's logs show missed reps or RPE creeping up at the same loads.`,
  },
  {
    key: "effort-rir",
    name: "Effort and proximity to failure",
    summary: "Train hard enough to count, far enough from failure to recover.",
    sources: ["Refalo 2023 failure meta-analysis", "Robinson 2024 proximity to failure", "Zourdos 2016 RIR scale"],
    content: `Rules:
- Working sets finish at 1-3 reps in reserve (RPE 7-9); never program a set to failure on a main barbell lift.
- Compound lifts: stop at 2-3 reps in reserve. Isolation and machine work: 0-2 reps in reserve, last set can go to 0-1.
- Early in a block sit at the easy end of each range, then move toward the hard end over the weeks.
- Write the target effort on every working set as RPE.`,
  },
  {
    key: "reps-and-rest",
    name: "Rep ranges and rest",
    summary: "Heavy where it pays, lighter where joints and fatigue matter.",
    sources: ["Schoenfeld 2017 low- vs high-load meta-analysis", "Schoenfeld 2016 interset rest"],
    content: `Rules:
- Main compound lifts: 5-8 reps. Secondary compounds: 6-12 reps. Isolation and machine work: 10-20 reps.
- Strength-focused clients: put the main lift at 3-6 reps and keep accessories at 6-12.
- Rest 2-3 minutes after heavy compounds, 60-90 seconds after isolation work; state the rest on each exercise.
- Do not give bodyweight-only or single-joint exercises long rest; keep sessions moving.`,
  },
  {
    key: "frequency-split",
    name: "Frequency and split",
    summary: "Hit each muscle at least twice a week, spread across the week.",
    sources: ["Schoenfeld 2016 frequency meta-analysis"],
    content: `Rules:
- Train every major muscle group at least twice per week, with at least 48 hours between sessions that load the same muscle hard.
- Match the split to the sessions per week: 2-3 days full body or upper/lower, 4 days upper/lower, 5+ days push/pull/legs with upper or lower on the extra days.
- Put the lift the client most wants to improve first in the week and first in the session.
- Spread weekly volume roughly evenly across the days a muscle is trained.`,
  },
  {
    key: "double-progression",
    name: "Double progression",
    summary: "Add reps first, then load, using RPE to keep it honest.",
    sources: ["Helms 2016 RIR-based RPE", "Zourdos 2016 RIR scale"],
    content: `Rules:
- Give each exercise a rep range. When every working set reaches the top of the range at the target RPE, raise the load next time.
- Load steps: 2.5 kg on lower-body and barbell lifts, 1-2 kg on upper-body and isolation lifts; after a load increase reps drop back to the bottom of the range.
- If the client logs RPE 9.5+ or misses the bottom of the range, hold the load; if that happens two weeks in a row, drop the load about 5-10%.
- Keep the same exercise and rep range for at least 3-4 weeks so progress can be measured.`,
  },
  {
    key: "exercise-selection",
    name: "Exercise selection",
    summary: "Full range of motion, loaded at long muscle lengths, with fewer exercises done well.",
    sources: ["Wolf 2023 range of motion meta-analysis", "Maeo 2023 overhead vs neutral triceps training"],
    content: `Constraints:
- Use full range of motion; prefer variations that load the muscle in its stretched position (e.g. incline curls, Romanian deadlifts, overhead triceps extensions, deep leg press).
- Pick 1-2 main compound lifts per session, then accessories that fill the gaps; do not repeat the same movement pattern with the same muscles more than twice in a session.
- Prefer machine, cable or dumbbell variations for the last exercise of a session when fatigue is high.
- Keep exercises stable from week to week inside a block; rotate accessories at the next block.`,
  },
  {
    key: "warmup",
    name: "Warm-up and session order",
    summary: "A short ramp-up before heavy lifts, then work in order of priority.",
    sources: ["Jeffreys 2007 RAMP warm-up (practitioner article)"],
    content: `Steps:
- Open each session with 3-5 minutes of light general work, then 1-2 mobility or activation drills for the first lift's main joints.
- Before the first heavy compound, add 2-3 ramping warm-up sets (about 50%, 70%, 85% of the working load); skip these ramps for later exercises that use lighter weights.
- Order exercises by priority: heavy compounds first, accessories next, isolation and core last.
- Keep warm-up sets out of the weekly hard-set count and label them as warm-up.`,
  },
  {
    key: "short-sessions",
    name: "Short on time (45 min)",
    summary: "When the client can only give 45 minutes: keep the work that counts.",
    sources: ["Iversen 2021 time-efficient training review"],
    content: `Rules:
- Cap the session at about 45 minutes including warm-up: 5-6 exercises, 2-4 hard sets each.
- Pair non-competing exercises as supersets (e.g. upper push with upper pull, or a quad lift with a hamstring curl) to keep rest at 60-90 seconds.
- Keep the main compound lifts and drop isolation work first; hold volume near the low end of the weekly range.
- Skip long mobility blocks; use the first warm-up sets of the main lift as the warm-up.`,
  },
];

export const instructionPreset = (key: string): InstructionPreset | undefined =>
  INSTRUCTION_PRESETS.find((p) => p.key === key);
