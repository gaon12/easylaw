import process from "node:process";
import { defineConfig } from "drizzle-kit";

/** 사용자 문서 DB의 마이그레이션 설정. `.dev/PRODUCT.md` §6.1 — 코퍼스와 다른 파일이다. */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/app/schema.ts",
  out: "./drizzle/app",
  dbCredentials: {
    url: process.env.APP_DB_PATH ?? "data/app.sqlite",
  },
  strict: true,
  verbose: true,
});
