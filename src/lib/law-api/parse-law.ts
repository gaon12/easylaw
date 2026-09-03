/**
 * 현행법령 파서. `PRODUCT.md` §5.5 [6a] · [F-30]
 *
 * biome-ignore-all lint/style/useNamingConvention: 응답 필드명이 한국어다.
 * 스키마 키는 API와 글자 그대로 같아야 하며, 이름을 바꾸면 파싱이 조용히 실패한다.
 *
 * **왜 법령이 필요한가**: 생성한 설명이 "「도로교통법」 제3조 제1항에 따라…"라고 말할 때,
 * 그 조문이 **실제로 있는지** 확인해야 한다(§5.5 [6a] 조문 인용 실존 검증). 없는 조문을
 * 그럴듯하게 인용하는 것은 환각 중에서도 가장 알아채기 어려운 종류다.
 *
 * 그래서 이 파서의 목표는 "법령 전문을 예쁘게 보여 주기"가 아니라 **조 → 항을 열쇠로
 * 찾을 수 있게 만드는 것**이다.
 */

import { z } from "zod";
import { asArray, looseValue, openEnvelope, optionalText, parseApiDate } from "./envelope";
import { htmlToPlainText } from "./parse";
import { TARGETS } from "./targets";

/** 목록 한 건. */
interface LawSummary {
  /** 본문 조회에 쓰는 열쇠(`MST`). 법령ID와 다르다 — 이쪽이 특정 판을 가리킨다. */
  readonly lawSerial: string;
  /** 법령 자체의 id. 개정돼도 그대로다. */
  readonly lawId: string | undefined;
  readonly name: string;
  readonly shortName: string | undefined;
  /** 법률·대통령령·부령 등. */
  readonly kind: string | undefined;
  readonly ministry: string | undefined;
  readonly promulgatedAt: Date | undefined;
  readonly effectiveAt: Date | undefined;
  /** `현행`인가 `연혁`인가. 법제처가 주는 구분을 그대로 둔다. */
  readonly historyCode: string | undefined;
}

const summarySchema = z
  .object({
    법령일련번호: z.union([z.string(), z.number()]),
    법령ID: looseValue,
    법령명한글: z.string().default(""),
    법령약칭명: looseValue,
    법령구분명: looseValue,
    소관부처명: looseValue,
    공포일자: looseValue,
    시행일자: looseValue,
    현행연혁코드: looseValue,
  })
  .loose();

function toSummary(raw: unknown): LawSummary {
  const parsed = summarySchema.parse(raw);
  return {
    lawSerial: String(parsed.법령일련번호),
    lawId: optionalText(parsed.법령ID),
    name: parsed.법령명한글.trim(),
    shortName: optionalText(parsed.법령약칭명),
    kind: optionalText(parsed.법령구분명),
    ministry: optionalText(parsed.소관부처명),
    promulgatedAt: parseApiDate(parsed.공포일자),
    effectiveAt: parseApiDate(parsed.시행일자),
    historyCode: optionalText(parsed.현행연혁코드),
  };
}

/**
 * 조문 하나의 항.
 *
 * `항내용`은 항 번호를 **글자로 다시 포함한다**(`"① 특별시장…"`). 지우지 않고 그대로 둔다 —
 * 원문 대조([6a])는 우리가 손대지 않은 문자열로 해야 한다.
 */
interface LawClause {
  readonly number: string | undefined;
  readonly text: string;
}

interface LawArticle {
  /** 조 번호. `"3"`처럼 숫자 문자열이다. */
  readonly number: string;
  /**
   * 가지 번호. `제4조의2`의 `2`다. 없으면 undefined.
   *
   * **조 번호만으로는 조문이 유일하지 않다.** 도로교통법 2019년 판 209개 조문 중 29건이
   * 조 번호가 겹쳤고, 가지 번호를 봐야 갈렸다. 이것을 빠뜨리면 `제4조`를 찾을 때
   * `제4조의2`가 나올 수 있다 — 조문 실존 검증([F-30])에서 가장 나쁜 종류의 오답이다.
   */
  readonly branchNumber: string | undefined;
  readonly title: string | undefined;
  /** 조문 본문. 항이 있으면 대개 조 제목 줄만 들어 있다. */
  readonly text: string | undefined;
  readonly clauses: readonly LawClause[];
  readonly effectiveAt: Date | undefined;
}

