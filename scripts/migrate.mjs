/**
 * 마이그레이션 실행기.
 *
 * `.dev/CONVENTIONS.md` §10.2 — 운영 DB에 스키마를 `push`로 밀어 넣지 않는다.
 * 커밋된 SQL 파일만 적용한다.
 *
 * 애플리케이션 코드(TypeScript)를 import하지 않는다. 이 스크립트에 필요한 것은
 * 연결과 마이그레이션 폴더뿐이고, 그래야 별도 TS 러너 없이 `node`로 바로 돈다.
 *
 * 사용: npm run db:migrate
 */

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const DATABASES = [
  {
    name: "corpus",
    path: process.env.CORPUS_DB_PATH ?? "data/corpus.sqlite",
    migrations: "drizzle/corpus",
  },
  {
    name: "app",
    path: process.env.APP_DB_PATH ?? "data/app.sqlite",
    migrations: "drizzle/app",
  },
  {
    name: "legal",
    path: process.env.LEGAL_DB_PATH ?? "data/legal.sqlite",
    migrations: "drizzle/legal",
  },
  {
    name: "dict",
    path: process.env.DICT_DB_PATH ?? "data/dict.sqlite",
    migrations: "drizzle/dict",
  },
];

for (const target of DATABASES) {
  const absolute = resolve(process.cwd(), target.path);
  mkdirSync(dirname(absolute), { recursive: true });

  const sqlite = new Database(absolute);
  sqlite.pragma("journal_mode = WAL");

  /*
   * 마이그레이션 중에는 외래 키를 **끈다.**
   *
   * SQLite에서 컬럼을 지우거나 제약을 바꾸려면 새 테이블을 만들어 옮기고 옛 테이블을
   * DROP 해야 한다. 이때 외래 키가 켜져 있으면 `DROP TABLE user`가 자식 행(업로드 문서와
   * 그 문장)까지 조용히 지운다. 이 프로젝트에서 실제로 일어났다.
   *
   * 마이그레이션 파일 안의 `PRAGMA foreign_keys=OFF`로는 막지 못한다. 이 PRAGMA는
   * 트랜잭션 안에서 무시되는데, 러너가 마이그레이션 전체를 트랜잭션으로 감싸기 때문이다.
   * 그래서 트랜잭션이 시작되기 전, 연결 단계에서 꺼야 한다.
   */
  sqlite.pragma("foreign_keys = OFF");
  migrate(drizzle(sqlite), { migrationsFolder: target.migrations });
  sqlite.pragma("foreign_keys = ON");

  // 끄고 돌렸으니 끝나고 반드시 확인한다. 깨진 참조를 안고 계속 가면 더 나중에 터진다.
  const violations = sqlite.pragma("foreign_key_check");
  if (violations.length > 0) {
    sqlite.close();
    throw new Error(
      `${target.name}: 마이그레이션 후 외래 키가 깨졌습니다 (${violations.length}건). ` +
        JSON.stringify(violations.slice(0, 5)),
    );
  }

  sqlite.close();

  process.stdout.write(`${target.name}: 마이그레이션 완료 (${target.path})\n`);
}

/*
 * 2026-09: 법령자료를 판결문 코퍼스에서 분리했다. 기존 설치는 법령판과 이미 받아 둔 조문을
 * 잃으면 안 되므로 새 DB가 비어 있을 때 한 번만 복사한다. 옛 표는 복구용으로 남겨 둔다.
 */
const legalPath = resolve(process.cwd(), process.env.LEGAL_DB_PATH ?? "data/legal.sqlite");
const legacyCorpusPath = resolve(process.cwd(), process.env.CORPUS_DB_PATH ?? "data/corpus.sqlite");
if (legalPath !== legacyCorpusPath) {
  const legal = new Database(legalPath);
  legal.pragma("foreign_keys = OFF");
  legal.prepare("ATTACH DATABASE ? AS legacy_corpus").run(legacyCorpusPath);
  const hasLegacy = legal
    .prepare("SELECT 1 FROM legacy_corpus.sqlite_master WHERE type='table' AND name='law_version'")
    .get();
  const current = legal.prepare("SELECT count(*) AS n FROM law_version").get().n;
  if (hasLegacy && current === 0) {
    legal.exec(
      "DROP TRIGGER IF EXISTS law_fts_insert; DROP TRIGGER IF EXISTS law_fts_update; DROP TRIGGER IF EXISTS law_fts_delete;",
    );
    legal.transaction(() => {
      legal.exec(`INSERT OR IGNORE INTO law_version
        (id, law_id, mst, name, short_name, kind, ministry, promulgated_at, effective_at,
         history_code, body_fetched_at, sections, created_at)
        SELECT id, law_id, mst, name, short_name, kind, ministry, promulgated_at, effective_at,
         history_code, body_fetched_at, sections, created_at FROM legacy_corpus.law_version`);
      const hasArticles = legal
        .prepare(
          "SELECT 1 FROM legacy_corpus.sqlite_master WHERE type='table' AND name='law_article'",
        )
        .get();
      if (hasArticles) {
        legal.exec(`INSERT OR IGNORE INTO law_article
          (id, law_version_id, article_no, branch_no, title, body, effective_at, clauses, order_idx)
          SELECT id, law_version_id, article_no, branch_no, title, body, effective_at, clauses, order_idx
          FROM legacy_corpus.law_article`);
      }
      legal.exec(`DELETE FROM law_fts;
        INSERT INTO law_fts (law_id, name)
        SELECT law_id, group_concat(DISTINCT name) || ' ' || coalesce(group_concat(DISTINCT short_name), '')
        FROM law_version GROUP BY law_id;`);
    })();
    legal.exec(`CREATE TRIGGER law_fts_insert AFTER INSERT ON law_version BEGIN
      DELETE FROM law_fts WHERE law_id = new.law_id;
      INSERT INTO law_fts (law_id, name) SELECT law_id, group_concat(DISTINCT name) || ' ' || coalesce(group_concat(DISTINCT short_name), '') FROM law_version WHERE law_id = new.law_id GROUP BY law_id;
    END;
    CREATE TRIGGER law_fts_update AFTER UPDATE OF name, short_name ON law_version BEGIN
      DELETE FROM law_fts WHERE law_id = new.law_id;
      INSERT INTO law_fts (law_id, name) SELECT law_id, group_concat(DISTINCT name) || ' ' || coalesce(group_concat(DISTINCT short_name), '') FROM law_version WHERE law_id = new.law_id GROUP BY law_id;
    END;
    CREATE TRIGGER law_fts_delete AFTER DELETE ON law_version WHEN NOT EXISTS (SELECT 1 FROM law_version WHERE law_id = old.law_id) BEGIN
      DELETE FROM law_fts WHERE law_id = old.law_id;
    END;`);
    const copied = legal.prepare("SELECT count(*) AS n FROM law_version").get().n;
    process.stdout.write(`legal: 기존 법령자료 ${copied}건을 분리 DB로 옮겼습니다.\n`);
  }
  const copiedViolations = legal.pragma("foreign_key_check");
  if (copiedViolations.length > 0) {
    legal.close();
    throw new Error(
      `legal: 기존 자료 이전 후 외래 키가 깨졌습니다 (${copiedViolations.length}건).`,
    );
  }
  legal.exec("DETACH DATABASE legacy_corpus");
  legal.pragma("foreign_keys = ON");
  legal.close();
}
