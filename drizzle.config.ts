import { defineConfig } from "drizzle-kit";

// drizzle-kit runs outside Next, so it loads the env file itself. The URL is
// read here at invocation, never committed anywhere.
process.loadEnvFile(".env.local");

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL missing from .env.local — see .env.example");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL },
});
