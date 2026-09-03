import "server-only";
import { lawApiKey } from "@/server/settings";
import {
  type PrecedentDetail,
  type PrecedentSummary,
  parseDetailResponse,
  parseSearchResponse,
  readRejection,
} from "./parse";

/**
 * 법제처 국가법령정보 판례 API 클라이언트. `.dev/PRODUCT.md` §5.1 · [F-31]
 *
 * **인터페이스로 감싸 두는 이유**: 폐쇄망 배포([F-23])와 테스트에서 구현을 갈아 끼워야 한다.
 * 애플리케이션 코드는 이 인터페이스만 본다.
 */
interface LawApi {
  /** 사건번호로 판례를 찾는다. 없으면 빈 배열 — 이것이 예외가 아니라 흔한 결과다(§5.4). */
  searchByCaseNumber(caseNo: string, signal?: AbortSignal): Promise<PrecedentSummary[]>;
  /** 판례일련번호로 본문을 가져온다. */
  fetchDetail(precedentId: string, signal?: AbortSignal): Promise<PrecedentDetail | undefined>;
}

const SEARCH_URL = "https://www.law.go.kr/DRF/lawSearch.do";
const SERVICE_URL = "https://www.law.go.kr/DRF/lawService.do";
const REQUEST_TIMEOUT_MS = 10_000;

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

function createLawApi(oc: string): LawApi {
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
