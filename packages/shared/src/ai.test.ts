import { describe, expect, test } from "bun:test";
import {
  DEFAULT_PROVIDER_ID,
  AiClientMessageDraft,
  ChatMessage,
  CLIENT_MESSAGE_MAX_CHARS,
  DEFAULT_GENERATION_SECONDS,
  KNOWN_PROVIDERS,
  AiProviderConfig,
  TYPICAL_GENERATION_SECONDS,
  draftNoticeText,
  ChatProposal,
  mockApplyProposal,
  mockChatReply,
  mockProposal,
  mockReviseDraft,
  proposalToFeedback,
  typicalGenerationSeconds,
  AiGeneration,
  GenerationStatus,
  GENERATION_STATUSES,
  scopeToProposal,
  draftFromSessions,
  upgradeDraft,
  AiProgramDraft,
  blockDraftSchema,
  draftWeekIssues,
  sameLetterWeeks,
  resizeDraftWeeks,
  mentionsAlternating,
  withLockedWeeks,
} from "./index";

describe("KNOWN_PROVIDERS", () => {
  test("T1 KNOWN_PROVIDERS registers deepseek first — the default provider", () => {
    expect(Object.keys(KNOWN_PROVIDERS)).toEqual(["deepseek", "zai", "mock"]);
    expect(DEFAULT_PROVIDER_ID).toBe("deepseek");
    const parsed = AiProviderConfig.parse(KNOWN_PROVIDERS.deepseek);
    expect(parsed.models[0]).toBe("deepseek-flash");
    expect(parsed.baseUrl).toBe("https://api.deepseek.com");
    expect(parsed.apiKeyEnvVar).toBe("DEEPSEEK_API_KEY");
    expect(parsed.maxOutputTokens).toBe(65536);
  });

  test("T1b effort levels use one vocabulary, mock takes none", () => {
    const zai = AiProviderConfig.parse(KNOWN_PROVIDERS.zai);
    const deepseek = AiProviderConfig.parse(KNOWN_PROVIDERS.deepseek);
    const mock = AiProviderConfig.parse(KNOWN_PROVIDERS.mock);
    expect(zai.effortLevels).toEqual(["low", "high", "max"]);
    expect(zai.defaultEffort).toBe("low");
    expect(deepseek.effortLevels).toEqual(["none", "low", "high", "max"]);
    expect(deepseek.defaultEffort).toBe("max");
    expect(mock.effortLevels).toBeUndefined();
    expect(mock.defaultEffort).toBeUndefined();
  });
});

describe("typicalGenerationSeconds", () => {
  test("T2 typicalGenerationSeconds knows deepseek", () => {
    expect(typicalGenerationSeconds("deepseek")).toBe(20);
    expect(typicalGenerationSeconds("zai")).toBe(210);
    expect(typicalGenerationSeconds("mock")).toBe(3);
    expect(typicalGenerationSeconds("unknown")).toBe(240);
  });

  test("typicalGenerationSeconds returns configured providers and defaults unknowns", () => {
    expect(typicalGenerationSeconds("zai")).toBe(210);
    expect(typicalGenerationSeconds("mock")).toBe(3);
    expect(typicalGenerationSeconds("unknown")).toBe(240);
    expect(typicalGenerationSeconds("unknown")).toBe(DEFAULT_GENERATION_SECONDS);
    expect(TYPICAL_GENERATION_SECONDS.zai).toBe(210);
    expect(TYPICAL_GENERATION_SECONDS.mock).toBe(3);
  });
});

describe("mockReviseDraft", () => {
  test("mockReviseDraft clones, annotates rationale, leaves the original untouched", () => {
    const draft: AiProgramDraft = draftFromSessions({
      name: "Block 1",
      rationale: "Original rationale",
      clientSummary: "Summary",
      sessions: [
        {
          name: "Day 1",
          kind: "lifting",
          exercises: [
            {
              exerciseName: "Squat",
              prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false }],
            },
          ],
        },
      ],
    });
    const clonedBefore = structuredClone(draft);
    const revised = mockReviseDraft(draft, "swap bench for incline DB");

    expect(revised.rationale).toBe(`${draft.rationale}\n\nRevision: swap bench for incline DB`);
    expect(revised.weeks).toEqual(draft.weeks);
    expect(revised.name).toBe(draft.name);
    expect(revised.clientSummary).toBe(draft.clientSummary);
    expect(draft).toEqual(clonedBefore);
  });
});

