import { estimate1rm } from "@pt/shared";
import type {
  AiDraftDto,
  ClientDto,
  GenerationDto,
  HistoryEntryDto,
  InstructionTemplateDto,
  ProgramDto,
  ProgramSessionDto,
  SessionLogInput,
  TrainerApi,
} from "../types";
import { clients as seedClients, exercises, logs as seedLogs, programs as seedPrograms } from "./data";

const uuid = () => crypto.randomUUID();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const seedTemplates: InstructionTemplateDto[] = [
  {
    id: "tpl-beginner-caps",
    name: "Beginner — conservative caps",
    content:
      "Rules:\n- Cap all working sets at RPE 8; never prescribe RPE 9–10.\n- Progress main lifts by smallest available jump (2.5 kg lower-body, 1–2.5 kg upper-body).\n- Keep at least one repetition in reserve on the final set of each exercise.",
    updatedAt: "2026-09-20T09:00:00Z",
  },
  {
    id: "tpl-block-structure",
    name: "Block structure conventions",
    content:
      "Steps:\n- 4-week blocks: 3 accumulation weeks, 1 deload week at ~60% volume.\n- Each session: 1 warm-up + 2–4 working sets per main lift.\n- Order: main compound first, accessories after, core last.",
    updatedAt: "2026-09-18T14:30:00Z",
  },
  {
    id: "tpl-home-gym",
    name: "Home-gym equipment constraints",
    content:
      "Constraints:\n- Only: barbell, adjustable dumbbells up to 40 kg, pull-up bar, bench.\n- No machines, no cables, no specialty bars.\n- Substitute any machine movement with a free-weight equivalent.",
    updatedAt: "2026-09-15T18:00:00Z",
  },
];

/** Mutable in-memory demo state. Reset by reloading the page module. */
const state = {
  clients: [...seedClients],
  programs: [...seedPrograms],
  logs: [...seedLogs],
  templates: [...seedTemplates],
  generations: [] as GenerationDto[],
};

const nameOf = (exerciseId: string) =>
  exercises.find((e) => e.id === exerciseId)?.name ?? exerciseId;

function withNames(p: ProgramDto): ProgramDto {
  return {
    ...p,
    sessions: p.sessions.map((s) => ({
      ...s,
      exercises: s.exercises.map((e) => ({ ...e, exerciseName: nameOf(e.exerciseId) })),
    })),
  };
}

