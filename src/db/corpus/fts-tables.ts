/**
 * 전문 검색 색인의 테이블 정의. `CONVENTIONS.md` §10.1·§10.2
 *
 * **왜 스키마 파일과 나눠 두나.** 이 둘은 FTS5 **가상 테이블**이라 `drizzle-kit`이 만들 수
 * 없다(마이그레이션 `0005`·`0006`에서 손으로 만든다). 그런데 `schema.ts`에 두면 drizzle-kit이
 * 다음 `generate`에서 이것들을 평범한 테이블로 보고 `CREATE TABLE`을 뽑아 버린다.
 * 그래서 **drizzle-kit이 보는 경로 밖**에 두고, 쿼리에서만 쓴다.
 *
 * **그래도 ORM을 거친다.** 정의를 여기 두는 이유가 그것이다 — 검색 쿼리가 문자열 SQL이
 * 아니라 Drizzle 질의 빌더를 지나가고, 컬럼 이름이 타입으로 잡힌다. 방언에 매인 것은
 * `MATCH` 연산자 하나뿐이고 값은 언제나 바인딩된다(§7 — 문자열 결합 금지).
 *
 * **다른 DB로 옮길 때.** FTS5는 SQLite의 것이다. Postgres로 가면 `tsvector` + GIN 인덱스로
 * 바뀌는데, 바뀌는 것은 이 파일과 `search.ts`뿐이다 — 부르는 쪽(`server/search.ts`, 화면)은
 * `searchJudgments`·`searchLawIds`라는 같은 함수를 계속 쓴다. 저장소 함수 뒤에 쿼리를 두는
 * 규칙(§10.2)이 바로 이 갈아 끼우기를 위한 것이다.
 */

import { sqliteTable, text } from "drizzle-orm/sqlite-core";

/** 판례 색인. 사건명과 원문 문장이 들어간다(마이그레이션 `0005`). */
const judgmentFts = sqliteTable("judgment_fts", {
  judgmentId: text("judgment_id").notNull(),
  /** `name`(사건명) 또는 `span`(원문 문장). */
  kind: text("kind").notNull(),
  text: text("text").notNull(),
});

/** 법령 이름 색인. **법 하나에 한 줄**이다(마이그레이션 `0006`). */
const lawFts = sqliteTable("law_fts", {
  lawId: text("law_id").notNull(),
  name: text("name").notNull(),
});

export { judgmentFts, lawFts };