describe("AiClientMessageDraft", () => {
  test("accepts a LINE-sized message and caps at CLIENT_MESSAGE_MAX_CHARS", () => {
    const ok = AiClientMessageDraft.safeParse({ message: "Great week — see you Monday." });
    expect(ok.success).toBe(true);

    const empty = AiClientMessageDraft.safeParse({ message: "" });
    expect(empty.success).toBe(false);

    const tooLong = AiClientMessageDraft.safeParse({ message: "x".repeat(CLIENT_MESSAGE_MAX_CHARS + 1) });
    expect(tooLong.success).toBe(false);
    const atLimit = AiClientMessageDraft.safeParse({ message: "x".repeat(CLIENT_MESSAGE_MAX_CHARS) });
    expect(atLimit.success).toBe(true);
  });
});

describe("GenerationStatus schema", () => {
  test("GenerationStatus accepts cancelled alongside existing statuses", () => {
    expect(GENERATION_STATUSES).toEqual([
      "pending",
      "validated",
      "failed_validation",
      "failed_provider",
      "approved",
      "rejected",
      "cancelled",
    ]);
    for (const status of GENERATION_STATUSES) {
      const res = GenerationStatus.safeParse(status);
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe(status);
      }
    }
    expect(GenerationStatus.safeParse("unknown").success).toBe(false);
  });
});

describe("AiGeneration schema", () => {
  test("AiGeneration row schema parses the new signal fields", () => {
    const fullRow = {
      id: "a0000000-0000-4000-8000-000000000001",
      trainerId: "b0000000-0000-4000-8000-000000000001",
      clientId: "c0000000-0000-4000-8000-000000000001",
      basedOnProgramId: null,
      kind: "block",
      targetWeek: null,
      direction: null,
      providerId: "mock",
      model: "mock-v1",
      status: "approved",
      draft: null,
      error: null,
      parentGenerationId: null,
      revisionMessage: "please change squat",
      instructions: "cap RPE at 8",
      rejectReason: null,
      approvedProgramId: "d0000000-0000-4000-8000-000000000001",
      createdAt: "2026-10-31T05:00:00.000Z",
    };

    const parsed = AiGeneration.parse(fullRow);
    expect(parsed.instructions).toBe("cap RPE at 8");
    expect(parsed.rejectReason).toBeNull();
    expect(parsed.approvedProgramId).toBe("d0000000-0000-4000-8000-000000000001");

    // null variants
    const nullRow = {
      ...fullRow,
      instructions: null,
      rejectReason: "too much volume",
      approvedProgramId: null,
    };
    const parsedNull = AiGeneration.parse(nullRow);
    expect(parsedNull.instructions).toBeNull();
    expect(parsedNull.rejectReason).toBe("too much volume");
    expect(parsedNull.approvedProgramId).toBeNull();
  });
});

describe("ChatMessage schema, mockChatReply, draftNoticeText", () => {
  test("ChatMessage schema, mockChatReply, draftNoticeText", () => {
    const fixture = {
      id: "a0000000-0000-4000-8000-000000000001",
      trainerId: "b0000000-0000-4000-8000-000000000002",
      clientId: "c0000000-0000-4000-8000-000000000003",
      role: "trainer" as const,
      content: "How is Maya doing?",
      generationId: null,
      createdAt: "2026-10-31T05:00:00.000Z",
    };
    const parsed = ChatMessage.parse(fixture);
    expect(parsed.kind).toBe("chat");
    expect(parsed.role).toBe("trainer");

    const fullRow = {
      ...fixture,
      role: "assistant" as const,
      kind: "draft" as const,
      generationId: "d0000000-0000-4000-8000-000000000004",
    };
    expect(ChatMessage.parse(fullRow).kind).toBe("draft");

    expect(mockChatReply("hi", "Maya")).toBe(
      "(Maya) You asked: “hi” — mock reply. This client's profile, current program, recent logs, and latest draft are in the assistant's context; pick a live provider for real answers."
    );
    expect(mockChatReply("hi", null)).toBe(
      "(this client) You asked: “hi” — mock reply. This client's profile, current program, recent logs, and latest draft are in the assistant's context; pick a live provider for real answers."
    );

    const draftSample: AiProgramDraft = draftFromSessions({
      name: "Strength Block A",
      rationale: "Rationale",
      clientSummary: "Summary",
      sessions: [
        { name: "Day 1", kind: "lifting", exercises: [] },
        { name: "Day 2", kind: "lifting", exercises: [] },
      ],
    });
    expect(draftNoticeText(draftSample)).toBe(
      "Draft ready: Strength Block A — 2 sessions. Open review to inspect and approve."
    );
    const ab = { ...draftSample, weeks: draftSample.weeks.concat({ ...draftSample.weeks[0], week: 2 }).map((w) => ({ ...w, rotation: w.week === 1 ? ("A" as const) : ("B" as const) })) };
    expect(draftNoticeText(ab)).toBe("Draft ready: Strength Block A — 2 sessions × 2 weeks (A/B). Open review to inspect and approve.");
  });
});

