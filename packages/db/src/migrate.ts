import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Apply all drizzle migrations against the database at `url`. */
export async function runMigrations(url: string): Promise<void> {
  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  } finally {
    await client.end();
  }
}

if (import.meta.main) {
  const url = process.env.DATABASE_URL ?? "postgres://pt:pt_dev_password@localhost:5433/program_tracker";
  runMigrations(url)
    .then(() => console.log("✓ migrations applied"))
    .catch((err) => {
      console.error("migration failed:", err);
      process.exit(1);
    });
}