interface LawDetail {
  readonly lawId: string | undefined;
  readonly name: string;
  readonly kind: string | undefined;
  readonly ministry: string | undefined;
  readonly promulgatedAt: Date | undefined;
  readonly effectiveAt: Date | undefined;
  readonly articles: readonly LawArticle[];
}

const clauseSchema = z.object({ 항번호: looseValue, 항내용: looseValue }).loose();

const articleSchema = z
  .object({
    조문번호: looseValue,
    조문가지번호: looseValue,
    조문제목: looseValue,
    조문내용: looseValue,
    조문시행일자: looseValue,
    /**
     * `"조문"`이면 진짜 조문이고 `"전문"`이면 장·절 제목이다(`"제1장 총칙"`).
     * 229개 중 75개가 `전문`이었다 — 걸러 내지 않으면 "조문 수"가 세 배로 부풀고,
     * 실존 검증이 장 제목을 조문으로 착각한다.
     */
    조문여부: looseValue,
    항: z.unknown().optional(),
  })
  .loose();

const detailSchema = z
  .object({
    기본정보: z
      .object({
        법령명_한글: z.string().default(""),
        법령ID: looseValue,
        공포일자: looseValue,
        시행일자: looseValue,
        소관부처: z.unknown().optional(),
        법종구분: z.unknown().optional(),
      })
      .loose(),
    조문: z.object({ 조문단위: z.unknown().optional() }).loose().optional(),
  })
  .loose();

/**
 * `소관부처`·`법종구분`은 값이 문자열일 때도 있고 `{ content, …코드 }` 객체일 때도 있다.
 * 둘 다 받아 글자만 꺼낸다.
 */
function contentText(raw: unknown): string | undefined {
  if (raw !== null && typeof raw === "object" && "content" in raw) {
    return optionalText((raw as { content: unknown }).content);
  }
  return optionalText(raw);
}

function toClause(raw: unknown): LawClause {
  const parsed = clauseSchema.parse(raw);
  return {
    number: optionalText(parsed.항번호),
    text: htmlToPlainText(String(parsed.항내용 ?? "")),
  };
}

/** 가지 번호는 없을 때 `""`로도 `"0"`으로도 온다. 둘 다 "없음"이다. */
function branchNumber(raw: unknown): string | undefined {
  const text = optionalText(raw);
  return text === undefined || text === "0" ? undefined : text;
}

/**
 * 조문 본문 앞에 붙은 `제2조(보통재판적) ` 머리를 뗀다.
 *
 * 항이 없는 조문은 `조문내용`에 **제목까지 포함한 한 줄**이 통째로 온다. 화면은 제목을
 * 따로 그리므로 그대로 두면 `제2조 (보통재판적)` 밑에 `제2조(보통재판적) 소는…`이 다시
 * 나온다. 머리가 없으면 아무것도 하지 않는다 — 못 찾았다고 본문을 자르지 않는다.
 */
function stripArticleHead(text: string, number: string, branch: string | undefined): string {
  const label = branch === undefined ? `제${number}조` : `제${number}조의${branch}`;
  const head = new RegExp(`^\s*${label}\s*(?:\([^)]*\))?\s*`, "u");
  return text.replace(head, "");
}

