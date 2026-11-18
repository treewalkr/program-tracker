import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { like } from "drizzle-orm";
import { appSettings, db } from "@pt/db";
import { assertTestDatabaseUrl } from "./testing/test-db";
import { flagEnabled, flagKilled, isFlagName, listFlags, setFlag } from "./lib/flags";

assertTestDatabaseUrl(process.env.DATABASE_URL);

let dbUp = false;
try {
  await db.select({ key: appSettings.key }).from(appSettings).limit(1);
  dbUp = true;
} catch {
  console.warn("Postgres unreachable — skipping flag DB tests");
}

test("flag names and the env kill switch", () => {
  expect(isFlagName("impersonation")).toBe(true);
  expect(isFlagName("nope")).toBe(false);
  expect(flagKilled("impersonation", { IMPERSONATION: "off" })).toBe(true);
  expect(flagKilled("impersonation", { IMPERSONATION: " OFF " })).toBe(true);
  expect(flagKilled("impersonation", { IMPERSONATION: "on" })).toBe(false);
  expect(flagKilled("impersonation", {})).toBe(false);
});

describe.skipIf(!dbUp)("flags over app_settings", () => {
  const savedEnv = process.env.IMPERSONATION;
  const clear = () => db.delete(appSettings).where(like(appSettings.key, "flag:%"));
  afterEach(async () => {
    if (savedEnv === undefined) delete process.env.IMPERSONATION;
    else process.env.IMPERSONATION = savedEnv;
    await clear();
  });
  afterAll(clear);

  test("off until set; set on, then off again", async () => {
    delete process.env.IMPERSONATION;
    await clear();
    expect(await flagEnabled("impersonation")).toBe(false);
    expect((await listFlags())[0]).toMatchObject({ name: "impersonation", enabled: false, stored: false, updatedAt: null });

    const on = await setFlag("impersonation", true, null);
    expect(on).toMatchObject({ enabled: true, stored: true, killed: false });
    expect(await flagEnabled("impersonation")).toBe(true);

    await setFlag("impersonation", false, null);
    expect(await flagEnabled("impersonation")).toBe(false);
  });

  test("IMPERSONATION=off beats the stored value", async () => {
    await setFlag("impersonation", true, null);
    process.env.IMPERSONATION = "off";
    expect(await flagEnabled("impersonation")).toBe(false);
    expect((await listFlags())[0]).toMatchObject({ enabled: false, stored: true, killed: true });
  });
});
