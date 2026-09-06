import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema.ts";

// A function, not a module constant: the URL is read at request time
// (STACK_RULES.md secrets rule), and nothing can import a connected client
// at build time by accident.
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set — see .env.example");
  }
  return drizzle(neon(url), { schema });
}

export type Db = ReturnType<typeof getDb>;
