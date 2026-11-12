import { describe, expect, test } from "bun:test";
import { isRedirect } from "@sveltejs/kit";
import type { Session } from "$lib/api/auth";
import { load } from "./+layout";

const run = (session: Session) => load({ parent: async () => ({ session }) } as unknown as Parameters<typeof load>[0]);
const trainer = (isAdmin: boolean): Session =>
  ({ kind: "signedIn", trainer: { id: "t1", name: "Kai", email: "kai@x.test", avatarUrl: null, isAdmin } }) as Session;

describe("workspace settings gate", () => {
  test("sends trainers back to their own settings", async () => {
    const err = await run(trainer(false)).catch((e: unknown) => e);
    expect(isRedirect(err)).toBe(true);
    expect(err).toMatchObject({ status: 307, location: "/settings" });
  });

  test("lets admins and open sessions through", async () => {
    await expect(run(trainer(true))).resolves.toBeUndefined();
    await expect(run({ kind: "open" })).resolves.toBeUndefined();
  });
});