describe("chat proposals", () => {
  const draft: AiProgramDraft = draftFromSessions({
    name: "B", rationale: "", clientSummary: "",
    sessions: [{ name: "Day 1", kind: "lifting", exercises: [{ exerciseName: "Squat", prescribedSets: [{ setNumber: 1, type: "working", reps: 5, amrap: false, restSeconds: 120 }] }] }],
  });
  test("mockProposal is a valid ChatProposal", () => {
    expect(ChatProposal.safeParse(mockProposal(draft, "more rest")).success).toBe(true);
  });
  test("mockApplyProposal adds 15s rest to the edited slot", () => {
    const next = mockApplyProposal(draft, mockProposal(draft, "x"));
    expect(next.weeks[0].sessions[0].exercises[0].prescribedSets[0].restSeconds).toBe(135);
  });
  test("mockApplyProposal rogue mode also edits phasing and cardio, which the scope reverts", () => {
    const withExtras: AiProgramDraft = {
      ...structuredClone(draft),
      phasing: { plannedWeeks: 2, phase: "accumulation", nextPhase: "build", weeks: [{ week: 1, directive: "base" }, { week: 2, directive: "deload", target: { metric: "overall_volume", deltaPercent: -40 } }] },
      weeks: [{ week: 1, sessions: [...structuredClone(draft.weeks[0].sessions), { name: "Tempo Ride", kind: "cardio", cardio: { modality: "Stationary Bike", hrZone: 3 }, exercises: [] }] }],
    };
    const proposal = mockProposal(withExtras, "x");
    const rogue = mockApplyProposal(withExtras, proposal, { rogue: true });
    expect(rogue.phasing!.nextPhase).toBe("deload");
    expect(rogue.phasing!.weeks![1].target).toBeUndefined();
    expect(rogue.weeks[0].sessions.at(-1)!.cardio!.hrZone).toBe(4);
    const { draft: scoped, discarded } = scopeToProposal(withExtras, rogue, proposal);
    expect(scoped.phasing).toEqual(withExtras.phasing);
    expect(scoped.weeks[0].sessions.at(-1)).toEqual(withExtras.weeks[0].sessions.at(-1));
    expect(scoped.weeks[0].sessions[0].exercises[0]).toEqual(rogue.weeks[0].sessions[0].exercises[0]);
    expect(discarded.map((c) => c.kind)).toEqual(["cardio", "plan", "plan"]);
    // Plain mode leaves phasing and cardio alone
    expect(mockApplyProposal(withExtras, proposal).phasing).toEqual(withExtras.phasing);
  });
  test("cardio proposals: slot null edits a cardio session; mock adds 5 min", () => {
    const c = { day: 2, slot: null, kind: "edit" as const, from: "Tempo Ride", to: "Tempo Ride", detail: "35 min · Z3" };
    expect(ChatProposal.safeParse({ summary: "s", changes: [c] }).success).toBe(true);
    expect(ChatProposal.safeParse({ summary: "s", changes: [{ ...c, kind: "swap" }] }).success).toBe(false);
    const withCardio: AiProgramDraft = {
      ...structuredClone(draft),
      weeks: [{ week: 1, sessions: [structuredClone(draft.weeks[0].sessions[0]), { name: "Tempo Ride", kind: "cardio", cardio: { modality: "Bike", durationMin: 30 }, exercises: [] }] }],
    };
    expect(mockApplyProposal(withCardio, { summary: "s", changes: [c] }).weeks[0].sessions[1].cardio!.durationMin).toBe(35);
    expect(proposalToFeedback("longer ride", { summary: "s", changes: [c] })).toContain("- Day 2, cardio session (edit): Tempo Ride → Tempo Ride — 35 min · Z3");
  });
  test("proposalToFeedback lists each change", () => {
    const text = proposalToFeedback("swap it", { summary: "s", changes: [{ day: 3, slot: 2, kind: "swap", from: "Front Squat", to: "Paused Back Squat", detail: "5×5 @RPE 7–8 · rest 180s" }] });
    expect(text).toContain("- Day 3, slot 2 (swap): Front Squat → Paused Back Squat — 5×5 @RPE 7–8 · rest 180s");
    expect(text.startsWith("Apply exactly these changes")).toBe(true);
  });
  test("proposalToFeedback names the areas the build must not touch", () => {
    const text = proposalToFeedback("swap it", { summary: "s", changes: [{ day: 1, slot: 1, kind: "swap", from: "A", to: "B", detail: "3×5" }] });
    expect(text).toContain("Do not change: the block plan / phasing (weeks, targets, next block), the week letters, cardio sessions not listed, session names, kinds and types, or any slot not listed. Keep rep ranges, loads and set types exactly as they are.");
  });
});

