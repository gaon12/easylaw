import process from "node:process";
import { defineConfig } from "drizzle-kit";

/**
 * 사전 DB의 마이그레이션 설정. **세 번째 파일이다**(`src/db/dict/schema.ts`).
 * 밖에서 받아 온 자료만 담기고, 지우고 다시 받아도 서비스 자료는 다치지 않는다.
 */
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/dict/schema.ts",
  out: "./drizzle/dict",
  dbCredentials: {
    url: process.env.DICT_DB_PATH ?? "data/dict.sqlite",
  },
  strict: true,
  verbose: true,
});
