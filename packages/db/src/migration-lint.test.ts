import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { LAST_GRANDFATHERED, LINT_HELP, migrationNumber, stripComments, unsafeChanges } from "./migration-lint";

describe("unsafeChanges", () => {
  const unsafe: [string, string][] = [
    ["DROP TABLE", `DROP TABLE "old_things";`],
    ["DROP COLUMN", `ALTER TABLE "clients" DROP COLUMN "nickname";`],
    ["DROP TYPE", `DROP TYPE "public"."mood";`],
    ["RENAME", `ALTER TABLE "clients" RENAME COLUMN "name" TO "full_name";`],
    ["RENAME", `ALTER TABLE "clients" RENAME TO "people";`],
    ["RENAME", `ALTER TYPE "public"."mood" RENAME VALUE 'ok' TO 'fine';`],
    ["ALTER COLUMN … TYPE", `ALTER TABLE "sets" ALTER COLUMN "reps" SET DATA TYPE numeric;`],
    ["ALTER COLUMN … TYPE", `ALTER TABLE sets ALTER COLUMN reps TYPE numeric USING reps::numeric;`],
    ["SET NOT NULL", `ALTER TABLE "clients" ALTER COLUMN "email" SET NOT NULL;`],
    ["ADD CONSTRAINT … CHECK|UNIQUE", `ALTER TABLE "sets" ADD CONSTRAINT "reps_positive" CHECK ("reps" > 0);`],
    ["ADD CONSTRAINT … CHECK|UNIQUE", `ALTER TABLE "clients" ADD CONSTRAINT "clients_email_unique" UNIQUE("email");`],
    ["CREATE UNIQUE INDEX", `CREATE UNIQUE INDEX "clients_email_idx" ON "clients" USING btree ("email");`],
    ["ADD COLUMN … NOT NULL without DEFAULT", `ALTER TABLE "clients" ADD COLUMN "tier" text NOT NULL;`],
  ];
  for (const [rule, sql] of unsafe) {
    test(`catches ${rule}: ${sql}`, () => {
      expect(unsafeChanges(sql)).toContain(rule);
    });
  }

  test("allows additive changes", () => {
    const sql = `ALTER TABLE "clients" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "feedback_comments" ADD COLUMN "silent" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE TABLE "things" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "things_name_idx" ON "things" USING btree ("name");
ALTER TABLE "things" ADD CONSTRAINT "things_owner_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id");`;
    expect(unsafeChanges(sql)).toEqual([]);
  });

  test("checks each ADD COLUMN clause on its own", () => {
    expect(unsafeChanges(`ALTER TABLE t ADD COLUMN a int DEFAULT 0 NOT NULL, ADD COLUMN b int NOT NULL;`)).toEqual([
      "ADD COLUMN … NOT NULL without DEFAULT",
    ]);
    expect(unsafeChanges(`ALTER TABLE t ADD COLUMN a int NOT NULL DEFAULT 0, ADD COLUMN b int;`)).toEqual([]);
  });

  test("ignores comments and string literals", () => {
    const sql = `-- we used to DROP TABLE here and RENAME things
/* DROP COLUMN "x"; SET NOT NULL */
ALTER TABLE "clients" ADD COLUMN "status" text DEFAULT 'rename -- not a comment';`;
    expect(unsafeChanges(sql)).toEqual([]);
  });

  test("a contract marker allows the file", () => {
    const sql = `-- contract: nothing reads element_shot since v0.1.20
ALTER TABLE "feedback" DROP COLUMN "element_shot";`;
    expect(unsafeChanges(sql)).toEqual([]);
  });

  test("the marker needs a reason", () => {
    expect(unsafeChanges(`-- contract:\nDROP TABLE "x";`)).toEqual(["DROP TABLE"]);
  });
});

describe("stripComments", () => {
  test("keeps -- inside quotes", () => {
    expect(stripComments(`SELECT '--a', "b--c" -- tail`)).toBe(`SELECT '--a', "b--c"  `);
  });
});

describe("migrationNumber", () => {
  test("reads the numeric prefix", () => {
    expect(migrationNumber("0063_add_thing.sql")).toBe(63);
    expect(migrationNumber("0062_feedback_silent.sql")).toBe(62);
    expect(migrationNumber("_journal.json")).toBeNull();
  });
});

describe("drizzle migrations", () => {
  const dir = new URL("../drizzle/", import.meta.url).pathname;
  const files = readdirSync(dir).filter((f) => (migrationNumber(f) ?? 0) > LAST_GRANDFATHERED);

  test("migrations after 0062 are expand-only or marked contract", () => {
    const problems = files.flatMap((f) => {
      const hits = unsafeChanges(readFileSync(dir + f, "utf8"));
      return hits.length ? [`${f}: ${hits.join(", ")}`] : [];
    });
    if (problems.length) throw new Error(`Unsafe migration(s):\n  ${problems.join("\n  ")}\n\n${LINT_HELP}`);
  });
});
