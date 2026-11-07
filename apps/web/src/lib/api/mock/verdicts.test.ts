import { describe, expect, test } from "bun:test";
import { mockApi } from "./api";

describe("mock adapter: LLM verdicts", () => {
  test("the latest verdict per subject wins; unrated subjects are absent", async () => {
    await mockApi.rateLlmOutput({ subjectKind: "chat_message", subjectId: "m1", signal: "thumbs_up" });
    const down = await mockApi.rateLlmOutput({
      subjectKind: "chat_message",
      subjectId: "m1",
      signal: "thumbs_down",
      reasonTags: ["off_topic"],
      comment: "  answer it  ",
    });
    expect(down.comment).toBe("answer it");
    const got = await mockApi.llmVerdicts(["m1", "m2"]);
    expect(got).toHaveLength(1);
    expect(got[0].signal).toBe("thumbs_down");
    expect(got[0].reasonTags).toEqual(["off_topic"]);
    await expect(
      mockApi.recordLlmSignal({ subjectKind: "client_message", subjectId: "c1", signal: "client_message_copied" })
    ).resolves.toBeUndefined();
  });
});
