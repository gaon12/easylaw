import { describe, expect, it } from "vitest";
import type { Citation } from "@/lib/law-citation/detect";
import { citationTarget, currentCitationHref } from "./citation-target";

const citation: Citation = {
  articleNo: "5",
  branchNo: "2",
  clauseNo: "1",
  end: 15,
  itemNo: undefined,
  law: { lawId: "law-1", matched: "예시법", name: "예시법" },
  named: true,
  start: 3,
  text: "예시법 제5조의2 제1항",
};

describe("법령 인용 탐색 주소", () => {
  it("중첩 탐색에도 최초 문서의 기준일과 읽기 단계를 유지한다", () => {
    const target = citationTarget(citation, "2019-06-01", "L4");

    expect(target?.query).toContain(encodeURIComponent("2019-06-01"));
    expect(target?.href).toContain("level=L4");
    expect(target?.href).toContain(encodeURIComponent("예시법"));
    expect(target?.href).toContain("#조5의2");
  });

  it("현재 조문 주소는 기준일만 제거한다", () => {
    const target = citationTarget(citation, "2019-06-01", "L3");
    if (target === undefined) {
      throw new Error("법령 인용 주소가 만들어져야 합니다.");
    }

    const current = currentCitationHref(target);
    expect(current).not.toContain(encodeURIComponent("2019-06-01"));
    expect(current).toContain("level=L3");
    expect(current).toContain(encodeURIComponent("law-1"));
    expect(current).toContain(encodeURIComponent("5"));
    expect(current).toContain(`#${encodeURIComponent("조5의2")}`);
  });

  it("이미 현재 조문이면 중복 링크를 만들지 않는다", () => {
    const target = citationTarget(citation, undefined, "L2");
    if (target === undefined) {
      throw new Error("법령 인용 주소가 만들어져야 합니다.");
    }
    expect(currentCitationHref(target)).toBeUndefined();
  });
});
