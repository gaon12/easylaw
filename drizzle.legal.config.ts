import process from "node:process";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/legal/schema.ts",
  out: "./drizzle/legal",
  dbCredentials: { url: process.env.LEGAL_DB_PATH ?? "data/legal.sqlite" },
  strict: true,
  verbose: true,
});
