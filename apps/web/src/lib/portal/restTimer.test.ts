import { describe, expect, test } from "bun:test";
import { clock, idleRest, restIn, restOf, restRunning, secondsLeft, startRest } from "./restTimer";

describe("rest timer", () => {
  test("counts down from a wall-clock end, rounding up, never below zero", () => {
    expect(secondsLeft(10_000, 0)).toBe(10);
    expect(secondsLeft(10_000, 9_001)).toBe(1);
    expect(secondsLeft(10_000, 10_000)).toBe(0);
    expect(secondsLeft(10_000, 99_000)).toBe(0);
  });

  test("reads as m:ss", () => {
    expect(clock(125)).toBe("2:05");
    expect(clock(45)).toBe("0:45");
    expect(clock(0)).toBe("0:00");
  });

  test("the rest comes from the prescription, or there is none", () => {
    expect(restOf([{ restSeconds: null }, { restSeconds: 90 }])).toBe(90);
    expect(restOf([{}, { restSeconds: 0 }])).toBeNull();
  });

  test("a running rest outlives the timer, but not the session", () => {
    const run = startRest("s1", 90, 1_000);
    expect(restIn(run, "s1")).toBe(run);
    expect(restRunning(restIn(run, "s1"), 31_000)).toBe(true);
    expect(restIn(run, "s2")).toEqual(idleRest("s2"));
    expect(restRunning(restIn(run, "s2"), 31_000)).toBe(false);
    expect(restRunning(run, 91_000)).toBe(false);
  });
});
