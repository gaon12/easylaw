/**
 * 코퍼스 안에서 내용으로 찾기. `PRODUCT.md` §5.2
 *
 * **사건번호만으로는 찾을 수 없다.** §5.2가 적어 둔 그대로 사용자는 사건번호를 정확히
 * 모르는 경우가 더 많다. 지금까지 내용 검색은 전부 법제처 API가 했는데, 그러면 키가 없는
 * 설치에서는 **이미 우리 DB에 받아 둔 판결문조차 제목으로도 못 찾는다.**
 *
 * 색인은 FTS5 가상 테이블(`judgment_fts`)이고 마이그레이션 `0005`에 그 정의와 한계를
 * 적어 두었다. 여기서는 **질의를 안전하게 만드는 일**과 결과를 모으는 일만 한다.
 */

import { inArray, sql } from "drizzle-orm";
import type { CorpusDb } from "../client";
import { judgment } from "./schema";

/** 한 번에 돌려줄 판결문 수. 화면이 더 보여 주기를 원하면 그때 늘린다. */
const DEFAULT_LIMIT = 20;

/** 질의어 한 조각의 길이 상한. 이보다 긴 낱말은 잘라 넣는다 — 색인에 그런 토큰이 없다. */
const MAX_TERM = 40;

/** 낱말을 가르는 공백. 최상위에 둔다 — 검색마다 정규식을 다시 만들지 않는다. */
const WHITESPACE = /\s+/u;

/**
 * 사용자 입력을 FTS5 질의로 바꾼다.
 *
 * **연산자를 흘려보내지 않는다.** FTS5의 `MATCH`는 `AND`·`NEAR`·`*`·`^`·`:` 같은 문법을
 * 갖고 있어서, 입력을 그대로 넘기면 검색이 아니라 **질의 문법 주입**이 된다(§7).
 * 그래서 낱말마다 큰따옴표로 감싸고(안의 따옴표는 제거) 접두사 `*`만 우리가 붙인다.
 *
 * 접두사 검색을 붙이는 이유는 한국어 토큰화의 한계 때문이다 — 기본 토크나이저는 띄어쓰기로만
 * 자르므로 "도로교통법"을 "도로교통"으로 찾으려면 접두사가 필요하다.
 */
function toMatchQuery(raw: string): string | undefined {
  const terms = raw
    .split(WHITESPACE)
    .map((term) => term.replaceAll('"', "").slice(0, MAX_TERM).trim())
    .filter((term) => term.length > 0);

  if (terms.length === 0) {
    return;
  }
  return terms.map((term) => `"${term}"*`).join(" ");
}

interface JudgmentHit {
  readonly judgmentId: string;
  readonly caseNoCanonical: string;
  readonly caseNoDisplay: string;
  readonly caseName: string | null;
  readonly court: string | null;
  readonly decidedAt: Date | null;
  /** 질의어가 나온 자리. 앞뒤를 잘라 온 조각이고 강조 표시는 화면이 한다. */
  readonly snippet: string;
}

interface MatchRow {
  readonly judgment_id: string;
  readonly snippet: string;
}

/** 한 문서에서 몇 문장까지 걸릴 것으로 보고 넉넉히 가져올까. */
const ROWS_PER_JUDGMENT = 5;

/**
 * 내용·사건명으로 판결문을 찾는다.
 *
 * **두 걸음으로 나눈다.**
 *
 * 1. 색인을 훑어 `judgment_id`와 걸린 자리(`snippet`)를 뽑는다. FTS5의 보조 함수
 *    (`snippet`·`rank`)는 **색인을 곧바로 훑는 질의에서만** 쓸 수 있어서, 같은 SELECT에
 *    `group by`나 윈도 함수를 붙이면 "unable to use function snippet"으로 죽는다
 *    (실제로 겪었다). 그래서 이 질의는 조건 하나에 정렬 하나뿐이다.
 * 2. 판결문 메타데이터는 **한 번의 질의로** 모아 온다. 20건에 대해 한 건씩 조회하면
 *    그것이 곧 N+1이다(§10.2).
 *
 * 판결문 하나당 한 줄만 남긴다 — 같은 문서의 문장 스무 개가 걸리면 검색 결과가 한 사건으로
 * 가득 찬다. 가장 잘 맞는 조각 하나만 보여 주고 나머지는 그 문서를 열어서 본다.
 */
function searchJudgments(
  db: CorpusDb,
  query: string,
  limit: number = DEFAULT_LIMIT,
): JudgmentHit[] {
  const match = toMatchQuery(query);
  if (match === undefined) {
    return [];
  }

  /*
   * 문장이 여러 개 걸릴 것을 감안해 넉넉히 가져온 뒤 문서 단위로 줄인다.
   * 한 문서가 색인을 통째로 차지하는 경우가 있어 상한을 둔다.
   */
  const rows = db.all<MatchRow>(sql`
    select
      f.judgment_id as judgment_id,
      snippet(judgment_fts, 2, '', '', '…', 12) as snippet
    from judgment_fts f
    where judgment_fts match ${match}
    order by rank
    limit ${limit * ROWS_PER_JUDGMENT}
  `);

  const best = new Map<string, string>();
  for (const row of rows) {
    if (!best.has(row.judgment_id)) {
      best.set(row.judgment_id, row.snippet);
    }
    if (best.size >= limit) {
      break;
    }
  }
  if (best.size === 0) {
    return [];
  }

  const ids = [...best.keys()];
  const metadata = db
    .select({
      id: judgment.id,
      caseNoCanonical: judgment.caseNoCanonical,
      caseNoDisplay: judgment.caseNoDisplay,
      caseName: judgment.caseName,
      court: judgment.court,
      decidedAt: judgment.decidedAt,
    })
    .from(judgment)
    .where(inArray(judgment.id, ids))
    .all();
  const byId = new Map(metadata.map((row) => [row.id, row]));

  // 색인이 매긴 순서를 지킨다 — 메타데이터 조회 순서가 아니라 그쪽이 관련도다.
  return ids.flatMap((id) => {
    const row = byId.get(id);
    if (row === undefined) {
      return [];
    }
    return [
      {
        judgmentId: id,
        caseNoCanonical: row.caseNoCanonical,
        caseNoDisplay: row.caseNoDisplay,
        caseName: row.caseName,
        court: row.court,
        decidedAt: row.decidedAt,
        snippet: best.get(id) ?? "",
      },
    ];
  });
}

export { searchJudgments, toMatchQuery };
export type { JudgmentHit };
