import "server-only";
import { statSync } from "node:fs";
import { and, count, desc, eq, isNull, or, sql } from "drizzle-orm";
import { auditLog, user } from "@/db/app/schema";
import { appDb, corpusDb, dictDb, legalDb } from "@/db/client";
import { judgment, judgmentSpan, lookupMiss, rendition, renditionAudio } from "@/db/corpus/schema";
import { dictEntry, dictSource, legalTerm } from "@/db/dict/schema";
import { lawArticle, lawVersion } from "@/db/legal/schema";
import { env } from "@/lib/env";

/**
 * 관리자 화면이 보는 숫자들. `PAGES.md` §17
 *
 * 화면마다 세는 법을 따로 적으면 같은 것을 다르게 세는 일이 생긴다. 세는 자리는 여기
 * 하나다. 화면은 그리기만 한다.
 *
 * **여기 있는 것은 전부 "몇 개인가"다.** 무엇이 들어 있는지는 세지 않는다 — 올린 문서의
 * 내용이나 사람의 검색어가 관리 화면에 늘어서면, 운영자가 볼 이유가 없는 것까지 보게 된다
 * (`PRODUCT.md` §7). 사건번호처럼 이미 공개된 것만 그대로 보여 준다.
 */

interface ContentCounts {
  readonly judgments: number;
  readonly renditions: number;
  readonly lawVersions: number;
  readonly lawArticles: number;
  readonly dictEntries: number;
  readonly legalTerms: number;
  readonly lookupMisses: number;
}

/**
 * 우리가 들고 있는 자료의 크기.
 *
 * 자료군은 **다른 파일**에 있고 서로 조인하지 않는다. 그래서 질의도 나뉜다 — 한 번에
 * 세는 방법은 없고, 있어서도 안 된다.
 */
function contentCounts(): ContentCounts {
  const corpus = corpusDb();
  const legal = legalDb();
  const dict = dictDb();

  const one = (rows: { n: number }[]): number => rows.at(0)?.n ?? 0;

  return {
    judgments: one(corpus.select({ n: count() }).from(judgment).all()),
    renditions: one(corpus.select({ n: count() }).from(rendition).all()),
    lawVersions: one(legal.select({ n: count() }).from(lawVersion).all()),
    lawArticles: one(legal.select({ n: count() }).from(lawArticle).all()),
    lookupMisses: one(corpus.select({ n: count() }).from(lookupMiss).all()),
    dictEntries: one(dict.select({ n: count() }).from(dictEntry).all()),
    legalTerms: one(dict.select({ n: count() }).from(legalTerm).all()),
  };
}

/**
 * 들고 있는 판례와 각각의 원문 상태.
 *
 * **문장 수를 함께 센다.** 본문이 잘린 채로 굳어 있어도 사건번호만 봐서는 알 수 없고,
 * 문장이 열 몇 개뿐인 대법원 판결은 눈에 띈다(실제로 그렇게 잘린 것을 찾았다).
 */
function listJudgments(limit: number) {
  return corpusDb()
    .select({
      caseNo: judgment.caseNoDisplay,
      caseNoCanonical: judgment.caseNoCanonical,
      id: judgment.id,
      court: judgment.court,
      spans: count(judgmentSpan.id),
      textCachedAt: judgment.textCachedAt,
    })
    .from(judgment)
    .leftJoin(
      judgmentSpan,
      and(
        eq(judgmentSpan.judgmentId, judgment.id),
        or(
          eq(judgmentSpan.revisionId, judgment.currentRevisionId),
          and(isNull(judgment.currentRevisionId), isNull(judgmentSpan.revisionId)),
        ),
      ),
    )
    .groupBy(judgment.id)
    .orderBy(desc(judgment.fetchedAt))
    .limit(limit)
    .all();
}

/** 사전 원본의 판과 받은 시각. 두 곳(표준국어대사전·법령용어)이 각각 한 줄이다. */
function dictSources() {
  return dictDb()
    .select({
      id: dictSource.id,
      label: dictSource.label,
      builtAt: dictSource.builtAt,
      fetchedAt: dictSource.fetchedAt,
      entries: dictSource.entries,
    })
    .from(dictSource)
    .orderBy(dictSource.id)
    .all();
}

