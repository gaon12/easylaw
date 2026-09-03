import "server-only";
import { lawApiKey } from "@/server/settings";
import { type ListPage, parseListPage } from "./envelope";
import {
  type PrecedentDetail,
  type PrecedentSummary,
  parseDetailResponse,
  parseSearchResponse,
  readRejection,
} from "./parse";
import {
  type DecisionDetail,
  type DecisionSummary,
  parseDecisionDetailResponse,
  parseDecisionSummary,
} from "./parse-decision";
import {
  type LawDetail,
  type LawSummary,
  parseLawDetailResponse,
  parseLawSummary,
} from "./parse-law";
import {
  parseTermDetailResponse,
  parseTermSummary,
  type TermDefinition,
  type TermSummary,
  termSeqParam,
} from "./parse-term";
import { TARGETS } from "./targets";

/**
 * 법제처 국가법령정보 판례 API 클라이언트. `.dev/PRODUCT.md` §5.1 · [F-31]
 *
 * **인터페이스로 감싸 두는 이유**: 폐쇄망 배포([F-23])와 테스트에서 구현을 갈아 끼워야 한다.
 * 애플리케이션 코드는 이 인터페이스만 본다.
 */
interface LawApi {
  /** 사건번호로 판례를 찾는다. 없으면 빈 배열 — 이것이 예외가 아니라 흔한 결과다(§5.4). */
  searchByCaseNumber(caseNo: string, signal?: AbortSignal): Promise<PrecedentSummary[]>;
  /**
   * 내용으로 판례를 찾는다. 사건번호를 모르는 사람이 훨씬 많다(§5.2).
   *
   * 사건번호 검색과 파라미터가 다르다 — `nb=`가 아니라 `query=`다. 같은 함수에 섞으면
   * 어느 쪽으로 찾았는지가 흐려지고, 결과가 0건일 때 원인을 짚을 수 없다.
   */
  searchByKeyword(query: string, signal?: AbortSignal): Promise<PrecedentSummary[]>;
  /** 판례일련번호로 본문을 가져온다. */
  fetchDetail(precedentId: string, signal?: AbortSignal): Promise<PrecedentDetail | undefined>;

  /**
   * 법령을 이름으로 찾는다. 조문 인용 실존 검증([F-30])의 출발점이다.
   * `PRODUCT.md` §5.5 [6a]
   */
  searchLaws(query: string, signal?: AbortSignal): Promise<ListPage<LawSummary>>;
  /** 법령 본문을 조문 단위로 가져온다. 열쇠는 `법령일련번호`(MST)다. */
  fetchLaw(lawSerial: string, signal?: AbortSignal): Promise<LawDetail>;

  /** 법령용어를 찾는다. 용어 풀이의 공식 정의([F-29])가 여기에서 온다. */
  searchTerms(query: string, signal?: AbortSignal): Promise<ListPage<TermSummary>>;
  /** 용어 정의를 가져온다. **여러 열쇠를 한 번에** 넘긴다(한 낱말에 정의가 여럿이다). */
  fetchTerms(termIds: readonly string[], signal?: AbortSignal): Promise<TermDefinition[]>;

  /** 헌재결정례를 찾는다. 판례와 같은 뷰어 파이프라인을 탄다. */
  searchDecisions(query: string, signal?: AbortSignal): Promise<ListPage<DecisionSummary>>;
  fetchDecision(decisionId: string, signal?: AbortSignal): Promise<DecisionDetail>;
}

const SEARCH_URL = "https://www.law.go.kr/DRF/lawSearch.do";
const SERVICE_URL = "https://www.law.go.kr/DRF/lawService.do";
const REQUEST_TIMEOUT_MS = 10_000;

/** 내용 검색 한 번에 받을 판례 수. 화면 한 장에 담길 만큼만 받는다. */
const PRECEDENT_LIMIT = 20;

class LawApiError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "LawApiError";
    this.status = status;
  }
}

