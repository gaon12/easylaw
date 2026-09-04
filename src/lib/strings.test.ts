import { describe, expect, it } from "vitest";
import { lintRendition, type RenditionSentence } from "@/lib/rendition/lint";
import { demo, help } from "./strings";

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

  it("일반 단계는 합니다체, 어린이 단계는 이야기체, 쉬운말은 직접 안내한다", () => {
    expect(demo.bodies.L2.every((line) => /(?:합니다|입니다)\.$/u.test(line))).toBe(true);
    expect(demo.bodies.L3.join(" ")).toContain("A씨");
    expect(demo.bodies.L4.join(" ")).toContain("당신");
  });
});

describe("이용 안내의 쉬운 말 버전", () => {
  it("L4 문장 규칙을 지킨다", () => {
    // 쉬운 말로 쓰겠다고 적어 놓고 정작 그 문장이 규칙을 어기면 안내문을 믿을 수 없다.
    const lines = help.plain.flatMap((section) => section.body);
    const issues = lintRendition("L4", sentences(lines));

    // 안내문은 판결문 변환본이 아니라서 필수 섹션 규칙은 해당하지 않는다.
    expect(issues.filter((issue) => issue.rule !== "missing_section")).toEqual([]);
  });

  it("두 버전이 같은 것을 다룬다", () => {
    // 쉬운 말 버전이 자세한 설명보다 적게 다루면 그건 요약이지 다른 말로 쓴 것이 아니다.
    expect(help.plain.length).toBeGreaterThanOrEqual(help.full.length);
  });

  it("자세한 설명은 존댓말로 쓴다", () => {
    // UI 전체가 해요체다(`DESIGN.md` §9). 안내문만 평서체로 새면 목소리가 갈린다.
    const endings = help.full.flatMap((section) => section.body);
    for (const sentence of endings) {
      expect(sentence.trimEnd().endsWith("요.") || sentence.trimEnd().endsWith("에요.")).toBe(true);
    }
  });
});