/**
 * 찾았는데 없던 사건번호. **운영자가 볼 값이 맞다** — 사건번호는 이미 공개된 식별자이고,
 * 여기 자주 오르는 것이 곧 "우리가 아직 못 가져오는 것"이다.
 */
function listLookupMisses(limit: number) {
  return corpusDb()
    .select({
      caseNo: lookupMiss.caseNoCanonical,
      count: lookupMiss.count,
      lastTriedAt: lookupMiss.lastTriedAt,
    })
    .from(lookupMiss)
    .orderBy(desc(lookupMiss.lastTriedAt))
    .limit(limit)
    .all();
}

/**
 * 감사 기록. **쌓기만 하고 볼 곳이 없었다** — 계정이 언제 생겼는지, 누가 권한을 받았는지
 * 알아보려면 SQLite를 직접 열어야 했다.
 *
 * `meta`는 내용이 아니라 사실만 담는다(`schema.ts`). 그래도 화면에 그대로 붓지 않고
 * 글자로 옮겨 둔다 — 어떤 모양이 들어 있을지는 기록을 남긴 자리마다 다르다.
 */
function listAuditEntries(limit: number) {
  return appDb()
    .select({
      id: auditLog.id,
      /*
       * 행위자는 `user.id`로 적혀 있다. 아이디만 보여 주면 누구인지 알 수 없고, 그렇다고
       * 기록 쪽에 이름을 복사해 두면 이름을 바꿨을 때 옛 이름이 남는다. 읽을 때 잇는다 —
       * 탈퇴한 계정은 이어지지 않고, 그것이 맞다(기록은 남고 사람은 지워진다).
       */
      actorName: user.nickname,
      actorEmail: user.email,
      action: auditLog.action,
      target: auditLog.target,
      at: auditLog.at,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actor))
    .orderBy(desc(auditLog.at))
    .limit(limit)
    .all();
}

interface StorageRow {
  readonly label: string;
  readonly path: string;
  /** 파일이 아직 없으면 `undefined`. 0바이트와 구분한다. */
  readonly bytes: number | undefined;
}

/** 파일 크기. 없으면 `undefined` — 아직 안 만든 것과 빈 것은 다르다. */
function sizeOf(path: string): number | undefined {
  try {
    return statSync(path).size;
  } catch {
    return;
  }
}

/**
 * 디스크를 얼마나 쓰고 있나.
 *
 * 자가 호스팅에서 제일 먼저 차는 것이 사전(약 120MB)과 판례 본문이다. 어디가 커지고
 * 있는지 알 수 없으면 디스크가 찰 때까지 아무도 모른다.
 */
function storageRows(): StorageRow[] {
  const config = env();

  return [
    { label: "판결문", path: config.CORPUS_DB_PATH, bytes: sizeOf(config.CORPUS_DB_PATH) },
    { label: "법령자료", path: config.LEGAL_DB_PATH, bytes: sizeOf(config.LEGAL_DB_PATH) },
    { label: "서비스", path: config.APP_DB_PATH, bytes: sizeOf(config.APP_DB_PATH) },
    { label: "사전", path: config.DICT_DB_PATH, bytes: sizeOf(config.DICT_DB_PATH) },
  ];
}

/** 만들어 둔 음성이 몇 개이고 몇 바이트인가. 판례 쪽만 센다 — 올린 문서는 그 사람의 것이다. */
function audioStored(): { clips: number; bytes: number } {
  const row = corpusDb()
    .select({
      clips: count(),
      bytes: sql<number>`coalesce(sum(length(${renditionAudio.bytes})), 0)`,
    })
    .from(renditionAudio)
    .all()
    .at(0);

  return { clips: row?.clips ?? 0, bytes: row?.bytes ?? 0 };
}

export {
  audioStored,
  contentCounts,
  dictSources,
  listAuditEntries,
  listJudgments,
  listLookupMisses,
  storageRows,
};
export type { ContentCounts, StorageRow };
