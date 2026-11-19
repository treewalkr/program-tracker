import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const web = join(import.meta.dir, "../../..");

describe("gql.tada output", () => {
  test("graphql-env.d.ts matches the API's SDL — run `bun run gql:generate` after editing schema.graphql", () => {
    const dir = mkdtempSync(join(tmpdir(), "gql-env-"));
    try {
      const out = join(dir, "graphql-env.d.ts");
      const run = Bun.spawnSync(["bun", "x", "gql.tada", "generate", "output", "--output", out], { cwd: web });
      expect(run.exitCode, run.stderr.toString()).toBe(0);
      expect(readFileSync(out, "utf8")).toBe(readFileSync(join(import.meta.dir, "graphql-env.d.ts"), "utf8"));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
