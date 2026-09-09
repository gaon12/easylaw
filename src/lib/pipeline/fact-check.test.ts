import { describe, expect, it } from "vitest";
import { checkClaimFacts, parseKoreanNumber } from "./fact-check";

describe("한국어 금액 정규화", () => {
  it.each([
    ["4,000,000,000", 4_000_000_000n],
    ["40억", 4_000_000_000n],
    ["1억 2천만", 120_000_000n],
    ["1.5억", 150_000_000n],
    ["천", 1000n],
  ])("%s을 같은 정수 값으로 읽는다", (input, expected) => {
    expect(parseKoreanNumber(input)).toBe(expected);
  });
});

describe("생성 문장의 사실 대조", () => {
  it("숫자식과 한글식 금액, 서로 다른 날짜 표기를 같은 값으로 본다", () => {
    expect(
      checkClaimFacts({
        orderIdx: 0,
        text: "은행은 2006년 7월 3일에 40억 원의 근저당권을 설정했어요.",
        sources: ["2006. 7. 3. 채권최고액을 4,000,000,000원으로 하는 근저당권을 설정하였다."],
      }),
    ).toMatchObject({ verdict: "pass" });
  });

  it("0을 하나 보탠 금액은 막는다", () => {
    const result = checkClaimFacts({
      orderIdx: 2,
      text: "채권최고액은 1,200,000,000원이에요.",
      sources: ["채권최고액을 120,000,000원으로 하는 근저당권을 설정하였다."],
    });
    expect(result).toMatchObject({ verdict: "contradicted", orderIdx: 2 });
    expect(result.missing).toContainEqual(
      expect.objectContaining({ kind: "money", key: "money:1200000000" }),
    );
  });

  it("금액 단위를 바꾸면 같은 숫자가 있어도 막는다", () => {
    expect(
      checkClaimFacts({
        orderIdx: 0,
        text: "10원이에요.",
        sources: ["10만 원을 지급한다."],
      }),
    ).toMatchObject({ verdict: "contradicted" });
  });

  it("문서의 다른 부분에만 있는 숫자를 연결된 근거에서 빌리지 못한다", () => {
    expect(
      checkClaimFacts({
        orderIdx: 0,
        text: "계약일은 2021년 12월 10일이에요.",
        sources: ["계약은 2020. 12. 10. 체결되었다."],
      }),
    ).toMatchObject({ verdict: "contradicted" });
  });

  it("날짜와 금액을 가린 뒤 남은 일반 숫자도 대조한다", () => {
    expect(
      checkClaimFacts({ orderIdx: 0, text: "원고는 3명이에요.", sources: ["원고는 2명이다."] }),
    ).toMatchObject({ verdict: "contradicted" });
  });

  it("같은 숫자라도 단위나 범위 조건이 달라지면 막는다", () => {
    expect(
      checkClaimFacts({ orderIdx: 0, text: "길이는 10m예요.", sources: ["길이는 10cm이다."] }),
    ).toMatchObject({ verdict: "contradicted" });
    expect(
      checkClaimFacts({ orderIdx: 0, text: "3명 이상이에요.", sources: ["대상자는 3명이다."] }),
    ).toMatchObject({ verdict: "contradicted" });
  });
});
