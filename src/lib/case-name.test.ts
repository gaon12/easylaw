import { describe, expect, it } from "vitest";
import { splitCaseName } from "./case-name";

/** 예문은 실제 법제처 응답이다 — 대법원 2023다287663과 2013마219. */
describe("splitCaseName", () => {
  it("대괄호 앞을 이름으로, 안을 쟁점으로 나눈다", () => {
    const split = splitCaseName(
      "부당이득금[선순위 회생담보권자가 후순위 회생담보권자를 상대로 회생계획에서 정한 바에 따라 담보목적물의 매각대금이 선순위 회생담보권 원리금 채무에 우선 변제되어야 함에도 그와 달리 변제기가 도래한 각 회생담보권 원리금 채무에 분할 변제되었다고 주장하며 그 차액 상당의 부당이득반환을 구하는 사건]",
    );

    expect(split?.name).toBe("부당이득금");
    expect(split?.issue).toContain("선순위 회생담보권자가");
  });

  it("대괄호가 없으면 그대로 이름이다", () => {
    expect(splitCaseName("민법위반이의")).toEqual({ name: "민법위반이의", issue: undefined });
  });

  it("이름 쪽이 비면 나누지 않는다 — 빈 제목을 만드느니 긴 제목이 낫다", () => {
    expect(splitCaseName("[쟁점만 있는 사건명]")?.name).toBe("[쟁점만 있는 사건명]");
  });

  it("괄호가 이름 안에 있는 형태를 잘못 나누지 않는다", () => {
    // `손해배상(기)`처럼 소괄호가 든 이름이 흔하다.
    expect(splitCaseName("손해배상(기)")).toEqual({ name: "손해배상(기)", issue: undefined });
  });

  it("값이 없으면 undefined다", () => {
    expect(splitCaseName(null)).toBeUndefined();
    expect(splitCaseName("   ")).toBeUndefined();
  });
});
