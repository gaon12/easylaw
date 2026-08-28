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
];

for (const target of DATABASES) {
  const absolute = resolve(process.cwd(), target.path);
  mkdirSync(dirname(absolute), { recursive: true });

  const sqlite = new Database(absolute);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  migrate(drizzle(sqlite), { migrationsFolder: target.migrations });
  sqlite.close();

  process.stdout.write(`${target.name}: 마이그레이션 완료 (${target.path})\n`);
}
