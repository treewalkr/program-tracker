import { describe, expect, test } from "bun:test";
import { REDACTED, redactJson, redactText } from "./redact";

describe("redactText", () => {
  const cases: [string, string, string][] = [
    ["email", "mail kai.t+pt@example.co.th please", "mail [email] please"],
    ["thai mobile, dashes", "โทร 081-234-5678 ได้เลย", "โทร [phone] ได้เลย"],
    ["thai mobile, bare", "call 0812345678", "call [phone]"],
    ["landline", "office 02-123-4567", "office [phone]"],
    ["international", "+66 81 234 5678", "[phone]"],
    ["bearer", "Authorization: Bearer abc.def-123", "Authorization: Bearer [redacted]"],
    [
      "jwt",
      "t=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "t=[token]",
    ],
    ["long hex", "session 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08", "session [token]"],
    ["thai untouched", "เซ็ตวอร์มอัพไม่ชัดเจน", "เซ็ตวอร์มอัพไม่ชัดเจน"],
    ["client name stays", "Somchai's program, week 3", "Somchai's program, week 3"],
    ["uuid stays", "id 01234567-0123-4abc-8def-0123456789ab", "id 01234567-0123-4abc-8def-0123456789ab"],
    ["date stays", "2026-11-17 at 18:00", "2026-11-17 at 18:00"],
    ["weights stay", "100 110 120 kg x 5", "100 110 120 kg x 5"],
    ["version stays", "0.1.33+be8f5a6", "0.1.33+be8f5a6"],
  ];
  for (const [name, input, want] of cases) test(name, () => expect(redactText(input)).toBe(want));
});

describe("redactJson", () => {
  test("masks secret-named keys and strings, nested, without touching the input", () => {
    const input = {
      client: { name: "สมชาย", email: "s@x.com", phoneNumber: "0812345678", weeks: [1, 2] },
      session: { accessToken: "abc", cookie: null },
      notes: ["reach me at a@b.io", { password: "hunter2" }],
      ok: true,
      n: 3,
    };
    const copy = structuredClone(input);
    expect(redactJson(input)).toEqual({
      client: { name: "สมชาย", email: REDACTED, phoneNumber: REDACTED, weeks: [1, 2] },
      session: { accessToken: REDACTED, cookie: null },
      notes: ["reach me at [email]", { password: REDACTED }],
      ok: true,
      n: 3,
    });
    expect(input).toEqual(copy);
  });

  test("scalars and null pass through", () => {
    expect(redactJson(null)).toBeNull();
    expect(redactJson(5)).toBe(5);
    expect(redactJson("x@y.com")).toBe("[email]");
  });
});
