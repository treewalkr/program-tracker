/**
 * Expand/contract guard for migrations. A deploy migrates first and the previous
 * release keeps running against the new schema (during the deploy and after a
 * rollback), so a new migration may only add things that release tolerates.
 * Removing or tightening (drop, rename, retype, NOT NULL, new CHECK/UNIQUE) waits
 * for a later release and must say why it's safe with a `-- contract: <why>` line.
 */

/** Migrations up to this number predate the lint and are grandfathered. */
export const LAST_GRANDFATHERED = 62;

const RULES: { name: string; re: RegExp }[] = [
  { name: "DROP TABLE", re: /\bDROP\s+TABLE\b/i },
  { name: "DROP COLUMN", re: /\bDROP\s+COLUMN\b/i },
  { name: "DROP TYPE", re: /\bDROP\s+TYPE\b/i },
  { name: "RENAME", re: /\bRENAME\b/i },
  { name: "ALTER COLUMN … TYPE", re: /\bALTER\s+COLUMN\s+("[^"]*"|\S+)\s+(SET\s+DATA\s+)?TYPE\b/i },
  { name: "SET NOT NULL", re: /\bSET\s+NOT\s+NULL\b/i },
  { name: "ADD CONSTRAINT … CHECK|UNIQUE", re: /\bADD\s+(CONSTRAINT\s+("[^"]*"|\S+)\s+)?(CHECK|UNIQUE)\b/i },
  { name: "CREATE UNIQUE INDEX", re: /\bCREATE\s+UNIQUE\s+INDEX\b/i },
];

const CONTRACT_MARKER = /^[ \t]*--[ \t]*contract:[ \t]*\S/im;

/** SQL with `--` and `/* *\/` comments blanked out; quoted strings and identifiers are kept. */
export function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      // quoted literal/identifier; a doubled quote is an escape
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === c) {
          if (sql[j + 1] === c) j += 2;
          else break;
        } else j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl;
      out += " ";
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** True if any `ADD COLUMN` clause in the SQL is NOT NULL without a DEFAULT. */
function addsNotNullWithoutDefault(sql: string): boolean {
  for (const statement of sql.split(";")) {
    if (!/\bALTER\s+TABLE\b/i.test(statement)) continue;
    // each clause runs from one ADD COLUMN to the next (or the statement's end)
    for (const clause of statement.split(/\bADD\s+COLUMN\b/i).slice(1)) {
      const own = clause.split(/,\s*(?=ADD|DROP|ALTER|RENAME)\b/i)[0];
      if (/\bNOT\s+NULL\b/i.test(own) && !/\bDEFAULT\b/i.test(own)) return true;
    }
  }
  return false;
}

/** Unsafe changes found in a migration's SQL, ignoring comments. Empty when it has a contract marker. */
export function unsafeChanges(sql: string): string[] {
  if (CONTRACT_MARKER.test(sql)) return [];
  // string literals can't hold DDL; blank them so a value like 'rename' isn't a hit
  const code = stripComments(sql).replace(/'(?:[^']|'')*'/g, "''");
  const found = RULES.filter((r) => r.re.test(code)).map((r) => r.name);
  if (addsNotNullWithoutDefault(code)) found.push("ADD COLUMN … NOT NULL without DEFAULT");
  return found;
}

/** The migration number from a file name like `0063_foo.sql`, or null. */
export function migrationNumber(file: string): number | null {
  const m = /^(\d+)_.*\.sql$/.exec(file);
  return m ? Number(m[1]) : null;
}

export const LINT_HELP = `Deploys migrate first, and the previous release must keep working against the
new schema (it serves during the deploy and is what a rollback returns to).
So a migration may only expand: add tables, nullable or defaulted columns, indexes.
Contract (drop, rename, retype, SET NOT NULL, new CHECK/UNIQUE) in a later release,
once no live code depends on the old shape, and add a line saying why it's safe:
  -- contract: nothing reads element_shot since v0.1.20`;