/** 호출자가 준 signal과 자체 타임아웃을 합친다. 외부 API가 안 끝나면 우리 요청도 안 끝난다. */
function withTimeout(signal: AbortSignal | undefined): {
  signal: AbortSignal;
  done: () => void;
} {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  return { signal: combined, done: () => undefined };
}

async function requestJson(url: URL, signal: AbortSignal | undefined): Promise<unknown> {
  const { signal: combined } = withTimeout(signal);

  const response = await fetch(url, {
    signal: combined,
    headers: { Accept: "application/json" },
    // 캐시는 우리 DB(api_cache)가 맡는다. fetch 계층 캐시를 겹치면 무효화 지점이 둘이 된다.
    cache: "no-store",
  });

  if (!response.ok) {
    throw new LawApiError(`법제처 API 응답이 ${response.status}입니다.`, response.status);
  }

  const text = await response.text();

  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    // 인증키가 틀리면 JSON 대신 HTML 안내 페이지가 온다. 그대로 파싱하면 알 수 없는 오류가 된다.
    throw new LawApiError("법제처 API가 JSON이 아닌 응답을 보냈습니다. 인증키를 확인하세요.");
  }

  /*
   * 법제처는 인증 실패에도 200으로 답한다. 여기서 걸러 내지 않으면 목록 스키마가 터지고,
   * zod 오류 덤프가 그대로 화면까지 올라간다(`/search`의 `api_error` 경로).
   */
  const rejection = readRejection(payload);
  if (rejection !== undefined) {
    throw new LawApiError(rejection);
  }

  return payload;
}

/** 목록 요청 주소. 카테고리마다 다른 것은 `target` 하나뿐이다. */
function searchUrl(oc: string, target: string, params: Record<string, string>): URL {
  const url = new URL(SEARCH_URL);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", target);
  url.searchParams.set("type", "JSON");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url;
}

/**
 * 본문 요청 주소.
 *
 * 열쇠 이름이 카테고리마다 다르다 — `ID`인 것과 `MST`인 것, 그리고 용어의 `trmSeqs`.
 * `targets.ts`의 표가 그 차이를 갖고 있으므로 여기서는 받아 쓰기만 한다.
 */
function serviceUrl(oc: string, target: string, keyName: string, keyValue: string): URL {
  const url = new URL(SERVICE_URL);
  url.searchParams.set("OC", oc);
  url.searchParams.set("target", target);
  url.searchParams.set("type", "JSON");
  url.searchParams.set(keyName, keyValue);
  return url;
}

/** 판례 — 사건번호 조회의 주 경로(§5.1). */
function precedentMethods(
  oc: string,
): Pick<LawApi, "searchByCaseNumber" | "searchByKeyword" | "fetchDetail"> {
  return {
    async searchByCaseNumber(caseNo, signal) {
      const url = new URL(SEARCH_URL);
      url.searchParams.set("OC", oc);
      url.searchParams.set("target", "prec");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("nb", caseNo);
      const payload = await requestJson(url, signal);
      try {
        return parseSearchResponse(payload);
      } catch {
        /*
         * 여기까지 왔다는 것은 200이고, JSON이고, 실패 봉투도 아닌데 형태가 다르다는 뜻이다.
         * zod가 만든 이슈 배열을 그대로 올리면 화면에 JSON 덩어리가 뜬다 — 사용자가 할 수
         * 있는 일이 아무것도 없는 메시지다.
         */
        throw new LawApiError("법제처 응답의 형태가 예상과 다릅니다.");
      }
    },

    async searchByKeyword(query, signal) {
      const url = searchUrl(oc, TARGETS.prec.target, { query, display: String(PRECEDENT_LIMIT) });
      const payload = await requestJson(url, signal);
      try {
        return parseSearchResponse(payload);
      } catch {
        throw new LawApiError("법제처 응답의 형태가 예상과 다릅니다.");
      }
    },

    async fetchDetail(precedentId, signal) {
      const url = new URL(SERVICE_URL);
      url.searchParams.set("OC", oc);
      url.searchParams.set("target", "prec");
      url.searchParams.set("type", "JSON");
      url.searchParams.set("ID", precedentId);
      try {
        return parseDetailResponse(await requestJson(url, signal));
      } catch (error) {
        if (error instanceof LawApiError) {
          throw error;
        }
        // 없는 일련번호면 형태가 다른 응답이 온다. "없음"과 "고장"을 구분해서 알린다.
        return;
      }
    },
  };
}

