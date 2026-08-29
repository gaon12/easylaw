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

  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema: corpusSchema });
  migrate(db, { migrationsFolder: "drizzle/corpus" });
  sqlite.pragma("foreign_keys = ON");

  return {
    db,
    close: () => {
      sqlite.close();
    },
  };
}

function createTestAppDb(): { db: AppDb; close: () => void } {
  const sqlite = new Database(":memory:");

  /*
   * 마이그레이션은 외래 키를 끈 채로 돌린다 — SQLite의 테이블 재생성 방식이
   * 켜져 있으면 자식 행을 지운다(`scripts/migrate.mjs`의 같은 주석 참고).
   * 운영 러너와 같은 순서를 지켜야 테스트가 운영을 대변한다.
   */
  sqlite.pragma("foreign_keys = OFF");
  const db = drizzle(sqlite, { schema: appSchema });
  migrate(db, { migrationsFolder: "drizzle/app" });
  // 끝난 뒤 켠다. 문서 삭제 시 문장·마스킹 요약이 함께 지워지는지 테스트가 확인해야 한다.
  sqlite.pragma("foreign_keys = ON");

  return {
    db,
    close: () => {
      sqlite.close();
    },
  };
}

export { createTestAppDb, createTestCorpusDb };
