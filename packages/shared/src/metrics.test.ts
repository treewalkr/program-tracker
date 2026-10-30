import { describe, expect, test } from "bun:test";
import {
  chainBalanceText,
  chainSetCounts,
  chainsForExercise,
  type ChainCatalogEntry,
  type ChainDef,
} from "./index";

describe("chainsForExercise", () => {
  test("maps primary and secondary groups onto chains", () => {
    const chains: ChainDef[] = [
      { id: "c-deep", name: "Deep Longitudinal", muscleGroups: ["hamstrings", "calves"] },
      { id: "c-lateral", name: "Lateral", muscleGroups: ["quads"] },
      { id: "c-posterior", name: "Posterior Spiral", muscleGroups: ["glutes"] },
    ];
    const rdl: ChainCatalogEntry = {
      id: "ex-rdl",
      primaryMuscleGroup: "hamstrings",
      secondaryMuscleGroups: ["glutes", "back"],
    };
    expect(chainsForExercise(rdl, chains)).toEqual(["c-deep", "c-posterior"]);

    const cardio: ChainCatalogEntry = {
      id: "ex-cardio",
      primaryMuscleGroup: "cardio",
      secondaryMuscleGroups: [],
    };
    expect(chainsForExercise(cardio, chains)).toEqual([]);
  });
});

describe("chainSetCounts", () => {
  test("counts only working sets since the window start", () => {
    const chains: ChainDef[] = [
      { id: "c-deep", name: "Deep Longitudinal", muscleGroups: ["hamstrings"] },
      { id: "c-lateral", name: "Lateral", muscleGroups: ["quads"] },
    ];
    const catalog: ChainCatalogEntry[] = [
      { id: "ex-rdl", primaryMuscleGroup: "hamstrings", secondaryMuscleGroups: [] },
    ];
    const logs = [
      {
        date: "2026-10-20",
        sets: [
          { exerciseId: "ex-rdl", type: "working" },
          { exerciseId: "ex-rdl", type: "working" },
          { exerciseId: "ex-rdl", type: "backoff" },
        ],
      },
      {
        date: "2026-10-10",
        sets: [
          { exerciseId: "ex-rdl", type: "working" },
        ],
      },
    ];

    const counts = chainSetCounts(chains, logs, catalog, "2026-10-15");
    expect(counts["c-deep"]).toBe(2);
    expect(counts["c-lateral"]).toBe(0);
  });
});

describe("chainBalanceText", () => {
  test("names every chain and flags untrained", () => {
    const chains: ChainDef[] = [
      { id: "c-1", name: "Intrinsic", muscleGroups: ["core"] },
      { id: "c-2", name: "Deep Longitudinal", muscleGroups: ["back"] },
      { id: "c-3", name: "Lateral", muscleGroups: ["quads"] },
    ];
    const countsWithZero = {
      "c-1": 5,
      "c-2": 31,
      "c-3": 0,
    };
    const textWithZero = chainBalanceText(chains, countsWithZero);
    expect(textWithZero).toContain("untrained: Lateral");
    expect(textWithZero).toBe(
      "Intrinsic 5 · Deep Longitudinal 31 · Lateral 0 working sets · untrained: Lateral"
    );

    const countsNoZero = {
      "c-1": 5,
      "c-2": 31,
      "c-3": 2,
    };
    const textNoZero = chainBalanceText(chains, countsNoZero);
    expect(textNoZero).not.toContain("untrained");
    expect(textNoZero).toBe(
      "Intrinsic 5 · Deep Longitudinal 31 · Lateral 2 working sets"
    );
  });
});
