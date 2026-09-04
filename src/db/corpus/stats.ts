/**
 * 코퍼스가 지금 무엇을 얼마나 갖고 있나.
 *
 * 첫 화면이 숫자를 말하려면 이 값들이 필요하다. **지어낸 숫자를 쓰지 않는다** —
 * 판결문을 다루는 서비스가 근거 없는 수치를 랜딩에 걸면 그 순간 신뢰를 잃는다
 * (`strings.ts`의 `home.originBody`에 적어 둔 것과 같은 이유다).
 *
 * `repository.ts`와 파일을 나눈 이유는 관심사다. 저쪽은 판결문 한 건을 읽고 쓰는 일을
 * 다루고, 이쪽은 **전체가 얼마나 되는지**만 센다.
 */

import { count, desc, isNotNull } from "drizzle-orm";
import type { CorpusDb } from "../client";
import { judgment, lawVersion } from "./schema";

interface CorpusStats {
  /** 캐시된 공개 판례 수. */
  readonly judgments: number;
  /** 받아 둔 법령 판(version) 수. `npm run law:sync`가 채운다. */
  readonly lawVersions: number;
}

function corpusStats(db: CorpusDb): CorpusStats {
  return {
    judgments: db.select({ value: count() }).from(judgment).get()?.value ?? 0,
    lawVersions: db.select({ value: count() }).from(lawVersion).get()?.value ?? 0,
  };
}

interface SampleJudgment {
  readonly caseNoCanonical: string;
  readonly caseNoDisplay: string;
  readonly caseName: string | null;
}

/**
 * 첫 화면에 걸 예시 판례.
 *
 * **본문까지 받아 둔 것만 고른다.** 메타데이터만 있는 행을 예시로 걸면 눌렀을 때
 * "아직 볼 수 없어요"가 나온다 — 첫 화면에서 그것만큼 나쁜 경험이 없다.
 *
 * 코퍼스가 비어 있으면 빈 배열이고, 화면은 예시 줄을 아예 그리지 않는다.
 */
function listSampleJudgments(db: CorpusDb, limit: number): SampleJudgment[] {
  return db
    .select({
      caseNoCanonical: judgment.caseNoCanonical,
      caseNoDisplay: judgment.caseNoDisplay,
      caseName: judgment.caseName,
    })
    .from(judgment)
    .where(isNotNull(judgment.textCachedAt))
    .orderBy(desc(judgment.decidedAt))
    .limit(limit)
    .all();
}

export { corpusStats, listSampleJudgments };
export type { CorpusStats, SampleJudgment };
