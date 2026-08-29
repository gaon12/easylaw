import { describe, expect, it } from "vitest";
import { lintRendition, type RenditionSentence } from "@/lib/rendition/lint";
import { demo } from "./strings";

/**
 * 랜딩 데모의 예시 문장이 **우리가 만든 작성 규칙을 스스로 지키는지** 검사한다.
 *
 * 첫 화면에서 "이 단계는 이렇게 씁니다"라고 보여 주는 문장이 정작 그 규칙을 어기면
 * 규칙도 데모도 믿을 수 없게 된다. 규칙을 고치면 이 테스트가 먼저 알려 준다.
 */
function sentences(lines: readonly string[]): RenditionSentence[] {
  return lines.map((text, index) => ({ orderIdx: index, role: "body" as const, text }));
}

describe("랜딩 데모 예시", () => {
  it.each(["L1", "L2", "L3", "L4"] as const)("%s 예시가 그 단계의 규칙을 지킨다", (level) => {
    const issues = lintRendition(level, sentences(demo.bodies[level]));

    // 데모는 문서 전체가 아니라 발췌라서 필수 섹션 제목이 없다. 그 규칙만 빼고 본다.
    expect(issues.filter((issue) => issue.rule !== "missing_section")).toEqual([]);
  });

  it("L4 예시는 2인칭으로 말한다", () => {
    // 호칭이 섞이면 읽는 사람이 누구 얘기인지 놓친다(`EASY-READ.md` §5).
    expect(demo.bodies.L4.some((line) => line.includes("당신"))).toBe(true);
  });

  it("원문 예시는 실제 판결문 문체 그대로다", () => {
    // 이 대비가 데모의 전부다. 원문이 이미 쉬우면 보여 줄 것이 없다.
    expect(demo.bodies.L0.join(" ")).toContain("피고");
  });
});
