import { redirect } from "@sveltejs/kit";

/** The login page editor now lives on Appearance; keep old links working. */
export const load = () => {
  redirect(308, "/settings#login-page");
};