/** Maya's handcrafted draft — references her real logged numbers + limitation. */
function mayaDraft(basedOn: ProgramDto | null): AiDraftDto {
  return {
    name: "Strength Base B",
    rationale:
      "Squat progressed 50→62.5kg over 8 weeks (e1RM now ~77kg) with AMRAP reps climbing 6→7 at RPE 9 — top sets move to 65kg, backoff stays at 60kg. Chin-ups hit 6 reps unassisted twice, so band assistance drops one level; target 3×AMRAP. Landmine press crept to RPE 8 at 35kg — hold load, add one set (shoulder tolerance has been fine). Lat pulldown +4.5kg in 8 weeks with reps held: 54.5kg next. Deadlift still finding its feet at 80kg×5@8 — add 5kg. Overhead pressing remains excluded per shoulder limitation; landmine stays the primary press. Volume: +2 sets/week total, well within recovery at 4 days.",
    clientSummary:
      "Same 4-day split you've been running. Squats go up to 65kg on top sets — your last AMRAP at 62.5kg×7 says you're ready. Chin-ups lose a band level, and deadlifts jump to 85kg. Everything else stays familiar.",
    sessions: [
      { name: "Day 1 — Lower", exercises: [
        { exerciseId: "ex-squat", prescribedSets: [
          { setNumber: 1, type: "warm_up", reps: 5, amrap: false, restSeconds: 90 },
          { setNumber: 2, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 180 },
          { setNumber: 3, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 180 },
          { setNumber: 4, type: "backoff", reps: 5, amrap: true, targetRpe: 9, restSeconds: 180 },
        ], notes: "Top sets 65kg; backoff 60kg" },
        { exerciseId: "ex-rdl", prescribedSets: [
          { setNumber: 1, type: "working", reps: 8, amrap: false, targetRpe: 7, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 8, amrap: false, targetRpe: 7, restSeconds: 120 },
          { setNumber: 3, type: "working", reps: 8, amrap: false, targetRpe: 7, restSeconds: 120 },
        ] },
        { exerciseId: "ex-hlr", prescribedSets: [
          { setNumber: 1, type: "working", reps: 10, amrap: false, restSeconds: 60 },
          { setNumber: 2, type: "working", reps: 10, amrap: false, restSeconds: 60 },
          { setNumber: 3, type: "working", reps: 10, amrap: false, restSeconds: 60 },
        ] },
      ]},
      { name: "Day 2 — Upper", exercises: [
        { exerciseId: "ex-landmine", prescribedSets: [
          { setNumber: 1, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 3, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 4, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
        ], notes: "Hold 35kg — added a set" },
        { exerciseId: "ex-pulldown", prescribedSets: [
          { setNumber: 1, type: "working", reps: 10, amrap: false, targetRpe: 8, restSeconds: 90 },
          { setNumber: 2, type: "working", reps: 10, amrap: false, targetRpe: 8, restSeconds: 90 },
          { setNumber: 3, type: "working", reps: 10, amrap: true, targetRpe: 9, restSeconds: 90 },
        ], notes: "54.5kg" },
        { exerciseId: "ex-facepull", prescribedSets: [
          { setNumber: 1, type: "working", reps: 15, amrap: false, restSeconds: 60 },
          { setNumber: 2, type: "working", reps: 15, amrap: false, restSeconds: 60 },
          { setNumber: 3, type: "working", reps: 15, amrap: false, restSeconds: 60 },
        ] },
      ]},
      { name: "Day 3 — Lower", exercises: [
        { exerciseId: "ex-dead", prescribedSets: [
          { setNumber: 1, type: "warm_up", reps: 3, amrap: false, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 210 },
          { setNumber: 3, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 210 },
        ], notes: "85kg working sets" },
        { exerciseId: "ex-bss", prescribedSets: [
          { setNumber: 1, type: "working", reps: 10, amrap: false, targetRpe: 7, restSeconds: 90 },
          { setNumber: 2, type: "working", reps: 10, amrap: false, targetRpe: 7, restSeconds: 90 },
          { setNumber: 3, type: "working", reps: 10, amrap: false, targetRpe: 7, restSeconds: 90 },
        ] },
        { exerciseId: "ex-plank", prescribedSets: [
          { setNumber: 1, type: "working", reps: 45, amrap: false, restSeconds: 60 },
          { setNumber: 2, type: "working", reps: 45, amrap: false, restSeconds: 60 },
        ], notes: "45s holds" },
      ]},
      { name: "Day 4 — Upper", exercises: [
        { exerciseId: "ex-incline", prescribedSets: [
          { setNumber: 1, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 3, type: "working", reps: 8, amrap: true, targetRpe: 9, restSeconds: 120 },
        ] },
        { exerciseId: "ex-crow", prescribedSets: [
          { setNumber: 1, type: "working", reps: 12, amrap: false, targetRpe: 7, restSeconds: 90 },
          { setNumber: 2, type: "working", reps: 12, amrap: false, targetRpe: 7, restSeconds: 90 },
          { setNumber: 3, type: "working", reps: 12, amrap: false, targetRpe: 7, restSeconds: 90 },
        ] },
        { exerciseId: "ex-chin", prescribedSets: [
          { setNumber: 1, type: "working", reps: 6, amrap: true, targetRpe: 9, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 6, amrap: true, targetRpe: 9, restSeconds: 120 },
          { setNumber: 3, type: "working", reps: 6, amrap: true, targetRpe: 9, restSeconds: 120 },
        ], notes: "Thinner band — you hit 6 unassisted-rep equivalents" },
        { exerciseId: "ex-curl", prescribedSets: [
          { setNumber: 1, type: "working", reps: 12, amrap: false, restSeconds: 60 },
          { setNumber: 2, type: "working", reps: 12, amrap: false, restSeconds: 60 },
        ] },
      ]},
    ],
  };
}

/** Generic fallback for clients without a handcrafted draft. */
function genericDraft(): AiDraftDto {
  return {
    name: "Next Block — Draft",
    rationale: "Generic progression: +2.5% on primary lifts, volume held.",
    clientSummary: "Same split, small jumps on the main lifts.",
    sessions: [{ name: "Day 1", exercises: [{ exerciseId: "ex-squat", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8 }] }] }],
  };
}

