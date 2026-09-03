/**
 * 헌재결정례 파서.
 *
 * biome-ignore-all lint/style/useNamingConvention: 응답 필드명이 한국어다.
 *
 * 판례와 **같은 뷰어 파이프라인을 탄다** — 사건번호가 있고, 본문이 있고, 문장으로 쪼개
 * 근거를 매달 수 있다. 그래서 `PrecedentDetail`과 모양을 맞춰 두었다. 다른 점은
 * 법원 대신 헌법재판소이고, `선고일자` 대신 `종국일자`라는 것뿐이다.
 *
 * **본문이 비어 오는 경우가 흔하다.** 실제로 확인한 응답에서 `판시사항`·`결정요지`가
 * 빈 문자열이고 `전문`에만 내용이 있었다. 그래서 빈 값을 "없음"으로 다루고,
 * `전문`을 본문의 기준으로 삼는다.
 */

import { z } from "zod";
import { looseValue, openEnvelope, optionalText, parseApiDate } from "./envelope";
import { htmlToPlainText } from "./parse";
import { TARGETS } from "./targets";

interface DecisionSummary {
  /** 본문 조회에 쓰는 열쇠. */
  readonly decisionId: string;
  readonly caseNo: string;
  readonly caseName: string;
  readonly decidedAt: Date | undefined;
}

interface DecisionDetail extends DecisionSummary {
  /** 사건종류명. `헌마`·`헌바` 등. */
  readonly caseType: string | undefined;
  readonly holdingSummary: string | undefined;
  readonly decisionSummary: string | undefined;
  readonly citedStatutes: string | undefined;
  readonly citedPrecedents: string | undefined;
  /** 결정문 전문. 태그를 벗겨 낸 평문이다. */
  readonly content: string;
}

const summarySchema = z
  .object({
    헌재결정례일련번호: z.union([z.string(), z.number()]),
    사건번호: z.string().default(""),
    사건명: z.string().default(""),
    종국일자: looseValue,
  })
  .loose();

function parseDecisionSummary(raw: unknown): DecisionSummary {
  const parsed = summarySchema.parse(raw);
  return {
    decisionId: String(parsed.헌재결정례일련번호),
    caseNo: parsed.사건번호.trim(),
    caseName: parsed.사건명.trim(),
    decidedAt: parseApiDate(parsed.종국일자),
  };
}

const detailSchema = summarySchema.extend({
  사건종류명: looseValue,
  판시사항: looseValue,
  결정요지: looseValue,
  참조조문: looseValue,
  참조판례: looseValue,
  전문: z.string().default(""),
});

function parseDecisionDetailResponse(payload: unknown): DecisionDetail {
  const body = openEnvelope(payload, TARGETS.detc.detailEnvelope);
  const parsed = detailSchema.parse(body);

  return {
    ...parseDecisionSummary(parsed),
    caseType: optionalText(parsed.사건종류명),
    holdingSummary: optionalText(parsed.판시사항 && htmlToPlainText(String(parsed.판시사항))),
    decisionSummary: optionalText(parsed.결정요지 && htmlToPlainText(String(parsed.결정요지))),
    citedStatutes: optionalText(parsed.참조조문),
    citedPrecedents: optionalText(parsed.참조판례),
    content: htmlToPlainText(parsed.전문),
  };
}

export { parseDecisionDetailResponse, parseDecisionSummary };
export type { DecisionDetail, DecisionSummary };
