import { app } from "./app";
import { logEmailConfig } from "./lib/mailer";

const port = Number(process.env.API_PORT ?? 4000);
app.listen(port);
console.log(`program-tracker API listening on :${port}`);
logEmailConfig();
