import { describe, expect, it } from "vitest";
import detailFixture from "./fixtures/detail.json" with { type: "json" };
import searchEmptyFixture from "./fixtures/search-empty.json" with { type: "json" };
import searchHitFixture from "./fixtures/search-hit.json" with { type: "json" };
import {
  htmlToPlainText,
  parseDecidedAt,
  parseDetailResponse,
  parseSearchResponse,
  readRejection,
} from "./parse";

// 픽스처는 2026-08-28에 법제처 공개 API(OC=test)에서 실제로 받은 응답이다.
// 손으로 지어낸 형태로 테스트하면 실제 응답 형태가 바뀌어도 통과해 버린다.

describe("parseSearchResponse", () => {
  it("사건번호 검색 결과를 도메인 타입으로 옮긴다", () => {
    const results = parseSearchResponse(searchHitFixture);

    expect(results).toHaveLength(1);
    const first = results[0];
    expect(first?.caseNo).toBe("2023다287663");
    expect(first?.precedentId).toBe("622253");
    expect(first?.court).toBe("대법원");
    expect(first?.caseTypeName).toBe("민사");
    expect(first?.sourceName).toBe("대법원");
    expect(first?.decidedAt).toEqual(new Date(Date.UTC(2026, 4, 20)));
  });

  it("결과가 없으면 빈 배열이다", () => {
    expect(parseSearchResponse(searchEmptyFixture)).toEqual([]);
  });

  it("한 건이 배열이 아니라 객체로 와도 받는다", () => {
    const single = {
      PrecSearch: {
        totalCnt: "1",
        prec: {
          판례일련번호: "1",
          사건번호: "2019도12345",
          사건명: "모욕",
          법원명: "대법원",
          선고일자: "2019.05.03",
        },
      },
    };
    expect(parseSearchResponse(single).map((r) => r.caseNo)).toEqual(["2019도12345"]);
  });

  it("형태가 어긋나면 던진다 — 빈 배열로 삼키면 '없음'과 구분되지 않는다", () => {
    expect(() => parseSearchResponse({ 엉뚱한: "응답" })).toThrow();
  });
});

describe("parseDetailResponse", () => {
  it("본문과 요약 필드를 옮긴다", () => {
    const detail = parseDetailResponse(detailFixture);

    expect(detail.caseNo).toBe("2023다287663");
    expect(detail.court).toBe("대법원");
    // 본문 조회의 선고일자는 20260520 꼴로 온다.
    expect(detail.decidedAt).toEqual(new Date(Date.UTC(2026, 4, 20)));
    expect(detail.holdingSummary).toContain("회생계획");
    expect(detail.judgmentSummary).toContain("회생계획은");
    expect(detail.citedStatutes).toContain("채무자 회생 및 파산에 관한 법률");
  });

  it("본문에서 태그를 걷어 내고 줄바꿈으로 바꾼다", () => {
    const detail = parseDetailResponse(detailFixture);

    expect(detail.content).not.toContain("<br");
    expect(detail.content).not.toMatch(/<[^>]+>/u);
    expect(detail.content).toContain("【원고, 피상고인】");
    expect(detail.content.split("\n").length).toBeGreaterThan(1);
  });
});

describe("htmlToPlainText", () => {
  it("br 태그를 줄바꿈으로 바꾼다", () => {
    expect(htmlToPlainText("가<br/>나<br />다")).toBe("가\n나\n다");
  });

  it("엔티티를 되돌린다", () => {
    expect(htmlToPlainText("&lt;주문&gt; 원고 &amp; 피고")).toBe("<주문> 원고 & 피고");
  });

  it("빈 줄이 세 줄 이상 이어지면 두 줄로 줄인다", () => {
    expect(htmlToPlainText("가<br/><br/><br/><br/>나")).toBe("가\n\n나");
  });

  it("줄 끝 공백을 남기지 않는다 — 문장 분할이 공백을 문장으로 세지 않게 한다", () => {
    expect(htmlToPlainText("가   <br/>나")).toBe("가\n나");
  });
});

describe("parseDecidedAt", () => {
  it("점 표기와 붙여 쓴 표기를 모두 읽는다", () => {
    expect(parseDecidedAt("2026.05.20")).toEqual(new Date(Date.UTC(2026, 4, 20)));
    expect(parseDecidedAt("20260520")).toEqual(new Date(Date.UTC(2026, 4, 20)));
    expect(parseDecidedAt(20_260_520)).toEqual(new Date(Date.UTC(2026, 4, 20)));
  });

  it("읽을 수 없으면 undefined다 — 추측한 날짜를 저장하지 않는다", () => {
    expect(parseDecidedAt("")).toBeUndefined();
    expect(parseDecidedAt("미상")).toBeUndefined();
    expect(parseDecidedAt(undefined)).toBeUndefined();
  });
});

describe("readRejection", () => {
  /**
   * 법제처는 인증키가 틀려도 HTTP 200으로 답한다. 실제로 받은 본문 그대로다.
   * 상태 코드만 보면 성공으로 읽히는 자리라 여기서 반드시 걸러야 한다.
   */
  const realRejection = {
    result: "사용자 정보 검증에 실패하였습니다.",
    msg: "OPEN API 호출 시 사용자 검증을 위하여 정확한 서버장비의 IP주소 및 도메인주소를 등록해 주세요.",
  };

  it("실패 봉투에서 원인을 그대로 전한다 — IP 등록이 필요하다는 말이 핵심이다", () => {
    const reason = readRejection(realRejection);
    expect(reason).toContain("사용자 정보 검증에 실패");
    expect(reason).toContain("IP주소");
  });

  it("msg가 없으면 result만 낸다", () => {
    expect(readRejection({ result: "실패했습니다." })).toBe("실패했습니다.");
  });

  it("정상 응답은 실패 봉투가 아니다 — result 키가 없다", () => {
    expect(readRejection({ PrecSearch: { totalCnt: "1" } })).toBeUndefined();
    expect(readRejection({ PrecService: { 사건번호: "2019도12345" } })).toBeUndefined();
  });
});
