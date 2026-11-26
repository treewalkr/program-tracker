import { describe, expect, test } from "bun:test";
import { memberCount } from "./memberCount.svelte";

const list = (...status: string[]) => async () => status.map((s) => ({ status: s }));

describe("memberCount", () => {
  test("counts members that are not archived", async () => {
    await memberCount.refresh(list("active", "paused", "archived"));
    expect(memberCount.value).toBe(2);
  });

  test("drops after a member is archived and rises when one is added", async () => {
    await memberCount.refresh(list("active", "active", "paused"));
    expect(memberCount.value).toBe(3);
    await memberCount.refresh(list("active", "archived", "paused"));
    expect(memberCount.value).toBe(2);
    await memberCount.refresh(list("active", "archived", "paused", "active"));
    expect(memberCount.value).toBe(3);
  });

  test("hides the badge when the list can't be read", async () => {
    await memberCount.refresh(list("active"));
    await memberCount.refresh(async () => {
      throw new Error("offline");
    });
    expect(memberCount.value).toBeNull();
  });
});