describe("draft weeks", () => {
  const session = (name: string, ...exercises: string[]) => ({
    name,
    kind: "lifting" as const,
    exercises: exercises.map((n) => ({ exerciseName: n, prescribedSets: [{ setNumber: 1, type: "working" as const, reps: 5, amrap: false }] })),
  });
  const block = (weeks: { week: number; rotation?: "A" | "B"; sessions: ReturnType<typeof session>[] }[]) => ({
    name: "Block",
    rationale: "",
    clientSummary: "",
    weeks,
  });

  test("an old one-week draft reads as that week copied to every planned week", () => {
    const old = { name: "Old", rationale: "", clientSummary: "", phasing: { plannedWeeks: 3, phase: "accumulation" }, sessions: [session("Lower", "Squat")] };
    const d = AiProgramDraft.parse(old);
    expect(d.weeks.map((w) => w.week)).toEqual([1, 2, 3]);
    expect(d.weeks[2].sessions[0].exercises[0].exerciseName).toBe("Squat");
    expect("sessions" in d).toBe(false);
    // Without phasing it is one week; a draft with weeks passes through.
    expect((upgradeDraft({ ...old, phasing: undefined }) as AiProgramDraft).weeks).toHaveLength(1);
    const already = block([{ week: 1, sessions: [session("Lower", "Squat")] }]);
    expect(upgradeDraft(already)).toBe(already);
  });

  test("weeks must be in order, each once", () => {
    const s = [session("Lower", "Squat")];
    expect(AiProgramDraft.safeParse(block([{ week: 2, sessions: s }, { week: 1, sessions: s }])).success).toBe(false);
    expect(AiProgramDraft.safeParse(block([{ week: 1, sessions: s }, { week: 1, sessions: s }])).success).toBe(false);
  });

  test("block rules: every planned week, same lifting count, odd A / even B, B differs from A", () => {
    const a = [session("Lower", "Squat"), session("Upper", "Bench")];
    const b = [session("Lower", "Deadlift"), session("Upper", "Overhead Press")];
    const ab = block([
      { week: 1, rotation: "A", sessions: a },
      { week: 2, rotation: "B", sessions: b },
      { week: 3, rotation: "A", sessions: a },
      { week: 4, rotation: "B", sessions: b },
    ]);
    expect(draftWeekIssues(ab, { plannedWeeks: 4, alternate: true })).toEqual([]);
    expect(draftWeekIssues(ab, { plannedWeeks: 5, alternate: true })).toEqual(["missing week 5: write every week of the block in full"]);
    const sameAsA = { ...ab, weeks: ab.weeks.map((w) => ({ ...w, sessions: a })) };
    expect(draftWeekIssues(sameAsA, { plannedWeeks: 4, alternate: true })).toEqual([
      "the B routine repeats the A routine: B weeks must use different exercises",
    ]);
    const swapped = { ...ab, weeks: ab.weeks.map((w) => ({ ...w, rotation: w.rotation === "A" ? ("B" as const) : ("A" as const) })) };
    expect(draftWeekIssues(swapped, { plannedWeeks: 4, alternate: true })[0]).toContain('week 1 must be rotation "A"');
    const short = { ...ab, weeks: [ab.weeks[0], { ...ab.weeks[1], sessions: [b[0]] }] };
    expect(draftWeekIssues(short, { plannedWeeks: 2, alternate: true })).toEqual(["week 2 has 1 lifting sessions, not 2"]);
    expect(draftWeekIssues(ab, { plannedWeeks: 4, alternate: true, liftingSessions: 3 })).toHaveLength(4);
  });

  test("a same-every-week block drops letters the AI added; fill drafts leave locked weeks out", () => {
    const s = [session("Lower", "Squat")];
    const lettered = block([{ week: 1, rotation: "A", sessions: s }, { week: 2, rotation: "B", sessions: s }]);
    const parsed = blockDraftSchema({ plannedWeeks: 2, alternate: false }).parse(lettered);
    expect(parsed.weeks.map((w) => w.rotation)).toEqual([undefined, undefined]);
    const fill = block([{ week: 2, sessions: s }, { week: 3, sessions: s }]);
    expect(draftWeekIssues(fill, { plannedWeeks: 3, alternate: false, lockedWeeks: [1] })).toEqual([]);
    expect(draftWeekIssues(block([{ week: 1, sessions: s }, ...fill.weeks]), { plannedWeeks: 3, alternate: false, lockedWeeks: [1] })).toEqual([
      "week 1 is the trainer's (locked): leave it out",
    ]);
  });

  test("sameLetterWeeks: every week with the letter, or every week without letters", () => {
    const s = [session("Lower", "Squat")];
    const ab = block([1, 2, 3, 4].map((week) => ({ week, rotation: week % 2 ? ("A" as const) : ("B" as const), sessions: s })));
    expect(sameLetterWeeks(ab, 2)).toEqual([2, 4]);
    expect(sameLetterWeeks(block([1, 2, 3].map((week) => ({ week, sessions: s }))), 2)).toEqual([1, 2, 3]);
  });

  test("mockApplyProposal edits every week the change reaches", () => {
    const ab = block([1, 2, 3].map((week) => ({ week, rotation: week % 2 ? ("A" as const) : ("B" as const), sessions: [session("Lower", "Squat")] })));
    const next = mockApplyProposal(ab, { summary: "s", changes: [{ week: 1, day: 1, slot: 1, kind: "edit", from: "Squat", to: "Squat", detail: "" }] });
    const rest = next.weeks.map((w) => w.sessions[0].exercises[0].prescribedSets[0].restSeconds);
    expect(rest).toEqual([75, undefined, 75]);
  });
});

