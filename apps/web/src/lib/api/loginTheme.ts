import { DEFAULT_LOGIN_THEME, type LoginTheme } from "@pt/shared";
import { client } from "./treaty";

const message = (error: { status: unknown; value: unknown }) =>
  (error.value as { error?: string } | null)?.error ?? `request failed (${String(error.status)})`;

/** The login page's look over Eden — live API only (demo mode always shows the default). */
export const loginThemeApi = {
  /** Public; throws when the API can't answer (the admin editor must not mistake that for "unset"). */
  async load(): Promise<LoginTheme> {
    const { data, error } = await client.v1.public["login-theme"].get();
    if (error) throw new Error(message(error));
    return data;
  },
  /** For the login page: the classic default if the API can't answer — the theme must never block sign-in. */
  async get(): Promise<LoginTheme> {
    return loginThemeApi.load().catch(() => DEFAULT_LOGIN_THEME);
  },
  /** Admin only. */
  async save(theme: LoginTheme): Promise<LoginTheme> {
    const { data, error } = await client.v1.admin["login-theme"].put(theme);
    if (error) throw new Error(message(error));
    return data;
  },
};
