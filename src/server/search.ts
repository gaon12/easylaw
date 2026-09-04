import "server-only";
import { corpusDb } from "@/db/client";
import { searchLawVersions } from "@/db/corpus/repository";
import { parseCaseNumber } from "@/lib/case-number/normalize";
import { expandCaseChoseongQuery } from "@/lib/case-number/search";
import { lawApi } from "@/lib/law-api/client";
import type { PrecedentSummary } from "@/lib/law-api/parse";
import { type LookupResult, lookupCase } from "@/server/lookup";

/**
 * 통합 검색. `PRODUCT.md` §5.2
 *
 * 예전에는 **사건번호로만** 찾을 수 있었다. 그런데 §5.2가 적어 둔 그대로,
 * **사용자는 사건번호를 정확히 모르는 경우가 더 많다.** 내용으로 찾으면 "결과가 없다"만
 * 나오는 화면은 막다른 곳이다.
 *
 * 그래서 세 가지를 한 번에 찾는다.
 *
 * | 무엇 | 어디서 | 비용 |
 * |---|---|---|
 * | 사건번호 | 코퍼스 → 법제처 | 왕복 1회(캐시 없을 때) |
 * | 법령 | **우리 DB** | 없음 |
 * | 판례 내용 | 법제처 | 왕복 1회 |
 *
 * 법령이 공짜인 이유는 판 목록을 미리 받아 뒀기 때문이다(§6.5). 법제처 키가 없어도
 * 법령 검색은 그대로 동작한다.
 */

/** 판례 내용 검색의 결과. 실패와 "0건"을 구분하려고 셋으로 나눈다. */
interface PrecedentSearch {
  readonly items: readonly PrecedentSummary[];
  readonly error?: string | undefined;
  readonly unavailable?: boolean | undefined;
}

interface LawHit {
  readonly lawId: string;
  readonly name: string;
  readonly shortName: string | null;
  readonly kind: string | null;
  readonly ministry: string | null;
  readonly effectiveAt: Date | null;
}

interface SearchResults {
  readonly query: string;
  /** 사건번호로 읽혔을 때의 결과. 아니면 undefined. */
  readonly caseLookup: LookupResult | undefined;
  readonly laws: readonly LawHit[];
  readonly precedents: readonly PrecedentSummary[];
  /** 판례 내용 검색이 실패한 이유. 성공했거나 시도하지 않았으면 undefined. */
  readonly precedentError: string | undefined;
  /** 법제처 연결이 없어 내용 검색을 못 했다. */
  readonly apiUnavailable: boolean;
}

const SEARCH_RESULT_LIMIT = 20;

/**
 * 내용으로 판례를 찾는다.
 *
 * **실패를 "0건"과 구분해 올린다.** 법제처가 잠깐 죽었을 때 "그런 판례가 없어요"라고 하면
 * 사용자는 없는 것으로 믿고 떠난다(§5.4의 안내가 무의미해진다).
 */
async function findPrecedents(
  queries: readonly string[],
  signal?: AbortSignal,
): Promise<PrecedentSearch> {
  const api = lawApi();
  if (api === undefined) {
    return { items: [], unavailable: true };
  }

  const searches = await Promise.allSettled(
    queries.map((query) => api.searchByKeyword(query, signal)),
  );
  const byId = new Map<string, PrecedentSummary>();
  let firstError: string | undefined;

  for (const search of searches) {
    if (search.status === "rejected") {
      firstError ??=
        search.reason instanceof Error ? search.reason.message : "판례를 찾지 못했습니다.";
      continue;
    }
    for (const item of search.value) {
      if (!byId.has(item.precedentId)) {
        byId.set(item.precedentId, item);
      }
    }
  }

  return {
    items: [...byId.values()].slice(0, SEARCH_RESULT_LIMIT),
    error: firstError,
  };
}

function toLawHit(row: {
  lawId: string;
  name: string;
  shortName: string | null;
  kind: string | null;
  ministry: string | null;
  effectiveAt: Date | null;
}): LawHit {
  return {
    lawId: row.lawId,
    name: row.name,
    shortName: row.shortName,
    kind: row.kind,
    ministry: row.ministry,
    effectiveAt: row.effectiveAt,
  };
}

/** 초성 후보별 결과를 순서대로 합치되, 같은 법의 여러 시행판은 한 번만 보여 준다. */
function findLaws(queries: readonly string[]): readonly LawHit[] {
  const byLaw = new Map<string, LawHit>();
  const db = corpusDb();

  for (const query of queries) {
    for (const row of searchLawVersions(db, query)) {
      if (!byLaw.has(row.lawId)) {
        byLaw.set(row.lawId, toLawHit(row));
      }
    }
  }

  return [...byLaw.values()].slice(0, SEARCH_RESULT_LIMIT);
}

/**
 * 한 낱말로 세 곳을 찾는다.
 *
 * 사건번호로 읽히면 그 조회를 함께 돌린다 — 사건번호처럼 생긴 말이 법령 이름일 수도
 * 있으므로 둘 중 하나만 하지 않는다.
 *
 * 법령 검색과 판례 검색은 **서로 기다리지 않는다.** 법령은 우리 DB라 즉시 끝나는데
 * 법제처 왕복을 기다리게 할 이유가 없다.
 */
async function searchEverything(query: string, signal?: AbortSignal): Promise<SearchResults> {
  const trimmed = query.trim();
  const parsed = parseCaseNumber(trimmed);
  const expanded = expandCaseChoseongQuery(trimmed);
  const contentQueries = expanded.length > 0 ? expanded : [trimmed];

  const [caseLookup, precedents] = await Promise.all([
    parsed.ok ? lookupCase(trimmed, signal) : Promise.resolve(undefined),
    /*
     * 사건번호로 정확히 읽혔으면 내용 검색을 하지 않는다. 그 경우 화면이 바로 그 판례로
     * 보내므로, 결과를 쓰지도 않을 왕복을 한 번 더 하는 셈이 된다.
     */
    parsed.ok
      ? Promise.resolve<PrecedentSearch>({ items: [] })
      : findPrecedents(contentQueries, signal),
  ]);

  return {
    query: trimmed,
    caseLookup,
    laws: findLaws(contentQueries),
    precedents: precedents.items,
    precedentError: precedents.error,
    apiUnavailable: precedents.unavailable === true,
  };
}

export { searchEverything };
export type { LawHit, SearchResults };
