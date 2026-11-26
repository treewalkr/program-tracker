import { app } from "./app";
import { authBypassProblem } from "./lib/auth";
import { logEmailConfig } from "./lib/mailer";

const bypass = authBypassProblem(process.env);
if (bypass) {
  console.error(`refusing to start: AUTH_DISABLED=true but ${bypass}. Unset AUTH_DISABLED.`);
  process.exit(1);
}

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port);
console.log(`program-tracker API listening on :${port}`);
logEmailConfig();
