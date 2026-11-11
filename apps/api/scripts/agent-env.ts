/**
 * PT_API_URL and FEEDBACK_AGENT_TOKEN for scripts that call /v1/agent/feedback,
 * from the environment or the repo's gitignored .env.agent (the environment
 * wins). Null when either is missing.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

/** This checkout's .env.agent, else the main checkout's — scheduled runs land in fresh worktrees. */
function agentEnvFile(): string | null {
  const here = resolve(import.meta.dir, "../../../.env.agent");
  if (existsSync(here)) return here;
  const common = Bun.spawnSync(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: import.meta.dir });
  const main = common.success ? join(dirname(common.stdout.toString().trim()), ".env.agent") : null;
  return main && existsSync(main) ? main : null;
}

/** KEY=VALUE lines; # comments; optional quotes. */
export function agentEnv(): { url: string; token: string } | null {
  const file = agentEnvFile();
  const vars: Record<string, string> = {};
  if (file) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith("#")) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  const url = process.env.PT_API_URL ?? vars.PT_API_URL;
  const token = process.env.FEEDBACK_AGENT_TOKEN ?? vars.FEEDBACK_AGENT_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ""), token } : null;
}
