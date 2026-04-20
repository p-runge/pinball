import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "../env.js";
import * as schema from "./schema.js";

const client = postgres(serverEnv.DATABASE_URL);
export const db = drizzle(client, { schema });
