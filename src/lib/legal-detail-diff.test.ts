import { describe, expect, it } from "vitest";
import { diffLegalPayload, flattenLegalPayload } from "./legal-detail-diff";

describe("법령 상세 JSON 구조 비교", () => {
  it("중첩 객체와 배열의 값 경로를 안정적으로 펼친다", () => {
    expect(flattenLegalPayload({ 법령: { 조문: [{ 번호: 1, 내용: "첫째" }] }, 빈값: [] })).toEqual([
      { path: "$.법령.조문[0].내용", value: "첫째" },
      { path: "$.법령.조문[0].번호", value: "1" },
      { path: "$.빈값", value: "[]" },
    ]);
  });

  it("추가·삭제·값 변경과 같은 필드를 구분한다", () => {
    const result = diffLegalPayload(
      { Law: { name: "구법", articles: ["가", "나"], removed: true } },
      { Law: { name: "신법", articles: ["가", "다"], added: 3 } },
    );
    expect(result).toMatchObject({ unchanged: 1, added: 1, removed: 1, changed: 2 });
    expect(result.changes).toEqual(
      expect.arrayContaining([
        { path: "$.Law.name", kind: "changed", before: "구법", after: "신법" },
        { path: "$.Law.articles[1]", kind: "changed", before: "나", after: "다" },
        { path: "$.Law.added", kind: "added", after: "3" },
        { path: "$.Law.removed", kind: "removed", before: "true" },
      ]),
    );
  });
});