/** 법령 — 조문 인용 실존 검증([F-30])이 쓴다. */
function lawMethods(oc: string): Pick<LawApi, "searchLaws" | "fetchLaw"> {
  return {
    async searchLaws(query, signal) {
      const url = searchUrl(oc, TARGETS.law.target, { query, display: "20" });
      return parseListPage(await requestJson(url, signal), TARGETS.law, parseLawSummary);
    },

    async fetchLaw(lawSerial, signal) {
      const url = serviceUrl(oc, TARGETS.law.target, TARGETS.law.detailKey, lawSerial);
      return parseLawDetailResponse(await requestJson(url, signal));
    },
  };
}

/** 법령용어 — 용어 풀이의 공식 정의([F-29])가 여기에서 온다. */
function termMethods(oc: string): Pick<LawApi, "searchTerms" | "fetchTerms"> {
  return {
    async searchTerms(query, signal) {
      const url = searchUrl(oc, TARGETS.lstrm.target, { query, display: "20" });
      return parseListPage(await requestJson(url, signal), TARGETS.lstrm, parseTermSummary);
    },

    async fetchTerms(termIds, signal) {
      if (termIds.length === 0) {
        // 빈 목록으로 부르면 API가 전체를 주거나 오류를 낸다. 둘 다 우리가 원한 것이 아니다.
        return [];
      }
      const url = serviceUrl(
        oc,
        TARGETS.lstrm.target,
        TARGETS.lstrm.detailKey,
        termSeqParam(termIds),
      );
      return parseTermDetailResponse(await requestJson(url, signal));
    },
  };
}

/** 헌재결정례 — 판례와 같은 뷰어 파이프라인을 탄다. */
function decisionMethods(oc: string): Pick<LawApi, "searchDecisions" | "fetchDecision"> {
  return {
    async searchDecisions(query, signal) {
      const url = searchUrl(oc, TARGETS.detc.target, { query, display: "20" });
      return parseListPage(await requestJson(url, signal), TARGETS.detc, parseDecisionSummary);
    },

    async fetchDecision(decisionId, signal) {
      const url = serviceUrl(oc, TARGETS.detc.target, TARGETS.detc.detailKey, decisionId);
      return parseDecisionDetailResponse(await requestJson(url, signal));
    },
  };
}

/**
 * 카테고리별 묶음을 하나로 합친다.
 *
 * 한 함수에 다 넣으면 카테고리를 더할 때마다 길어지기만 한다. 묶음을 나눠 두면
 * 새 카테고리는 함수 하나를 더하고 여기에 한 줄을 더하는 일이 된다.
 */
function createLawApi(oc: string): LawApi {
  return {
    ...precedentMethods(oc),
    ...lawMethods(oc),
    ...termMethods(oc),
    ...decisionMethods(oc),
  };
}

/**
 * 설정된 인증키로 클라이언트를 만든다. 키가 없으면 `undefined`.
 *
 * 호출하는 쪽은 `undefined`를 "판례 조회 기능이 꺼진 상태"로 다뤄야 한다 —
 * 키가 없다고 서비스 전체가 죽으면 개발도 업로드 경로도 막힌다.
 */
function lawApi(): LawApi | undefined {
  const oc = lawApiKey();
  return oc === undefined ? undefined : createLawApi(oc);
}

export { createLawApi, lawApi, LawApiError };
export type { LawApi };
