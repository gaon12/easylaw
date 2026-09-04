import { describe, expect, it } from "vitest";
import { parseListPage } from "./envelope";
import decisionDetail from "./fixtures/decision-detail.json" with { type: "json" };
import decisionSearch from "./fixtures/decision-search.json" with { type: "json" };
import tribunalDetail from "./fixtures/tribunal-detail.json" with { type: "json" };
import { parseDetailResponse } from "./parse";
import { parseDecisionDetailResponse, parseDecisionSummary } from "./parse-decision";
import { TARGETS } from "./targets";

/** 픽스처는 실제 응답이다(2026-09-03). */

describe("헌재결정례 목록", () => {
  it("사건번호와 본문 열쇠를 읽는다", () => {
    const page = parseListPage(decisionSearch, TARGETS.detc, parseDecisionSummary);

    expect(page.total).toBeGreaterThan(0);
    expect(page.items[0]?.caseNo.length).toBeGreaterThan(0);
    expect(page.items[0]?.decisionId).toMatch(/^\d+$/u);
  });

  it("항목 키가 대문자 Detc다 — 봉투는 소문자인데 여기만 다르다", () => {
    // 이 규칙을 잘못 적으면 총건수는 맞는데 항목이 0개인 결과가 나온다.
    expect(TARGETS.detc.listItemKey).toBe("Detc");
    expect(
      parseListPage(decisionSearch, TARGETS.detc, parseDecisionSummary).items.length,
    ).toBeGreaterThan(0);
  });
});

describe("헌재결정례 본문", () => {
  const detail = parseDecisionDetailResponse(decisionDetail);

  it("사건번호·사건명·종국일자를 읽는다", () => {
    expect(detail.caseNo).toBe("2022헌마1312");
    expect(detail.caseName.length).toBeGreaterThan(0);
    expect(detail.decidedAt).toBeInstanceOf(Date);
  });

  it("전문을 본문으로 삼는다", () => {
    expect(detail.content.length).toBeGreaterThan(100);
  });

  it("빈 문자열로 오는 요약은 '없음'으로 다룬다", () => {
    // 실제 응답에서 판시사항·결정요지가 빈 문자열이었다. 빈 문자열을 그대로 들고 가면
    // 화면이 "요약: (빈칸)"을 그린다.
    expect(detail.holdingSummary).toBeUndefined();
    expect(detail.decisionSummary).toBeUndefined();
  });
});

describe("봉투 이름이 겹치는 문제", () => {
  it("행정심판례 본문은 판례와 같은 PrecService로 온다", () => {
    expect(Object.keys(tribunalDetail)).toEqual(["PrecService"]);
    expect(TARGETS.decc.detailEnvelope).toBe(TARGETS.prec.detailEnvelope);
  });

  it("판례 파서가 행정심판례를 판례로 받아들이지 않는다", () => {
    // 걸러 내지 않으면 본문이 빈 판례 하나가 조용히 만들어진다. 그 판결문은 문장이
    // 0개라 근거를 매달 자리가 없다.
    expect(() => parseDetailResponse(tribunalDetail)).toThrow("판례 본문이 아닙니다");
  });
});