function toArticle(raw: unknown): LawArticle {
  const parsed = articleSchema.parse(raw);
  const number = String(parsed.조문번호 ?? "").trim();
  const branch = branchNumber(parsed.조문가지번호);
  const body = optionalText(parsed.조문내용 && htmlToPlainText(String(parsed.조문내용)));

  return {
    number,
    branchNumber: branch,
    title: optionalText(parsed.조문제목),
    text: body === undefined ? undefined : optionalText(stripArticleHead(body, number, branch)),
    clauses: asArray(parsed.항).map(toClause),
    effectiveAt: parseApiDate(parsed.조문시행일자),
  };
}

/** 장·절 제목이 아니라 실제 조문인가. */
function isArticle(raw: unknown): boolean {
  const kind = optionalText((raw as { 조문여부?: unknown } | null)?.조문여부);
  // 값이 없으면 조문으로 본다 — 없는 것을 통째로 버리는 쪽이 더 위험하다.
  return kind === undefined || kind === "조문";
}

function parseLawDetailResponse(payload: unknown): LawDetail {
  const body = openEnvelope(payload, TARGETS.law.detailEnvelope);
  const parsed = detailSchema.parse(body);
  const basic = parsed.기본정보;

  return {
    lawId: optionalText(basic.법령ID),
    name: basic.법령명_한글.trim(),
    kind: contentText(basic.법종구분),
    ministry: contentText(basic.소관부처),
    promulgatedAt: parseApiDate(basic.공포일자),
    effectiveAt: parseApiDate(basic.시행일자),
    articles: asArray(parsed.조문?.조문단위).filter(isArticle).map(toArticle),
  };
}

/**
 * 조 번호와 항 번호로 조문을 찾는다. [F-30]이 쓰는 함수다.
 *
 * 항 번호는 `"①"`처럼 동그라미 숫자로도, `"1"`처럼 아라비아 숫자로도 물어볼 수 있게
 * 둘 다 받는다 — 판결문은 `제1항`이라 쓰고 API는 `①`로 준다.
 */
const CIRCLED_ONE = 0x24_60;
const CIRCLED_COUNT = 20;

function circledToNumber(text: string): string | undefined {
  const code = text.codePointAt(0);
  if (code === undefined || code < CIRCLED_ONE || code >= CIRCLED_ONE + CIRCLED_COUNT) {
    return;
  }
  return String(code - CIRCLED_ONE + 1);
}

/**
 * 조문을 찾는다. **가지 번호까지 맞춰야 한다.**
 *
 * `제4조`를 찾을 때 `제4조의2`가 나오면 안 되므로, 가지 번호를 주지 않으면
 * 가지 번호가 **없는** 조문만 찾는다. 느슨하게 맞추면 조용히 틀린 조문을 돌려준다.
 */
function findArticle(
  detail: LawDetail,
  articleNo: string | number,
  branchNo?: string | number,
): LawArticle | undefined {
  const wantedNumber = String(articleNo).trim();
  const wantedBranch = branchNo === undefined ? undefined : String(branchNo).trim();
  return detail.articles.find(
    (article) => article.number === wantedNumber && article.branchNumber === wantedBranch,
  );
}

/** `제4조의2` · `제3조` 같은 표기를 조 번호와 가지 번호로 나눈다. 판결문이 쓰는 형태다. */
const ARTICLE_REF = /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?/u;

function parseArticleRef(text: string): { number: string; branchNumber?: string } | undefined {
  const matched = ARTICLE_REF.exec(text);
  const number = matched?.[1];
  if (number === undefined) {
    return;
  }
  const branch = matched?.[2];
  return branch === undefined ? { number } : { number, branchNumber: branch };
}

function findClause(article: LawArticle, clauseNo: string | number): LawClause | undefined {
  const wanted = String(clauseNo).trim();
  return article.clauses.find((clause) => {
    if (clause.number === undefined) {
      return false;
    }
    return clause.number === wanted || circledToNumber(clause.number) === wanted;
  });
}

export {
  circledToNumber,
  findArticle,
  findClause,
  parseArticleRef,
  parseLawDetailResponse,
  toSummary as parseLawSummary,
};
export type { LawArticle, LawClause, LawDetail, LawSummary };
