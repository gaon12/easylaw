import process from "node:process";
import { defineConfig } from "drizzle-kit";

/** 공개 코퍼스 DB의 마이그레이션 설정. `.dev/PRODUCT.md` §6.1 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/corpus/schema.ts",
  out: "./drizzle/corpus",
  dbCredentials: {
    url: process.env.CORPUS_DB_PATH ?? "data/corpus.sqlite",
  },
  strict: true,
  verbose: true,
});
