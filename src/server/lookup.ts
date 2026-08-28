import "server-only";
import { corpusDb } from "@/db/client";
import {
  findJudgmentByCaseNo,
  listSpans,
  recordLookupMiss,
  saveJudgmentText,
  upsertJudgment,
} from "@/db/corpus/repository";
import { type ParseFailureReason, parseCaseNumber } from "@/lib/case-number/normalize";
import { lawApi } from "@/lib/law-api/client";
import type { PrecedentSummary } from "@/lib/law-api/parse";
import { segmentJudgment } from "@/lib/text/segment";

/** 저장해 둔 원문 링크에서 판례일련번호를 되찾는다. */
const PRECEDENT_ID_IN_URL = /ID=(\d+)/u;

/**
 * 사건번호 조회. `.dev/PRODUCT.md` §5.1
 *
 * 코퍼스 → 법제처 API → 없음. 이 순서를 지켜야 이미 만들어 둔 것을 다시 만들지 않는다.
 * 원문 캐시와 설명 생성은 분리한다 — 원문은 몇 초면 받아오지만 설명은 수십 초에 비용이 든다.
 */

interface CaseSummary {
  readonly caseNoCanonical: string;
  readonly caseNoDisplay: string;
  readonly caseName: string | null;
  readonly court: string | null;
  readonly decidedAt: Date | null;
  readonly caseType: string | null;
  readonly hasText: boolean;
}

type LookupResult =
  /** 코퍼스나 법제처에서 찾았다. */
  | { readonly kind: "found"; readonly summary: CaseSummary }
  /** 공개된 판결문이 없다. 실패가 아니라 흔한 결과다(§5.4) — 업로드로 안내한다. */
  | { readonly kind: "not_public"; readonly caseNoCanonical: string }
  /** 사건번호로 읽을 수 없는 입력. 키워드 검색으로 넘긴다. */
  | { readonly kind: "invalid"; readonly reason: ParseFailureReason; readonly code?: string }
  /** 법제처 키가 없어 조회 자체를 못 한다. 코퍼스에 있는 것만 보여 줄 수 있다. */
  | { readonly kind: "api_unavailable"; readonly caseNoCanonical: string }
  /** 법제처 API가 고장났다. "없음"과 반드시 구분해서 알린다. */
  | { readonly kind: "api_error"; readonly caseNoCanonical: string; readonly message: string };

function toSummary(row: {
  caseNoCanonical: string;
  caseNoDisplay: string;
  caseName: string | null;
  court: string | null;
  decidedAt: Date | null;
  caseType: string | null;
  textCachedAt: Date | null;
}): CaseSummary {
  return {
    caseNoCanonical: row.caseNoCanonical,
    caseNoDisplay: row.caseNoDisplay,
    caseName: row.caseName,
    court: row.court,
    decidedAt: row.decidedAt,
    caseType: row.caseType,
    hasText: row.textCachedAt !== null,
  };
}

/** 법제처가 준 판례 하나를 코퍼스에 넣는다. 메타데이터만 넣고 본문은 따로 받는다. */
function storePrecedent(canonical: string, precedent: PrecedentSummary): string {
  return upsertJudgment(corpusDb(), {
    caseNoCanonical: canonical,
    caseNoDisplay: precedent.caseNo,
    caseName: precedent.caseName.length > 0 ? precedent.caseName : undefined,
    court: precedent.court,
    decidedAt: precedent.decidedAt,
    caseType: precedent.caseTypeName,
    source: "law_go_kr",
    sourceUrl: `https://www.law.go.kr/DRF/lawService.do?target=prec&ID=${precedent.precedentId}&type=HTML`,
  });
}

async function lookupCase(input: string, signal?: AbortSignal): Promise<LookupResult> {
  const parsed = parseCaseNumber(input);
  if (!parsed.ok) {
    return parsed.code === undefined
      ? { kind: "invalid", reason: parsed.reason }
      : { kind: "invalid", reason: parsed.reason, code: parsed.code };
  }

  const canonical = parsed.canonical;
  const db = corpusDb();

  const cached = findJudgmentByCaseNo(db, canonical);
  if (cached) {
    return { kind: "found", summary: toSummary(cached) };
  }

  const api = lawApi();
  if (api === undefined) {
    return { kind: "api_unavailable", caseNoCanonical: canonical };
  }

  let results: PrecedentSummary[];
  try {
    results = await api.searchByCaseNumber(parsed.display, signal);
  } catch (error) {
    return {
      kind: "api_error",
      caseNoCanonical: canonical,
      message: error instanceof Error ? error.message : "판례를 조회하지 못했습니다.",
    };
  }

  const first = results[0];
  if (first === undefined) {
    // 하급심 대부분은 공개되지 않는다. 기록해 두면 나중에 알려 줄 수 있다([F-43]).
    recordLookupMiss(db, canonical);
    return { kind: "not_public", caseNoCanonical: canonical };
  }

  storePrecedent(canonical, first);
  const stored = findJudgmentByCaseNo(db, canonical);
  if (stored === undefined) {
    return {
      kind: "api_error",
      caseNoCanonical: canonical,
      message: "판례를 저장하지 못했습니다.",
    };
  }
  return { kind: "found", summary: toSummary(stored) };
}

/**
 * 원문을 확보한다. 이미 캐시가 있으면 그대로 쓰고, 없으면 법제처에서 받아 저장한다.
 *
 * 문장 분할 결과를 그대로 저장한다 — 이 좌표가 근거 연결의 기준이다.
 */
async function ensureJudgmentText(
  caseNoCanonical: string,
  signal?: AbortSignal,
): Promise<{ ok: true; spanCount: number } | { ok: false; reason: string }> {
  const db = corpusDb();
  const row = findJudgmentByCaseNo(db, caseNoCanonical);
  if (row === undefined) {
    return { ok: false, reason: "판례를 찾지 못했습니다." };
  }
  if (row.textCachedAt !== null) {
    return { ok: true, spanCount: listSpans(db, row.id).length };
  }

  const api = lawApi();
  if (api === undefined) {
    return { ok: false, reason: "판례 조회 기능이 꺼져 있습니다." };
  }

  const precedentId =
    row.sourceUrl === null ? undefined : PRECEDENT_ID_IN_URL.exec(row.sourceUrl)?.[1];
  if (precedentId === undefined) {
    return { ok: false, reason: "판례 일련번호를 알 수 없습니다." };
  }

  const detail = await api.fetchDetail(precedentId, signal);
  if (detail === undefined) {
    return { ok: false, reason: "판례 본문을 가져오지 못했습니다." };
  }

  const spans = segmentJudgment(detail.content);
  saveJudgmentText(db, row.id, spans);
  return { ok: true, spanCount: spans.length };
}

export { ensureJudgmentText, lookupCase };
export type { CaseSummary, LookupResult };
