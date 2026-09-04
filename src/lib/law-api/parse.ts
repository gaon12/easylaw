/**
 * 법제처 판례 API 응답 파서.
 *
 * biome-ignore-all lint/style/useNamingConvention: 응답 필드명이 한국어다. 스키마 키는 API와
 * 글자 그대로 같아야 하며, 이름을 바꾸면 파싱이 조용히 실패한다.
 *
 * `.dev/CONVENTIONS.md` §7 — 외부 API 응답을 신뢰하지 않는다. 파싱 후 스키마로 검증한다.
 * 응답 필드가 한국어 키라서 도메인 타입으로 옮겨 두어야 나머지 코드가 읽힌다.
 */

import { z } from "zod";

/** 목록 조회의 한 건. */
interface PrecedentSummary {
  /** 본문 조회에 쓰는 판례일련번호. */
  readonly precedentId: string;
  readonly caseNo: string;
  readonly caseName: string;
  readonly court: string | undefined;
  readonly decidedAt: Date | undefined;
  readonly caseTypeName: string | undefined;
  /** 데이터 출처(대법원, 국세법령정보시스템 등). 화면에 출처로 표시한다([F-40]). */
  readonly sourceName: string | undefined;
}

interface PrecedentDetail extends PrecedentSummary {
  /** 판시사항 — 이 판결이 무엇을 다뤘는가. */
  readonly holdingSummary: string | undefined;
  /** 판결요지 — 법원의 판단 요약. */
  readonly judgmentSummary: string | undefined;
  /** 참조조문 — 인용 파싱의 출발점이 된다. */
  readonly citedStatutes: string | undefined;
  readonly citedPrecedents: string | undefined;
  /** 판결문 본문. 태그를 벗겨 낸 평문이다. */
  readonly content: string;
}

/** 응답 필드는 전부 문자열로 오거나 아예 빠질 수 있다. 숫자로 오는 경우도 있어 함께 받는다. */
const looseString = z.union([z.string(), z.number()]).optional();

const summarySchema = z.object({
  판례일련번호: z.union([z.string(), z.number()]),
  사건번호: z.string(),
  사건명: z.string().default(""),
  법원명: looseString,
  선고일자: looseString,
  사건종류명: looseString,
  데이터출처명: looseString,
});

/**
 * 실패 응답 봉투.
 *
 * 법제처는 인증키가 틀려도 **HTTP 200**으로 답하고, 본문에만 `result`/`msg`를 담는다.
 * 상태 코드만 보면 성공으로 읽히고, 그대로 목록 스키마에 넣으면 zod 오류 덤프가 나온다 —
 * 화면에 그 덤프가 그대로 뜨면 사용자는 무엇을 고쳐야 하는지 알 수 없다.
 *
 * `msg`는 실제로 원인을 말해 준다("서버장비의 IP주소 및 도메인주소를 등록해 주세요").
 * 이 API는 인증키만이 아니라 **호출하는 서버의 IP까지 등록**해야 통하기 때문에,
 * 이 문장을 그대로 전하는 것이 우리가 지어내는 어떤 말보다 낫다.
 */
const rejectionSchema = z.object({
  result: z.string(),
  msg: z.string().optional(),
});

/**
 * 실패 봉투이면 사람이 읽을 이유를 낸다. 아니면 undefined.
 *
 * 정상 응답에는 `result` 키가 없다(`PrecSearch`/`PrecService`가 최상위다). 그래서
 * 키의 존재만으로 구분할 수 있다.
 */
function readRejection(payload: unknown): string | undefined {
  const parsed = rejectionSchema.safeParse(payload);
  if (!parsed.success) {
    return;
  }
  const { result, msg } = parsed.data;
  return msg === undefined ? result : `${result} ${msg}`;
}

const searchSchema = z.object({
  PrecSearch: z.object({
    totalCnt: looseString,
    // 결과가 없으면 키 자체가 없고, 한 건이면 객체로 오는 API가 흔하다. 둘 다 받는다.
    prec: z.union([summarySchema, z.array(summarySchema)]).optional(),
  }),
});

/**
 * 본문 조회는 일련번호 키 이름이 다르다 — 목록은 `판례일련번호`, 본문은 `판례정보일련번호`.
 * 둘 다 받아 두지 않으면 본문 파싱이 통째로 실패한다.
 */
const detailSchema = z.object({
  PrecService: summarySchema.partial({ 판례일련번호: true }).extend({
    판례정보일련번호: z.union([z.string(), z.number()]).optional(),
    판시사항: looseString,
    판결요지: looseString,
    참조조문: looseString,
    참조판례: looseString,
    판례내용: z.string().default(""),
  }),
});

const BR_TAG = /<br\s*\/?>/giu;
const BLOCK_END = /<\/(p|div|li|tr)>/giu;
const ANY_TAG = /<[^>]*>/gu;
const MANY_NEWLINES = /\n{3,}/gu;
const TRAILING_SPACES = /[ \t]+$/gmu;
const NBSP = / /gu;

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&apos;", "'"],
  ["&nbsp;", " "],
]);

