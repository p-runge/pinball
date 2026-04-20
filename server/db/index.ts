import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { serverEnv } from "../env";
import * as schema from "./schema";

const client = postgres(serverEnv.DATABASE_URL);
export const db = drizzle(client, { schema });
