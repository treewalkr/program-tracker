import {
  aiDraftToDiffSource,
  cardioBehindSignal,
  chainSetCounts,
  computeSignals,
  diffRowsToText,
  diffSources,
  draftNoticeText,
  estimate1rm,
  KINETIC_CHAIN_DEFAULTS,
  KineticChainInput,
  KNOWN_PROVIDERS,
  mockApplyProposal,
  mockChatReply,
  mockDistillPreferences,
  mockProposal,
  mockReviseDraft,
  programWeeksToDiffSource,
  ProgramWeeksDocument,
  selectExamples,
  sortExercisesByRole,
  placeWeeks,
  sessionKey,
  stampWeeks,
  weekSummary,
  type PreferenceSignal,
} from "@pt/shared";
import type { Signal as SignalDto } from "@pt/shared";
import type {
  AiDraftDto,
  ChainWeekDto,
  ChatMessageDto,
  ClientDto,
  ClientMessageDto,
  ExerciseDto,
  GenerationDto,
  HistoryEntryDto,
  InstructionTemplateDto,
  KineticChainDto,
  PeriodizationSchemeDto,
  PreferencesDto,
  ProgramDto,
  ProgramExampleDto,
  ProgramPhasingDto,
  ProgramSessionDto,
  ProgramWeekDto,
  SessionLogInput,
  TrainerApi,
} from "../types";
import { activeSignals, snoozeUntil } from "../../signals";
import {
  clients as seedClients,
  examples as seedExamples,
  exercises,
  logs as seedLogs,
  patternOf,
  programs as seedPrograms,
  schemes as seedSchemes,
} from "./data";

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
      "Steps:\n- 4-week blocks: 3 accumulation weeks, 1 deload week at ~60% volume.\n- Each session: 2–4 working sets per main lift.\n- Order: main compound first, accessories after, core last.",
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

const seedPreferences: PreferencesDto[] = [
  {
    id: "pref-trainer-style",
    clientId: null,
    clientName: null,
    document:
      "Rules:\n- Prefer free-weight compound movements first in every session; machines only as accessories.\n- Cap main-lift top sets at RPE 8; progress by 2.5 kg when all target reps are hit.\n- 4-week blocks: 3 accumulation weeks, then a deload at ~60% volume.",
    providerId: "zai",
    model: "glm-4.5-flash",
    updatedAt: "2026-10-20T08:00:00Z",
  },
];

const CHAIN_IDS = [
  "chain-intrinsic",
  "chain-deep-longitudinal",
  "chain-lateral",
  "chain-posterior-spiral",
  "chain-anterior-spiral",
];

const seedChains: KineticChainDto[] = KINETIC_CHAIN_DEFAULTS.map((c, i) => ({
  id: CHAIN_IDS[i],
  name: c.name,
  muscleGroups: [...c.muscleGroups],
  sortOrder: c.sortOrder,
}));

/** Mutable in-memory demo state. Reset by reloading the page module. */
const state = {
  clients: [...seedClients],
  programs: [...seedPrograms],
  logs: [...seedLogs],
  templates: [...seedTemplates],
  schemes: [...seedSchemes],
  chains: seedChains.map((c) => ({ ...c, muscleGroups: [...c.muscleGroups] })),
  generations: [] as GenerationDto[],
  clientMessages: [] as ClientMessageDto[],
  preferences: [...seedPreferences] as PreferencesDto[],
  messages: [] as (ChatMessageDto & { clientId: string })[],
  examples: [...seedExamples] as ProgramExampleDto[],
};

/** JSON with object keys sorted — mirrors the api: jsonb does not keep key order, so compare canonically. */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val
  );
}

function reviseDraftInState(s: typeof state, id: string, message: string): GenerationDto {
  const gen = s.generations.find((g) => g.id === id);
  if (!gen || gen.status !== "validated" || !gen.draft) {
    throw new Error("generation is not validated");
  }
  const child: GenerationDto = {
    id: uuid(),
    clientId: gen.clientId,
    basedOnProgramId: gen.basedOnProgramId,
    kind: gen.kind ?? "block",
    targetWeek: gen.targetWeek ?? null,
    direction: gen.direction ?? null,
    providerId: gen.providerId,
    model: gen.model,
    status: "validated",
    draft: mockReviseDraft(gen.draft as any, message) as any,
    error: null,
    parentGenerationId: gen.id,
    revisionMessage: message,
    instructions: null,
    rejectReason: null,
    approvedProgramId: null,
    exampleProgramIds: gen.exampleProgramIds ?? [],
    createdAt: new Date().toISOString(),
  };
  s.generations.unshift(child);
  return child;
}

