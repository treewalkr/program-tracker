import { Elysia, t, type Static } from "elysia";
import type { LoginTheme } from "@pt/shared";
import { getLoginTheme } from "../lib/login-theme";

/**
 * The login page's look, as saved by the admin — validates both the GET reply
 * and the admin's PUT body. Literal unions, not t.UnionEnum: that one defaults a
 * missing field to its first value, and a PUT must name both.
 */
export const LoginThemeBody = t.Object(
  {
    variant: t.Union([t.Literal("classic"), t.Literal("split"), t.Literal("bold"), t.Literal("minimal")]),
    accent: t.Union([t.Literal("green"), t.Literal("blue"), t.Literal("purple"), t.Literal("orange")]),
  },
  { additionalProperties: false },
);

// compile-time: the schema and @pt/shared's LOGIN_VARIANTS / LOGIN_ACCENTS list the same values
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const inSync: Same<Static<typeof LoginThemeBody>, LoginTheme> = true;
void inSync;

/**
 * Unauthenticated, read-only data the signed-out app needs. Mounted before
 * the trainer guard; nothing here may expose trainer data.
 */
export const publicRoutes = new Elysia({ prefix: "/v1/public", tags: ["public"] }).get(
  "/login-theme",
  async ({ set }) => {
    set.headers["cache-control"] = "no-store";
    return getLoginTheme();
  },
  {
    response: LoginThemeBody,
    detail: { summary: "The login page's layout and accent (classic when unset)" },
  },
);
