import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL ?? "postgres://pt:pt_dev_password@localhost:5433/program_tracker";

const run = async () => {
  const client = postgres(url, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("✓ migrations applied");
  await client.end();
};

run().catch((err) => {
  console.error("migration failed:", err);
  process.exit(1);
});
