/**
 * 테스트용 데이터베이스.
 *
 * `.dev/CONVENTIONS.md` §10.2 — 스키마를 손으로 복제한 픽스처를 쓰지 않는다.
 * **실제 마이그레이션을 적용한** 임시 DB에서 돌려야 마이그레이션 버그를 테스트가 잡는다.
 */

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { appSchema } from "./app/schema";
import type { AppDb, CorpusDb } from "./client";
import { corpusSchema } from "./corpus/schema";

function createTestCorpusDb(): { db: CorpusDb; close: () => void } {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema: corpusSchema });
  migrate(db, { migrationsFolder: "drizzle/corpus" });

  return {
    db,
    close: () => {
      sqlite.close();
    },
  };
}

function createTestAppDb(): { db: AppDb; close: () => void } {
  const sqlite = new Database(":memory:");
  // 외래 키를 켜야 문서 삭제 시 문장·마스킹 요약이 함께 지워지는지 테스트가 확인할 수 있다.
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, { schema: appSchema });
  migrate(db, { migrationsFolder: "drizzle/app" });

  return {
    db,
    close: () => {
      sqlite.close();
    },
  };
}

export { createTestAppDb, createTestCorpusDb };
