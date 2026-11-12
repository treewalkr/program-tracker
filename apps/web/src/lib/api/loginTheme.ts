import { DEFAULT_LOGIN_THEME, type LoginTheme } from "@pt/shared";
import { client } from "./treaty";

/** The login page's look over Eden — live API only (demo mode always shows the default). */
export const loginThemeApi = {
  /** Public. Falls back to the classic default if the API can't answer — the theme must never block sign-in. */
  async get(): Promise<LoginTheme> {
    try {
      const { data, error } = await client.v1.public["login-theme"].get();
      return error ? DEFAULT_LOGIN_THEME : data;
    } catch {
      return DEFAULT_LOGIN_THEME;
    }
  },
  /** Admin only. */
  async save(theme: LoginTheme): Promise<LoginTheme> {
    const { data, error } = await client.v1.admin["login-theme"].put(theme);
    if (error) throw new Error((error.value as { error?: string } | null)?.error ?? `request failed (${String(error.status)})`);
    return data;
  },
};
