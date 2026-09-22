import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "postgres://pt:pt_dev_password@localhost:5433/program_tracker";

const client = postgres(url, { max: 10 });

export const db = drizzle(client, { schema });
export { schema };
export * from "./schema";