const ENTITY_PATTERN = /&(?:amp|lt|gt|quot|apos|#39|nbsp);/gu;

/**
 * 판례 본문의 HTML을 평문으로 바꾼다.
 *
 * 본문은 `<br/>`로 줄을 나누고 `【주 문】` 같은 표제를 그대로 담고 있다.
 * 태그를 남기면 문장 분할이 태그를 문장으로 세고, 근거 좌표가 통째로 어긋난다.
 */
function htmlToPlainText(html: string): string {
  return html
    .replace(BR_TAG, "\n")
    .replace(BLOCK_END, "\n")
    .replace(ANY_TAG, "")
    .replace(ENTITY_PATTERN, (entity) => ENTITIES.get(entity) ?? entity)
    .replace(NBSP, " ")
    .replace(TRAILING_SPACES, "")
    .replace(MANY_NEWLINES, "\n\n")
    .trim();
}

const DATE_WITH_DOTS = /^(\d{4})\.(\d{1,2})\.(\d{1,2})\.?$/u;
const DATE_COMPACT = /^(\d{4})(\d{2})(\d{2})$/u;

/**
 * 선고일자를 Date로. 목록은 `2026.05.20`, 본문 조회는 `20260520`으로 준다.
 *
 * 시간대를 붙이지 않고 UTC 자정으로 고정한다 — 선고일은 날짜이지 시각이 아니다.
 */
function parseDecidedAt(raw: string | number | undefined): Date | undefined {
  if (raw === undefined) {
    return;
  }
  const text = String(raw).trim();
  const matched = DATE_WITH_DOTS.exec(text) ?? DATE_COMPACT.exec(text);
  if (matched === null) {
    return;
  }
  const [, year, month, day] = matched;
  if (year === undefined || month === undefined || day === undefined) {
    return;
  }
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function optionalText(raw: string | number | undefined): string | undefined {
  if (raw === undefined) {
    return;
  }
  const text = String(raw).trim();
  return text.length > 0 ? text : undefined;
}

function toSummary(
  raw: Omit<z.infer<typeof summarySchema>, "판례일련번호"> & {
    판례일련번호?: string | number | undefined;
  },
  fallbackId?: string | number | undefined,
): PrecedentSummary {
  return {
    precedentId: String(raw.판례일련번호 ?? fallbackId ?? ""),
    caseNo: raw.사건번호.trim(),
    caseName: raw.사건명.trim(),
    court: optionalText(raw.법원명),
    decidedAt: parseDecidedAt(raw.선고일자),
    caseTypeName: optionalText(raw.사건종류명),
    sourceName: optionalText(raw.데이터출처명),
  };
}

/** 목록 응답 → 요약 배열. 형태가 어긋나면 던진다 — 조용히 빈 배열을 주면 "없음"과 구분되지 않는다. */
function parseSearchResponse(payload: unknown): PrecedentSummary[] {
  const parsed = searchSchema.parse(payload);
  const { prec } = parsed.PrecSearch;
  if (prec === undefined) {
    return [];
  }
  const list = Array.isArray(prec) ? prec : [prec];
  return list.map(toSummary);
}

/**
 * 이 `PrecService`가 정말 판례인가.
 *
 * **행정심판례(`target=decc`)의 본문도 `PrecService`로 온다**(`targets.ts`). 두 응답 모두
 * `사건번호`와 `사건명`을 갖고 있어서 봉투와 공통 필드만으로는 구분되지 않는다. 다른 점은
 * 판례에만 `판례내용`(과 판례 일련번호)이 있다는 것이다.
 *
 * 걸러 내지 않으면 행정심판례 응답이 **본문이 빈 판례 하나**로 조용히 통과한다.
 * 빈 원문은 문장이 0개이고, 그러면 근거를 매달 자리가 없는 판결문이 코퍼스에 남는다.
 *
 * **반드시 zod를 통과시키기 전의 원본을 본다.** `판례내용`에 `.default("")`가 걸려 있어서
 * 파싱 뒤에는 없던 키도 생긴다 — 파싱 결과로 판별하면 이 검사는 언제나 통과한다.
 */
function looksLikePrecedent(payload: unknown): boolean {
  if (payload === null || typeof payload !== "object") {
    return false;
  }
  const body = (payload as { PrecService?: unknown }).PrecService;
  if (body === null || typeof body !== "object") {
    return false;
  }
  return "판례내용" in body || "판례정보일련번호" in body || "판례일련번호" in body;
}

function parseDetailResponse(payload: unknown): PrecedentDetail {
  if (!looksLikePrecedent(payload)) {
    throw new Error("판례 본문이 아닙니다. 같은 봉투를 쓰는 다른 카테고리일 수 있습니다.");
  }
  const parsed = detailSchema.parse(payload).PrecService;
  return {
    ...toSummary(parsed, parsed.판례정보일련번호),
    holdingSummary: optionalText(parsed.판시사항 && htmlToPlainText(String(parsed.판시사항))),
    judgmentSummary: optionalText(parsed.판결요지 && htmlToPlainText(String(parsed.판결요지))),
    citedStatutes: optionalText(parsed.참조조문),
    citedPrecedents: optionalText(parsed.참조판례),
    content: htmlToPlainText(parsed.판례내용),
  };
}

export { htmlToPlainText, parseDecidedAt, parseDetailResponse, parseSearchResponse, readRejection };
export type { PrecedentDetail, PrecedentSummary };