/** Renumber within-day order 0..n-1 per weekday, keeping relative order. */
function withCompactOrder(sessions: ProgramSessionDto[]): ProgramSessionDto[] {
  const next = new Map<number, number>();
  const rank = [...sessions].sort(
    (a, b) => (a.weekday ?? 0) - (b.weekday ?? 0) || a.order - b.order || (a.kind === b.kind ? a.seq - b.seq : a.kind === "cardio" ? 1 : -1)
  );
  const orderOf = new Map<string, number>();
  for (const s of rank) {
    const d = s.weekday ?? 0;
    orderOf.set(s.id, next.get(d) ?? 0);
    next.set(d, (next.get(d) ?? 0) + 1);
  }
  return sessions.map((s) => ({ ...s, order: orderOf.get(s.id)! }));
}

const nameOf = (exerciseId: string) =>
  exercises.find((e) => e.id === exerciseId)?.name ?? exerciseId;

function withNames(p: ProgramDto): ProgramDto {
  return {
    ...p,
    weeks: p.weeks.map((w) => ({
      ...w,
      sessions: w.sessions.map((s) => ({
        ...s,
        exercises: s.exercises.map((e) => ({ ...e, exerciseName: nameOf(e.exerciseId) })),
      })),
    })),
  };
}

/** Join the live program into an example row — the library never snapshots. */
function exampleDto(e: ProgramExampleDto): ProgramExampleDto {
  const live = state.programs.find((p) => p.id === e.programId);
  return { ...structuredClone(e), program: live ? withNames(live) : structuredClone(e.program) };
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
      { name: "Lower", exercises: [
        { exerciseId: "ex-squat", role: "primary", prescribedSets: [
          { setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 180 },
          { setNumber: 2, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 180 },
          { setNumber: 3, type: "backoff", reps: 5, amrap: true, targetRpe: 9, restSeconds: 180 },
        ], notes: "Top sets 65kg; backoff 60kg" },
        { exerciseId: "ex-rdl", role: "strength", prescribedSets: [
          { setNumber: 1, type: "working", reps: 8, amrap: false, targetRpe: 7, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 8, amrap: false, targetRpe: 7, restSeconds: 120 },
          { setNumber: 3, type: "working", reps: 8, amrap: false, targetRpe: 7, restSeconds: 120 },
        ] },
        { exerciseId: "ex-hlr", role: "core", prescribedSets: [
          { setNumber: 1, type: "working", reps: 10, amrap: false, restSeconds: 60 },
          { setNumber: 2, type: "working", reps: 10, amrap: false, restSeconds: 60 },
          { setNumber: 3, type: "working", reps: 10, amrap: false, restSeconds: 60 },
        ] },
      ]},
      { name: "Upper", exercises: [
        { exerciseId: "ex-landmine", role: "primary", prescribedSets: [
          { setNumber: 1, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 3, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 4, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
        ], notes: "Hold 35kg — added a set" },
        { exerciseId: "ex-pulldown", role: "strength", prescribedSets: [
          { setNumber: 1, type: "working", reps: 10, amrap: false, targetRpe: 8, restSeconds: 90 },
          { setNumber: 2, type: "working", reps: 10, amrap: false, targetRpe: 8, restSeconds: 90 },
          { setNumber: 3, type: "working", reps: 10, amrap: true, targetRpe: 9, restSeconds: 90 },
        ], notes: "54.5kg" },
        { exerciseId: "ex-facepull", role: "accessory", prescribedSets: [
          { setNumber: 1, type: "working", reps: 15, amrap: false, restSeconds: 60 },
          { setNumber: 2, type: "working", reps: 15, amrap: false, restSeconds: 60 },
          { setNumber: 3, type: "working", reps: 15, amrap: false, restSeconds: 60 },
        ] },
      ]},
      { name: "Lower", exercises: [
        { exerciseId: "ex-dead", role: "primary", prescribedSets: [
          { setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 210 },
          { setNumber: 2, type: "working", reps: 5, amrap: false, targetRpe: 8, restSeconds: 210 },
        ], notes: "85kg working sets" },
        { exerciseId: "ex-bss", role: "strength", prescribedSets: [
          { setNumber: 1, type: "working", reps: 10, amrap: false, targetRpe: 7, restSeconds: 90 },
          { setNumber: 2, type: "working", reps: 10, amrap: false, targetRpe: 7, restSeconds: 90 },
          { setNumber: 3, type: "working", reps: 10, amrap: false, targetRpe: 7, restSeconds: 90 },
        ] },
        { exerciseId: "ex-plank", role: "core", prescribedSets: [
          { setNumber: 1, type: "working", reps: 45, amrap: false, restSeconds: 60 },
          { setNumber: 2, type: "working", reps: 45, amrap: false, restSeconds: 60 },
        ], notes: "45s holds" },
      ]},
      { name: "Upper", exercises: [
        { exerciseId: "ex-incline", role: "primary", prescribedSets: [
          { setNumber: 1, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 8, amrap: false, targetRpe: 8, restSeconds: 120 },
          { setNumber: 3, type: "working", reps: 8, amrap: true, targetRpe: 9, restSeconds: 120 },
        ] },
        { exerciseId: "ex-crow", role: "strength", prescribedSets: [
          { setNumber: 1, type: "working", reps: 12, amrap: false, targetRpe: 7, restSeconds: 90 },
          { setNumber: 2, type: "working", reps: 12, amrap: false, targetRpe: 7, restSeconds: 90 },
          { setNumber: 3, type: "working", reps: 12, amrap: false, targetRpe: 7, restSeconds: 90 },
        ] },
        { exerciseId: "ex-chin", role: "strength", prescribedSets: [
          { setNumber: 1, type: "working", reps: 6, amrap: true, targetRpe: 9, restSeconds: 120 },
          { setNumber: 2, type: "working", reps: 6, amrap: true, targetRpe: 9, restSeconds: 120 },
          { setNumber: 3, type: "working", reps: 6, amrap: true, targetRpe: 9, restSeconds: 120 },
        ], notes: "Thinner band — you hit 6 unassisted-rep equivalents" },
        { exerciseId: "ex-curl", role: "accessory", prescribedSets: [
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
    sessions: [{ name: "Full body", exercises: [{ exerciseId: "ex-squat", role: "primary", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false, targetRpe: 8 }] }] }],
  };
}

/** Deterministic client-message draft from the computed stats — the web mock
 *  never imports @pt/api; the template lives here. */
function cannedClientMessage(stats: NonNullable<ClientMessageDto["stats"]>): string {
  const lines: string[] = [];
  lines.push(
    `Great week — ${stats.sessionsLogged} sessions logged, ${stats.overallVolume}kg lifted over ${stats.sets} working sets.`
  );
  if (stats.prs.length > 0) {
    const pr = stats.prs[0];
    lines.push(
      `Standout: ${pr.exerciseName} at ${pr.weightKg}kg for ${pr.reps} — your best on that lift this block.`
    );
  } else {
    lines.push(`Showing up every session is exactly what keeps this moving.`);
  }
  if (stats.nextWeek) {
    lines.push(
      `Next week we keep building (${stats.nextWeek.directive ?? "same rhythm"}) — recover well and I'll see you then.`
    );
  } else {
    lines.push(`That's the block done — proud of how you finished it. Next program coming your way.`);
  }
  return lines.join("\n");
}

export const mockApi: TrainerApi = {
  async providers() {
    await delay(150);
    return Object.values(KNOWN_PROVIDERS).map((p) => ({
      id: p.id,
      label: p.label,
      model: p.models[0],
      models: [...p.models],
      configured: true,
    }));
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

  async schemes() {
    await delay(120);
    return [...state.schemes];
  },

  async createScheme({ name, weeks }) {
    await delay(250);
    const scheme: PeriodizationSchemeDto = {
      id: `sch-${uuid().slice(0, 8)}`,
      name,
      weeks,
    };
    state.schemes = [...state.schemes, scheme];
    return scheme;
  },

  async deleteScheme(id) {
    await delay(200);
    state.schemes = state.schemes.filter((s) => s.id !== id);
  },

  async examples(programId) {
    await delay(150);
    return state.examples
      .filter((e) => !programId || e.programId === programId)
      .map(exampleDto);
  },

  async createExample(input) {
    await delay(300);
    const program = state.programs.find((p) => p.id === input.programId);
    if (!program) throw new Error("program not found");
    if (state.examples.some((e) => e.programId === input.programId)) {
      throw new Error("program is already marked as an example");
    }
    const created: ProgramExampleDto = {
      id: `ex-${uuid().slice(0, 8)}`,
      programId: input.programId,
      goal: input.goal,
      level: input.level,
      daysPerWeek: input.daysPerWeek ?? Math.max(1, program.weeks[0].sessions.filter((x) => x.kind === "lifting").length),
      note: input.note ?? null,
      createdAt: new Date().toISOString(),
      program: withNames(program),
    };
    state.examples = [created, ...state.examples];
    return structuredClone(created);
  },

  async updateExample(id, patch) {
    await delay(250);
    const i = state.examples.findIndex((e) => e.id === id);
    if (i < 0) throw new Error("example not found");
    const current = state.examples[i];
    const updated: ProgramExampleDto = {
      ...current,
      ...(patch.goal !== undefined ? { goal: patch.goal } : {}),
      ...(patch.level !== undefined ? { level: patch.level } : {}),
      ...(patch.daysPerWeek !== undefined ? { daysPerWeek: patch.daysPerWeek } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    };
    state.examples[i] = updated;
    return exampleDto(updated);
  },

  async deleteExample(id) {
    await delay(200);
    const before = state.examples.length;
    state.examples = state.examples.filter((e) => e.id !== id);
    if (state.examples.length === before) throw new Error("example not found");
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

  async saveProgram(id, weeks: ProgramWeekDto[], phasing?: ProgramPhasingDto | null) {
    await delay(400);
    const parsed = ProgramWeeksDocument.safeParse(weeks);
    if (!parsed.success) {
      throw new Error("invalid weeks document");
    }
    const i = state.programs.findIndex((p) => p.id === id);
    if (i < 0) throw new Error("program not found");
    const current = state.programs[i];
    const updated: ProgramDto = {
      ...current,
      weeks,
      version: current.version + 1,
    };
    if (phasing !== undefined) {
      updated.phasing = phasing;
    }
    state.programs[i] = updated;
    return withNames(updated);
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

  async saveProgramDirection(id, direction) {
    await delay(200);
    const i = state.programs.findIndex((p) => p.id === id);
    if (i < 0) throw new Error("program not found");
    state.programs[i] = { ...state.programs[i], direction: direction ?? null };
    return withNames(state.programs[i]);
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
      createdFromProgramId: input.createdFromProgramId ?? null,
      weeks: input.weeks,
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
    const created: ExerciseDto = {
      ...input,
      id: uuid(),
      secondaryMuscleGroups: [],
      movementPattern: input.movementPattern ?? null,
      functionalMovement: input.functionalMovement ?? null,
    };
    exercises.push(created);
    return created;
  },

  async patchExercise(id, input) {
    await delay(200);
    const i = exercises.findIndex((e) => e.id === id);
    if (i === -1) throw new Error("exercise not found");
    const updated: ExerciseDto = {
      ...exercises[i],
      ...(input.movementPattern !== undefined ? { movementPattern: input.movementPattern } : {}),
      ...(input.functionalMovement !== undefined ? { functionalMovement: input.functionalMovement } : {}),
    };
    exercises[i] = updated;
    return updated;
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
        kind: l.kind ?? "lifting",
        cardio: l.cardio ?? null,
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
      kind: input.kind ?? "lifting",
      cardio: input.cardio ?? null,
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
    const client = state.clients.find((c) => c.id === input.clientId);
    const basedOn = input.basedOnProgramId
      ? state.programs.find((p) => p.id === input.basedOnProgramId) ?? null
      : null;
    const isWeek = Boolean(input.targetWeek);
    const gen: GenerationDto = {
      id: uuid(),
      clientId: input.clientId,
      basedOnProgramId: input.basedOnProgramId ?? null,
      kind: isWeek ? "week" : "block",
      targetWeek: input.targetWeek ?? null,
      direction: input.direction ?? basedOn?.direction ?? null,
      providerId: input.providerId ?? "zai",
      model: input.providerId === "openai" ? "gpt-4o-mini" : "glm-4.5-flash",
      effort: input.effort ?? null,
      status: "pending",
      draft: null,
      error: null,
      parentGenerationId: null,
      revisionMessage: null,
      instructions: input.instructions ?? null,
      rejectReason: null,
      approvedProgramId: null,
      exampleProgramIds: [],
      createdAt: new Date().toISOString(),
    };
    state.generations.unshift(gen);

    // Simulated model latency — the demo should feel like real work is happening.
    await delay(2200);

    if (gen.status !== "pending") {
      return structuredClone(gen);
    }

    const draft = client?.id === "cl-maya" ? mayaDraft(basedOn) : genericDraft();
    if (isWeek) {
      draft.name = `Week ${input.targetWeek}`;
      delete (draft as any).phasing;
    }
    // Last logged working weight per exercise — drafts propose the next small jump.
    const lastW = new Map<string, number>();
    for (const log of [...state.logs].sort((a, b) => a.date.localeCompare(b.date))) {
      for (const s of log.sets) {
        if (s.type === "working" && s.weightKg != null) lastW.set(s.exerciseId, s.weightKg);
      }
    }
    // Mirror what the real API guarantees: every draft exercise is nameable,
    // and working sets carry a load target (last + 2.5kg, or leave RPE-driven).
    for (const s of draft.sessions) {
      for (const e of s.exercises) {
        if (!e.exerciseName && e.exerciseId) e.exerciseName = nameOf(e.exerciseId);
        const last = e.exerciseId ? lastW.get(e.exerciseId) : undefined;
        if (last == null) continue;
        const next = Math.round((last + 2.5) * 2) / 2;
        for (const ps of e.prescribedSets) {
          if (ps.type === "working") ps.targetWeightKg = next;
        }
      }
    }
    // Same deterministic retrieval the real API runs in loadContext.
    const exampleProgramIds = selectExamples(
      state.examples.map((e) => ({
        programId: e.programId,
        goal: e.goal,
        level: e.level,
        daysPerWeek: e.daysPerWeek,
        createdAt: e.createdAt,
      })),
      { goals: client?.goals ?? null, daysPerWeek: client?.sessionsPerWeek ?? null },
      { excludeProgramId: input.basedOnProgramId ?? null, limit: 2 },
    ).map((m) => m.programId);
    gen.status = "validated";
    gen.draft = draft;
    gen.exampleProgramIds = exampleProgramIds;
    return structuredClone(gen);
  },

  async generations(clientId) {
    await delay(200);
    return state.generations.filter((g) => g.clientId === clientId);
  },

  async generation(id) {
    const g = state.generations.find((g) => g.id === id);
    if (!g) throw new Error("generation not found");
    return structuredClone(g);
  },

  async savePhasing(generationId, phasing) {
    await delay(300);
    const parent = state.generations.find((g) => g.id === generationId);
    if (!parent || parent.status !== "validated" || !parent.draft) throw new Error("generation is not validated");
    if (parent.kind === "week") throw new Error("week drafts follow the block's plan");
    if (canon(parent.draft.phasing ?? null) === canon(phasing)) throw new Error("phasing is unchanged");
    const child: GenerationDto = {
      ...structuredClone(parent),
      id: uuid(),
      status: "validated",
      draft: { ...structuredClone(parent.draft), phasing: structuredClone(phasing) },
      parentGenerationId: parent.id,
      revisionMessage: "Block plan edited by you",
      manualEdit: true,
      approvedProgramId: null,
      rejectReason: null,
      createdAt: new Date().toISOString(),
    };
    state.generations.unshift(child);
    return structuredClone(child);
  },

  async reviseGeneration(id, message) {
    const parent = state.generations.find((g) => g.id === id);
    if (!parent || parent.status !== "validated" || !parent.draft) {
      throw new Error("generation is not validated");
    }
    const child: GenerationDto = {
      id: uuid(),
      clientId: parent.clientId,
      basedOnProgramId: parent.basedOnProgramId,
      kind: parent.kind ?? "block",
      targetWeek: parent.targetWeek ?? null,
      direction: parent.direction ?? null,
      providerId: parent.providerId,
      model: parent.model,
      status: "pending",
      draft: null,
      error: null,
      parentGenerationId: parent.id,
      revisionMessage: message,
      instructions: null,
      rejectReason: null,
      approvedProgramId: null,
      exampleProgramIds: parent.exampleProgramIds ?? [],
      createdAt: new Date().toISOString(),
    };
    state.generations.unshift(child);

    await delay(2200);

    if (child.status !== "pending") {
      return structuredClone(child);
    }

    child.status = "validated";
    child.draft = mockReviseDraft(parent.draft as any, message) as any;
    return structuredClone(child);
  },

  async cancelGeneration(id) {
    await delay(150);
    const g = state.generations.find((g) => g.id === id);
    if (!g) throw new Error("generation not found");
    if (g.status !== "pending") throw new Error(`generation is ${g.status}, not pending`);
    g.status = "cancelled";
    return structuredClone(g);
  },

  async approveGeneration(id) {
    await delay(600);
    const gen = state.generations.find((g) => g.id === id);
    if (!gen || !gen.draft) throw new Error("generation not found");
    const client = state.clients.find((c) => c.id === gen.clientId);
    // Mirrors the API: draft sessions get seq per kind in draft order; code places them.
    const seq = { lifting: 0, cardio: 0 };
    const template: ProgramSessionDto[] = gen.draft.sessions.map((s) => {
      const kind = s.kind === "cardio" ? ("cardio" as const) : ("lifting" as const);
      const exercises =
        kind === "cardio"
          ? []
          : sortExercisesByRole(s.exercises).map((e, ei) => ({
              id: uuid(),
              exerciseId: e.exerciseId ?? e.exerciseName ?? uuid(),
              exerciseName: e.exerciseName ?? nameOf(e.exerciseId ?? ""),
              role: e.role,
              order: ei,
              prescribedSets: e.prescribedSets,
              notes: e.notes,
            }));
      return {
        id: uuid(),
        name: s.name,
        seq: ++seq[kind],
        weekday: null,
        order: 0,
        kind,
        notes: s.notes,
        exercises,
        cardio: kind === "cardio" ? s.cardio : null,
      };
    });

    if (gen.kind === "week") {
      const targetProg = state.programs.find((p) => p.id === gen.basedOnProgramId);
      if (!targetProg) throw new Error("based-on program not found");
      // Keep the old week's placement by session key; new sessions land unscheduled.
      const oldWeek = targetProg.weeks.find((w) => w.week === gen.targetWeek);
      const oldAt = new Map((oldWeek?.sessions ?? []).map((s) => [sessionKey(s), s]));
      const sessions = withCompactOrder(
        template.map((s) => {
          const old = oldAt.get(sessionKey(s));
          return old ? { ...s, weekday: old.weekday ?? null, order: old.order } : { ...s, weekday: null, order: 99 };
        })
      );
      targetProg.weeks = targetProg.weeks.map((w) =>
        w.week === gen.targetWeek ? { ...w, sessions } : w
      );
      targetProg.version += 1;
      gen.status = "approved";
      gen.approvedProgramId = targetProg.id;
      return withNames(targetProg);
    }

    const plannedWeeks = 4;
    const weeks = placeWeeks(stampWeeks(template, plannedWeeks), client?.trainingDays, patternOf);
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
      weeks,
    };
    state.programs.unshift(program);
    gen.status = "approved";
    gen.approvedProgramId = program.id;
    return withNames(program);
  },

  async rejectGeneration(id, reason) {
    await delay(300);
    const gen = state.generations.find((g) => g.id === id);
    if (gen) {
      gen.status = "rejected";
      gen.rejectReason = reason ?? null;
    }
    return gen!;
  },

  async generateClientMessage(input) {
    await delay(800);
    const client = state.clients.find((c) => c.id === input.clientId);
    if (!client) throw new Error("client not found");
    const program = state.programs.find((p) => p.id === input.programId);
    if (!program) throw new Error("program not found");
    if (program.clientId !== input.clientId) {
      throw new Error("program does not belong to client");
    }
    const clientLogs = state.logs
      .filter((l) => l.clientId === input.clientId)
      .map((l) => ({
        programId: l.programId,
        date: l.date,
        kind: l.kind,
        cardio: l.cardio ?? null,
        sets: l.sets,
      }));
    const stats = weekSummary({
      program,
      logs: clientLogs,
      week: input.week,
      catalog: exercises.map((e) => ({ id: e.id, name: e.name })),
    });
    if (!stats) throw new Error(`week ${input.week} has no logged sessions`);

    const message = cannedClientMessage(stats);
    const row: ClientMessageDto = {
      id: uuid(),
      clientId: input.clientId,
      programId: input.programId,
      week: input.week,
      providerId: input.providerId ?? "mock",
      model: "mock-draft-v1",
      status: "validated",
      draft: { message },
      stats,
      finalText: null,
      error: null,
      createdAt: new Date().toISOString(),
    };
    state.clientMessages.unshift(row);
    return structuredClone(row);
  },

  async clientMessages(clientId) {
    await delay(200);
    return state.clientMessages
      .filter((m) => m.clientId === clientId)
      .map((m) => structuredClone(m));
  },

  async clientMessage(id) {
    const row = state.clientMessages.find((m) => m.id === id);
    if (!row) throw new Error("client message not found");
    return structuredClone(row);
  },

  async approveClientMessage(id, text) {
    await delay(400);
    const row = state.clientMessages.find((m) => m.id === id);
    if (!row) throw new Error("client message not found");
    if (row.status !== "validated") {
      throw new Error(`client message is ${row.status}, not validated`);
    }
    if (!row.draft) throw new Error("client message has no draft");
    if (text !== undefined && !text.trim()) throw new Error("text must not be empty");
    row.status = "approved";
    row.finalText = (text ?? row.draft.message).trim();
    return structuredClone(row);
  },

  async rejectClientMessage(id) {
    await delay(300);
    const row = state.clientMessages.find((m) => m.id === id);
    if (!row) throw new Error("client message not found");
    row.status = "rejected";
    return structuredClone(row);
  },

  async preferences() {
    await delay(150);
    return structuredClone(state.preferences);
  },

  async distillPreferences(input) {
    // Simulated distillation latency — matches the generate feel.
    await delay(2500);
    const clientId = input.clientId ?? null;
    const scoped = clientId
      ? state.generations.filter((g) => g.clientId === clientId)
      : state.generations;
    // Oldest-first, mirroring the server's gather order.
    const rows = [...scoped].reverse();

    const signals: PreferenceSignal[] = [];
    for (const gen of rows) {
      const clientName = state.clients.find((c) => c.id === gen.clientId)?.name ?? null;
      if (gen.instructions && gen.instructions.trim().length > 0) {
        signals.push({ kind: "instruction", clientName, at: gen.createdAt, text: gen.instructions });
      }
      if (gen.revisionMessage && gen.revisionMessage.trim().length > 0) {
        signals.push({ kind: "revision", clientName, at: gen.createdAt, text: gen.revisionMessage });
      }
      if (gen.rejectReason && gen.rejectReason.trim().length > 0) {
        signals.push({ kind: "reject", clientName, at: gen.createdAt, text: gen.rejectReason });
      }
      if (gen.approvedProgramId && gen.draft) {
        const prog = state.programs.find((p) => p.id === gen.approvedProgramId);
        if (prog) {
          const diffText = diffRowsToText(
            diffSources(
              aiDraftToDiffSource(gen.draft as never),
              programWeeksToDiffSource(prog.weeks)
            )
          );
          if (diffText.length > 0) {
            signals.push({ kind: "approved-diff", clientName, at: gen.createdAt, text: diffText });
          }
        }
      }
    }

    if (signals.length === 0) throw new Error("no feedback signals to distill");

    const document = mockDistillPreferences(signals);
    const existing = state.preferences.find((p) =>
      clientId ? p.clientId === clientId : p.clientId === null
    );
    if (existing) {
      existing.document = document;
      existing.providerId = input.providerId ?? existing.providerId;
      existing.model = input.model ?? existing.model;
      existing.updatedAt = new Date().toISOString();
      return structuredClone(existing);
    }
    const row: PreferencesDto = {
      id: uuid(),
      clientId,
      clientName: clientId
        ? state.clients.find((c) => c.id === clientId)?.name ?? null
        : null,
      document,
      providerId: input.providerId ?? "zai",
      model: input.model ?? "glm-4.5-flash",
      updatedAt: new Date().toISOString(),
    };
    state.preferences.unshift(row);
    return structuredClone(row);
  },

  async deletePreference(id) {
    await delay(200);
    const idx = state.preferences.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error("preference not found");
    state.preferences.splice(idx, 1);
  },

  /** Same shared rule engine the API runs — over the in-memory fixtures. */
  async notifications(): Promise<SignalDto[]> {
    await delay(250);
    const signals: SignalDto[] = [];
    for (const client of state.clients) {
      if (client.status === "archived") continue;
      const current =
        state.programs.find((p) => p.clientId === client.id && p.status === "active") ?? null;
      if (!current) continue;
      const clientLogs = state.logs
        .filter((l) => l.clientId === client.id)
        .map((l) => ({ programId: l.programId, date: l.date, kind: l.kind, cardio: l.cardio ?? null, sets: l.sets }));
      signals.push(...computeSignals(current, clientLogs, nameOf, client.sessionsPerWeek));
      if (client.cardioTarget) {
        const behind = cardioBehindSignal(
          { programId: current.id, clientId: client.id },
          client.cardioTarget,
          clientLogs,
          Date.now()
        );
        if (behind) signals.push(behind);
      }
    }
    return activeSignals(signals);
  },

  async snoozeSignal(id, until) {
    snoozeUntil(id, until);
  },

  async chains() {
    await delay(120);
    return state.chains.map((c) => ({ ...c, muscleGroups: [...c.muscleGroups] }));
  },

  async updateChain(id: string, input: { muscleGroups: string[] }) {
    await delay(200);
    const parsed = KineticChainInput.safeParse(input);
    if (!parsed.success) {
      throw new Error("invalid chain");
    }
    const idx = state.chains.findIndex((c) => c.id === id);
    if (idx === -1) {
      throw new Error("chain not found");
    }
    const updated: KineticChainDto = {
      ...state.chains[idx],
      muscleGroups: [...parsed.data.muscleGroups],
    };
    state.chains[idx] = updated;
    return { ...updated, muscleGroups: [...updated.muscleGroups] };
  },

  async chainWeek(clientId: string): Promise<ChainWeekDto> {
    await delay(150);
    const d = new Date();
    const dayOffset = (d.getDay() + 6) % 7;
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dayOffset);
    const weekStart = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, "0")}-${String(monday.getDate()).padStart(2, "0")}`;

    const clientLogs = state.logs.filter((l) => l.clientId === clientId && l.date >= weekStart);
    const counts = chainSetCounts(state.chains, clientLogs, exercises, weekStart);

    return {
      weekStart,
      chains: state.chains.map((c) => ({
        id: c.id,
        name: c.name,
        muscleGroups: [...c.muscleGroups],
        sets: counts[c.id] ?? 0,
      })),
    };
  },

  async chatMessages(clientId) {
    await delay(200);
    return structuredClone(state.messages.filter((m) => m.clientId === clientId));
  },

  async sendChatMessage(input) {
    await delay(1200);
    const client = state.clients.find((c) => c.id === input.clientId);
    if (!client) throw new Error("client not found");
    const trimmed = input.message.trim();
    if (!trimmed) throw new Error("message must not be empty");

    const trainerRow: ChatMessageDto & { clientId: string } = {
      id: uuid(),
      clientId: input.clientId,
      role: "trainer",
      kind: "chat",
      content: trimmed,
      generationId: null,
      createdAt: new Date().toISOString(),
    };
    const assistantRow: ChatMessageDto & { clientId: string } = {
      id: uuid(),
      clientId: input.clientId,
      role: "assistant",
      kind: "chat",
      content: mockChatReply(trimmed, client.name),
      generationId: null,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(trainerRow, assistantRow);
    return structuredClone([trainerRow, assistantRow]);
  },

  async chatTurn(input) {
    const trimmed = input.message.trim();
    if (!trimmed) throw new Error("message must not be empty");

    // Without a target draft it is a plain Q&A turn.
    if (!input.generationId) {
      const rows = await mockApi.sendChatMessage({
        clientId: input.clientId,
        message: trimmed,
        providerId: input.providerId,
      });
      return { messages: rows, generation: null };
    }

    // Question-shaped messages never draft (same heuristic as the API mock).
    const question = /^(why|what|how|who|when|where|which|does|do|is|are|can|could|should|\?)/i.test(trimmed);
    // Reply-only turns answer fast; revising mirrors live revise latency so
    // the chat page's generating state is observable in demo mode.
    await delay(question ? 1200 : 2200);

    const client = state.clients.find((c) => c.id === input.clientId);
    const now = new Date().toISOString();
    const trainerRow: ChatMessageDto & { clientId: string } = {
      id: uuid(),
      clientId: input.clientId,
      role: "trainer",
      kind: "revision",
      content: trimmed,
      generationId: null,
      createdAt: now,
    };

    if (question) {
      const assistantRow: ChatMessageDto & { clientId: string } = {
        id: uuid(),
        clientId: input.clientId,
        role: "assistant",
        kind: "chat",
        content: mockChatReply(trimmed, client?.name ?? null),
        generationId: null,
        createdAt: new Date().toISOString(),
      };
      state.messages.push(trainerRow, assistantRow);
      return {
        messages: structuredClone([trainerRow, assistantRow]),
        generation: null,
      };
    }

    const target = state.generations.find((g) => g.id === input.generationId);
    if (!target) throw new Error("generation not found");
    const assistantRow: ChatMessageDto & { clientId: string } = {
      id: uuid(),
      clientId: input.clientId,
      role: "assistant",
      kind: "proposal",
      content: `Proposed: ${trimmed}`,
      generationId: null,
      proposal: {
        ...mockProposal(target.draft as any, trimmed),
        parentGenerationId: input.generationId,
        builtGenerationId: null,
        requestMessageId: trainerRow.id,
      },
      createdAt: new Date().toISOString(),
    };
    state.messages.push(trainerRow, assistantRow);
    return {
      messages: structuredClone([trainerRow, assistantRow]),
      generation: null,
    };
  },

  async buildProposal(messageId, _opts) {
    const row = state.messages.find((m) => m.id === messageId);
    if (!row || row.kind !== "proposal" || !row.proposal) throw new Error("proposal not found");
    if (row.proposal.builtGenerationId) throw new Error("proposal already built");
    const parent = state.generations.find((g) => g.id === row.proposal!.parentGenerationId);
    const pending: GenerationDto = {
      ...structuredClone(parent!),
      id: uuid(),
      status: "pending",
      parentGenerationId: parent!.id,
      createdAt: new Date().toISOString(),
    };
    state.generations.unshift(pending);
    await delay(4000);
    if (pending.status === "cancelled") {
      const err: ChatMessageDto & { clientId: string } = {
        id: uuid(),
        clientId: row.clientId,
        role: "assistant" as const,
        kind: "error" as const,
        content: "Build cancelled. The draft is unchanged.",
        generationId: pending.id,
        createdAt: new Date().toISOString(),
      };
      state.messages.push(err);
      return { messages: structuredClone([err]), generation: structuredClone(pending) };
    }
    state.generations.splice(state.generations.indexOf(pending), 1);
    // History shows the trainer's request, not the proposal summary.
    const requestText = state.messages.find((m) => m.id === row.proposal!.requestMessageId)?.content ?? row.proposal.summary;
    const child = reviseDraftInState(state, parent!.id, requestText);
    child.draft = mockApplyProposal(child.draft as any, row.proposal) as any;
    row.proposal.builtGenerationId = child.id;
    const out: ChatMessageDto & { clientId: string } = {
      id: uuid(),
      clientId: row.clientId,
      role: "assistant" as const,
      kind: "draft" as const,
      content: `Built from the proposal.\n\n${draftNoticeText(child.draft as any)}`,
      generationId: child.id,
      createdAt: new Date().toISOString(),
    };
    state.messages.push(out);
    return { messages: structuredClone([out]), generation: structuredClone(child) };
  },

  async clearChat(clientId) {
    await delay(200);
    state.messages = state.messages.filter((m) => m.clientId !== clientId);
  },
};
