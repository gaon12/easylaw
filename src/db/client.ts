import "server-only";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { env } from "@/lib/env";
import { appSchema } from "./app/schema";
import { corpusSchema } from "./corpus/schema";
import { dictSchema } from "./dict/schema";

/**
 * 데이터베이스 연결. `.dev/CONVENTIONS.md` §10
 *
 * `corpus`(공개 판례)와 `app`(사용자 문서)은 **파일이 다르다**. 서로 조인하지 않는다.
 * 두 저장소를 잇는 코드는 애플리케이션 레이어에만 둔다.
 *
 * `dict`(사전)는 세 번째 파일이다. 밖에서 받아 오는 자료만 담기고, 지우고 다시 받아도
 * 앞의 둘은 다치지 않는다.
 */

function openDatabase(path: string): Database.Database {
  const absolute = resolve(process.cwd(), path);
  mkdirSync(dirname(absolute), { recursive: true });

  const db = new Database(absolute);
  // 읽기가 쓰기를 막지 않는다. 온디맨드 생성 중에도 다른 사용자가 원문을 읽어야 한다.
  db.pragma("journal_mode = WAL");
  // 쓰기 잠금을 기다린다. 동시 생성 요청이 즉시 실패하는 것보다 낫다.
  db.pragma("busy_timeout = 5000");
  db.pragma("foreign_keys = ON");
  return db;
}

type CorpusDb = ReturnType<typeof createCorpusDb>;

function createCorpusDb(path: string = env().CORPUS_DB_PATH) {
  return drizzle(openDatabase(path), { schema: corpusSchema });
}

let cachedCorpus: CorpusDb | undefined;

/**
 * 프로세스당 하나의 연결을 재사용한다.
 *
 * Next의 개발 모드는 모듈을 여러 번 평가하므로 요청마다 새 연결을 만들면 파일 핸들이 샌다.
 */
function corpusDb(): CorpusDb {
  cachedCorpus ??= createCorpusDb();
  return cachedCorpus;
}

type AppDb = ReturnType<typeof createAppDb>;

function createAppDb(path: string = env().APP_DB_PATH) {
  return drizzle(openDatabase(path), { schema: appSchema });
}

let cachedApp: AppDb | undefined;

/** 사용자 문서 DB. `corpus`와 **다른 파일**이다. 두 연결을 한 함수에서 쓰지 않는다. */
function appDb(): AppDb {
  cachedApp ??= createAppDb();
  return cachedApp;
}

type DictDb = ReturnType<typeof createDictDb>;

function createDictDb(path: string = env().DICT_DB_PATH) {
  return drizzle(openDatabase(path), { schema: dictSchema });
}

let cachedDict: DictDb | undefined;

/**
 * 사전 DB. 표준국어대사전과 법령용어가 들어 있다.
 *
 * **읽기 전용에 가깝다.** 쓰는 것은 가져오기 스크립트뿐이고(`scripts/sync-dict.ts`),
 * 서비스는 낱말을 찾기만 한다. 그래서 다른 둘과 달리 사용자 요청이 이 파일에 쓰지 않는다.
 */
function dictDb(): DictDb {
  cachedDict ??= createDictDb();
  return cachedDict;
}

export { appDb, corpusDb, createAppDb, createCorpusDb, createDictDb, dictDb, openDatabase };
export type { AppDb, CorpusDb, DictDb };