export const mockApi: TrainerApi = {
  async providers() {
    await delay(150);
    return [
      { id: "zai", label: "Z.ai GLM Flash", model: "glm-4.5-flash", configured: true },
      { id: "openai", label: "OpenAI", model: "gpt-4o-mini", configured: true },
      { id: "mock", label: "Mock (canned draft)", model: "mock-draft-v1", configured: true },
    ];
  },

  async instructionTemplates() {
    await delay(150);
    return [...state.templates];
  },

  async createInstructionTemplate({ name, content }) {
    await delay(250);
    const tpl: InstructionTemplateDto = {
      id: `tpl-${uuid().slice(0, 8)}`,
      name,
      content,
      updatedAt: new Date().toISOString(),
    };
    state.templates = [...state.templates, tpl];
    return tpl;
  },

  async updateInstructionTemplate(id, { name, content }) {
    await delay(250);
    let updated: InstructionTemplateDto | undefined;
    state.templates = state.templates.map((t) => {
      if (t.id !== id) return t;
      updated = { ...t, name, content, updatedAt: new Date().toISOString() };
      return updated;
    });
    if (!updated) throw new Error("template not found");
    return updated;
  },

  async deleteInstructionTemplate(id) {
    await delay(200);
    state.templates = state.templates.filter((t) => t.id !== id);
  },


  async clients() {
    await delay(250);
    return state.clients.filter((c) => c.status !== "archived");
  },

  async client(id) {
    await delay(250);
    const client = state.clients.find((c) => c.id === id);
    if (!client) throw new Error("client not found");
    const programs = state.programs.filter((p) => p.clientId === id).map(withNames);
    return {
      client,
      currentProgram: programs.find((p) => p.status === "active") ?? null,
      programs,
    };
  },

  async createClient(input) {
    await delay(350);
    const created = { ...input, id: uuid(), status: "active" as const };
    state.clients.push(created);
    return created;
  },

  async updateClient(id, patch) {
    await delay(300);
    const i = state.clients.findIndex((c) => c.id === id);
    state.clients[i] = { ...state.clients[i], ...patch };
    return state.clients[i];
  },

  async program(id) {
    await delay(250);
    const p = state.programs.find((x) => x.id === id);
    if (!p) throw new Error("program not found");
    return withNames(p);
  },

  async programs(clientId) {
    await delay(250);
    return state.programs.filter((p) => p.clientId === clientId).map(withNames);
  },

  async saveProgram(id, sessions: ProgramSessionDto[]) {
    await delay(400);
    const i = state.programs.findIndex((p) => p.id === id);
    state.programs[i] = { ...state.programs[i], sessions, version: state.programs[i].version + 1 };
    return withNames(state.programs[i]);
  },

  async setProgramStatus(id, status) {
    await delay(300);
    const i = state.programs.findIndex((p) => p.id === id);
    const p = state.programs[i];
    if (status === "active" && p.clientId) {
      for (const other of state.programs) {
        if (other.clientId === p.clientId && other.status === "active" && other.id !== id) {
          other.status = "archived";
        }
      }
      if (!p.activatedAt) p.activatedAt = new Date().toISOString();
    }
    p.status = status;
    return withNames(p);
  },

  async createProgram(input) {
    await delay(450);
    const program: ProgramDto = {
      id: `pg-${uuid().slice(0, 8)}`,
      clientId: input.clientId,
      name: input.name,
      description: input.description ?? null,
      status: "draft",
      version: 1,
      aiAssisted: false,
      createdFromProgramId: null,
      sessions: input.sessions,
      createdAt: new Date().toISOString(),
      activatedAt: null,
      phasing: input.phasing ?? null,
    };
    state.programs = [...state.programs, program];
    return withNames(program);
  },

  async exercises(query) {
    await delay(180);
    const q = (query ?? "").toLowerCase();
    return exercises.filter((e) => !q || e.name.toLowerCase().includes(q));
  },

  async createExercise(input) {
    await delay(300);
    const created = { ...input, id: uuid(), secondaryMuscleGroups: [] };
    exercises.push(created);
    return created;
  },

  async history(clientId): Promise<HistoryEntryDto[]> {
    await delay(300);
    const byExercise = new Map<string, { sets: string[]; best: number }>();
    for (const log of state.logs.filter((l) => l.clientId === clientId)) {
      for (const s of log.sets) {
        if (s.type !== "working") continue;
        const entry = byExercise.get(s.exerciseId) ?? { sets: [], best: 0 };
        entry.sets.push(
          `${s.weightKg ? `${s.weightKg}kg × ` : ""}${s.reps}${s.rpe ? ` @ RPE ${s.rpe}` : ""}`
        );
        entry.best = Math.max(entry.best, estimate1rm(s.weightKg ?? 0, s.reps));
        byExercise.set(s.exerciseId, entry);
      }
    }
    return [...byExercise.entries()].map(([id, h]) => ({
      exerciseId: id,
      exerciseName: nameOf(id),
      recentSets: h.sets.slice(-6),
      bestE1rm: h.best,
    }));
  },

  async sessionLogs(clientId) {
    await delay(250);
    return state.logs
      .filter((l) => l.clientId === clientId)
      .map((l) => ({
        id: l.sessionLogId,
        clientId: l.clientId,
        programId: l.programId,
        programSessionId: null,
        date: l.date,
        notes: l.notes ?? null,
        perceivedEnergy: l.perceivedEnergy ?? null,
        sets: l.sets.map((s) => ({ ...s })),
      }));
  },

  async logSession(input: SessionLogInput) {
    await delay(500);
    state.logs.push({
      sessionLogId: uuid(),
      clientId: input.clientId,
      programId: input.programId,
      date: input.date,
      perceivedEnergy: input.perceivedEnergy,
      notes: input.notes,
      sets: input.sets.map((s) => ({
        exerciseId: s.exerciseId,
        setNumber: s.setNumber,
        type: s.type,
        weightKg: s.weightKg,
        reps: s.reps,
        rpe: s.rpe,
      })),
    });
    return { ok: true };
  },

  async generate(input) {
    // Simulated model latency — the demo should feel like real work is happening.
    await delay(2200);
    const client = state.clients.find((c) => c.id === input.clientId);
    const basedOn = input.basedOnProgramId
      ? state.programs.find((p) => p.id === input.basedOnProgramId) ?? null
      : null;
    const draft = client?.id === "cl-maya" ? mayaDraft(basedOn) : genericDraft();
    // Mirror what the real API guarantees: every draft exercise is nameable.
    for (const s of draft.sessions) {
      for (const e of s.exercises) {
        if (!e.exerciseName && e.exerciseId) e.exerciseName = nameOf(e.exerciseId);
      }
    }
    const gen: GenerationDto = {
      id: uuid(),
      clientId: input.clientId,
      basedOnProgramId: input.basedOnProgramId ?? null,
      providerId: input.providerId ?? "zai",
      model: input.providerId === "openai" ? "gpt-4o-mini" : "glm-4.5-flash",
      status: "validated",
      draft,
      error: null,
      createdAt: new Date().toISOString(),
    };
    state.generations.unshift(gen);
    return gen;
  },

  async generations(clientId) {
    await delay(200);
    return state.generations.filter((g) => g.clientId === clientId);
  },

  async approveGeneration(id) {
    await delay(600);
    const gen = state.generations.find((g) => g.id === id);
    if (!gen || !gen.draft) throw new Error("generation not found");
    const program: ProgramDto = {
      id: uuid(),
      clientId: gen.clientId,
      name: gen.draft.name,
      description: gen.draft.clientSummary,
      status: "draft",
      version: 1,
      aiAssisted: true,
      createdFromProgramId: gen.basedOnProgramId,
      createdAt: new Date().toISOString(),
      sessions: gen.draft.sessions.map((s, si) => ({
        id: uuid(),
        name: s.name,
        order: si,
        notes: s.notes,
        exercises: s.exercises.map((e, ei) => ({
          id: uuid(),
          exerciseId: e.exerciseId ?? e.exerciseName ?? uuid(),
          exerciseName: e.exerciseName ?? nameOf(e.exerciseId ?? ""),
          order: ei,
          prescribedSets: e.prescribedSets,
          notes: e.notes,
        })),
      })),
    };
    state.programs.unshift(program);
    gen.status = "approved";
    return withNames(program);
  },

  async rejectGeneration(id) {
    await delay(300);
    const gen = state.generations.find((g) => g.id === id);
    if (gen) gen.status = "rejected";
    return gen!;
  },
};
