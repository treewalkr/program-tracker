import { DEFAULT_LOGIN_THEME } from "@pt/shared";
import { apiMode } from "$lib/api";
import { loginThemeApi } from "$lib/api/loginTheme";

/** The theme loads before the page renders, so the chosen layout never flashes in after a default one. */
export const load = async () => ({
  theme: apiMode === "live" ? await loginThemeApi.get() : DEFAULT_LOGIN_THEME,
});
