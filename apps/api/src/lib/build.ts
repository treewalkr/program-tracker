import { execSync } from "node:child_process";
import { buildId } from "@pt/shared";
import rootPackage from "../../../../package.json";

/** Commit of this deploy: Render's env var in production, else local git, else unknown. */
function commit(): string | null {
  if (process.env.RENDER_GIT_COMMIT) return process.env.RENDER_GIT_COMMIT;
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

/** "0.1.3+42a93f5" — the root package.json version plus the commit. */
export const API_BUILD = buildId(rootPackage.version, commit());

/** "0.1.3" — the release this API runs; stamped on feedback marked done. */
export const API_VERSION: string = rootPackage.version;
