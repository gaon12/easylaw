import { describe, expect, it } from "vitest";
import { assessLegalRevision } from "./legal-revision-check";

describe("법령 상세 원문판 staging 검사", () => {
  it("첫 수집의 정상 객체는 통과시킨다", () => {
    expect(
      assessLegalRevision(undefined, { 법령: { 법령명: "시험법", 조문: ["제1조"] } }),
    ).toMatchObject({
      state: "passed",
      issues: [],
    });
  });

  it("빈 값과 원시값은 실패로 판정한다", () => {
    expect(assessLegalRevision({ Law: { name: "구법" } }, null)).toMatchObject({
      state: "failed",
      issues: expect.arrayContaining(["empty_payload", "root_shape_changed"]),
    });
  });

  it("기준판 필드가 절반 넘게 사라지면 사람 확인 대상으로 둔다", () => {
    const before = Object.fromEntries(
      Array.from({ length: 20 }, (_, index) => [`field${index}`, index]),
    );
    const after = Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [`field${index}`, index]),
    );

    expect(assessLegalRevision(before, after)).toMatchObject({
      state: "needs_review",
      removed: 15,
      issues: ["large_field_removal"],
    });
  });
});