describe("resizeDraftWeeks", () => {
  const s = (n: string) => [{ name: n, kind: "lifting" as const, exercises: [{ exerciseName: n, prescribedSets: [{ setNumber: 1, type: "working" as const, reps: 5, amrap: false }] }] }];
  const ab: AiProgramDraft = {
    name: "B",
    rationale: "",
    clientSummary: "",
    weeks: [
      { week: 1, rotation: "A", sessions: s("Squat") },
      { week: 2, rotation: "B", sessions: s("Deadlift") },
    ],
  };
  test("grows by copying the last week with the new week's letter, and cuts", () => {
    const grown = resizeDraftWeeks(ab, 5);
    expect(grown.weeks.map((w) => `${w.week}${w.rotation}:${w.sessions[0].name}`)).toEqual(["1A:Squat", "2B:Deadlift", "3A:Squat", "4B:Deadlift", "5A:Squat"]);
    expect(resizeDraftWeeks(grown, 3).weeks.map((w) => w.week)).toEqual([1, 2, 3]);
  });
});

describe("mentionsAlternating", () => {
  test("A/B, alternate, odd/even and Thai say alternate; plain notes don't", () => {
    for (const n of ["make it A/B weeks", "Alternate lower focus", "odd/even weeks differ", "Week B is lighter", "สัปดาห์คี่ squat", "สลับท่า"]) {
      expect(mentionsAlternating(n)).toBe(true);
    }
    for (const n of ["more volume on bench", "a bit heavier", "about 4 weeks"]) expect(mentionsAlternating(n)).toBe(false);
  });
});

describe("withLockedWeeks", () => {
  test("the trainer's weeks come back locked, in order; an AI copy of a locked week is dropped", () => {
    const s = (n: string) => [{ name: n, kind: "lifting" as const, exercises: [{ exerciseName: n, prescribedSets: [{ setNumber: 1, type: "working" as const, reps: 5, amrap: false }] }] }];
    const ai: AiProgramDraft = { name: "F", rationale: "", clientSummary: "", weeks: [{ week: 1, sessions: s("AI W1") }, { week: 2, sessions: s("W2") }, { week: 3, sessions: s("W3") }] };
    const merged = withLockedWeeks(ai, [{ week: 1, sessions: s("Mine") }]);
    expect(merged.weeks.map((w) => `${w.week}:${w.sessions[0].name}:${w.locked ?? false}`)).toEqual(["1:Mine:true", "2:W2:false", "3:W3:false"]);
  });
});
