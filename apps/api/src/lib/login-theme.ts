import { eq } from "drizzle-orm";
import { appSettings, db } from "@pt/db";
import { DEFAULT_LOGIN_THEME, parseLoginTheme, type LoginTheme } from "@pt/shared";

const KEY = "login_theme";

/** The saved login theme, or the classic default when unset, malformed, or the DB is unreachable. */
export async function getLoginTheme(): Promise<LoginTheme> {
  try {
    const [row] = await db.select({ value: appSettings.value }).from(appSettings).where(eq(appSettings.key, KEY));
    return parseLoginTheme(row?.value);
  } catch (err) {
    console.warn("login theme: falling back to the default", err);
    return DEFAULT_LOGIN_THEME;
  }
}

export async function setLoginTheme(theme: LoginTheme, trainerId: string): Promise<LoginTheme> {
  const value = parseLoginTheme(theme);
  const now = new Date();
  await db
    .insert(appSettings)
    .values({ key: KEY, value, updatedAt: now, updatedBy: trainerId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now, updatedBy: trainerId } });
  return value;
}
