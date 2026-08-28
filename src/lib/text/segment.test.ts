import { describe, expect, it } from "vitest";
import { segmentJudgment } from "./segment";

describe("segmentJudgment", () => {
  it("종결어미 뒤 마침표에서 문장을 나눈다", () => {
    const source = "원고의 청구를 인용한다. 소송비용은 피고가 부담한다.";
    const segments = segmentJudgment(source);

    expect(segments.map((s) => s.text)).toEqual([
      "원고의 청구를 인용한다.",
      "소송비용은 피고가 부담한다.",
    ]);
  });

  it("판결문의 날짜 표기를 문장 끝으로 오인하지 않는다", () => {
    // 이 모듈에서 가장 중요한 케이스다. 마침표만 보고 자르면 한 문장이 다섯 조각이 된다.
    const source = "대법원 2019. 5. 3. 선고 2019도12345 판결을 인용한다.";
    const segments = segmentJudgment(source);

    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe(source);
  });

  it("조문 번호의 마침표에서 자르지 않는다", () => {
    const source = "장애인복지법 제32조 제1항에 따라 판단한다.";
    expect(segmentJudgment(source)).toHaveLength(1);
  });

  it("물음표와 느낌표에서도 나눈다", () => {
    const segments = segmentJudgment("이것이 맞습니까? 그렇지 않습니다.");
    expect(segments.map((s) => s.text)).toEqual(["이것이 맞습니까?", "그렇지 않습니다."]);
  });

  it("charStart/charEnd가 원문 위치를 정확히 가리킨다", () => {
    const source = "  첫째 문장이다.\n\n둘째 문장이다.  ";
    const segments = segmentJudgment(source);

    for (const segment of segments) {
      expect(source.slice(segment.charStart, segment.charEnd)).toBe(segment.text);
    }
  });

  it("빈 줄로 문단을 나눈다", () => {
    const source = "첫 문단이다. 이어지는 문장이다.\n\n둘째 문단이다.";
    const segments = segmentJudgment(source);

    expect(segments.map((s) => [s.paraIdx, s.sentIdx])).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
  });

  it("줄바꿈을 문장 경계로 본다 — 표제가 다음 문장에 들러붙지 않는다", () => {
    const source = "주문\n원고의 청구를 기각한다.\n이유\n청구에 이유가 없다.";
    const segments = segmentJudgment(source);

    // 빈 줄이 없으므로 문단은 하나다. 문장은 줄 단위로 나뉜다.
    expect(segments.map((s) => s.paraIdx)).toEqual([0, 0, 0, 0]);
    expect(segments.map((s) => s.text)).toEqual([
      "주문",
      "원고의 청구를 기각한다.",
      "이유",
      "청구에 이유가 없다.",
    ]);
  });

  it("종결부호가 없는 마지막 조각도 문장으로 남긴다", () => {
    const segments = segmentJudgment("주문");
    expect(segments).toHaveLength(1);
    expect(segments[0]?.text).toBe("주문");
  });

  it("빈 입력과 공백만 있는 입력은 빈 배열이다", () => {
    expect(segmentJudgment("")).toEqual([]);
    expect(segmentJudgment("   \n\n  ")).toEqual([]);
  });

  it("문장 사이 공백을 문장 본문에 넣지 않는다", () => {
    const segments = segmentJudgment("첫 문장이다.     둘째 문장이다.");
    expect(segments[1]?.text).toBe("둘째 문장이다.");
    expect(segments[1]?.text.startsWith(" ")).toBe(false);
  });

  it("실제 판결문 꼴에서 문장 수가 맞는다", () => {
    const source = [
      "주문",
      "1. 피고가 2026. 3. 2. 원고에 대하여 한 장애정도 미해당 결정처분을 취소한다.",
      "2. 소송비용은 피고가 부담한다.",
      "",
      "이유",
      "원고는 2026. 1. 5. 장애인 등록을 신청하였다. 피고는 이를 거부하였다.",
    ].join("\n");

    const segments = segmentJudgment(source);
    const texts = segments.map((s) => s.text);

    expect(texts).toContain("주문");
    expect(texts).toContain("2. 소송비용은 피고가 부담한다.");
    expect(texts).toContain("원고는 2026. 1. 5. 장애인 등록을 신청하였다.");
    expect(texts).toContain("피고는 이를 거부하였다.");
    for (const segment of segments) {
      expect(source.slice(segment.charStart, segment.charEnd)).toBe(segment.text);
    }
  });
});
