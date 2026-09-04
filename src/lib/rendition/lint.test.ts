import { describe, expect, it } from "vitest";
import { hasBlockingIssue, lintRendition, type RenditionSentence } from "./lint";

function body(...texts: string[]): RenditionSentence[] {
  return texts.map((text, index) => ({ orderIdx: index, role: "body" as const, text }));
}

function heading(text: string, orderIdx: number): RenditionSentence {
  return { orderIdx, role: "heading", text };
}

/** L4가 통과하는 최소 문서. 각 테스트는 여기서 한 가지만 망가뜨린다. */
function validL4(): RenditionSentence[] {
  return [
    heading("결과", 0),
    { orderIdx: 1, role: "body", text: "당신이 신청한 대로 되었어요." },
    heading("그래서 어떻게 되나요", 2),
    { orderIdx: 3, role: "body", text: "구청에 다시 신청할 수 있어요." },
    heading("이해 확인", 4),
    { orderIdx: 5, role: "body", text: "누가 이 결정을 했나요?" },
  ];
}

describe("lintRendition", () => {
  it("규칙을 지킨 L4 문서는 문제가 없다", () => {
    expect(lintRendition("L4", validL4())).toEqual([]);
  });

  it("빈 변환본을 막는다", () => {
    const issues = lintRendition("L2", []);
    expect(issues[0]?.rule).toBe("empty_rendition");
    expect(hasBlockingIssue(issues)).toBe(true);
  });

  describe("단정 표현", () => {
    it("'이겼습니다'를 막는다 — 항소 가능성을 가린다", () => {
      const issues = lintRendition("L4", [
        heading("결과", 0),
        { orderIdx: 1, role: "body", text: "당신이 이겼습니다." },
        heading("그래서 어떻게 되나요", 2),
        heading("이해 확인", 3),
      ]);

      const assertive = issues.find((issue) => issue.rule === "assertive_outcome");
      expect(assertive?.severity).toBe("error");
      expect(assertive?.orderIdx).toBe(1);
      expect(hasBlockingIssue(issues)).toBe(true);
    });

    it("패소·확정 단정도 함께 막는다", () => {
      const rules = ["당신이 졌어요.", "이 재판은 끝났어요.", "판결이 확정됐어요."];
      for (const text of rules) {
        const issues = lintRendition("L2", body(text));
        expect(issues.some((issue) => issue.rule === "assertive_outcome")).toBe(true);
      }
    });

    it("법조계(L1)에는 적용하지 않는다 — 법률 문서의 정확한 표현이다", () => {
      const issues = lintRendition("L1", body("원고가 승소했다."));
      expect(issues.filter((issue) => issue.rule === "assertive_outcome")).toEqual([]);
    });
  });

  describe("문장 길이", () => {
    it("L4는 20자를 넘으면 알린다", () => {
      const long = "당신은 구청에 다시 신청할 수 있고 서류도 새로 내야 해요.";
      const issues = lintRendition("L4", [
        heading("결과", 0),
        { orderIdx: 1, role: "body", text: long },
        heading("그래서 어떻게 되나요", 2),
        heading("이해 확인", 3),
      ]);

      const tooLong = issues.find((issue) => issue.rule === "sentence_too_long");
      expect(tooLong?.severity).toBe("warning");
      expect(tooLong?.orderIdx).toBe(1);
    });

    it("공백을 빼고 센다 — 띄어쓰기 습관으로 규칙이 흔들리면 안 된다", () => {
      const spaced = "당 신 은 신 청 할 수 있 어 요";
      const issues = lintRendition("L4", [
        heading("결과", 0),
        { orderIdx: 1, role: "body", text: spaced },
        heading("그래서 어떻게 되나요", 2),
        heading("이해 확인", 3),
      ]);
      expect(issues.filter((issue) => issue.rule === "sentence_too_long")).toEqual([]);
    });

    it("섹션 제목은 길이 규칙에서 제외한다", () => {
      const issues = lintRendition("L4", [
        heading("그래서 어떻게 되나요 그리고 다음에 할 일은 무엇인가요", 0),
        heading("이해 확인", 1),
      ]);
      expect(issues.filter((issue) => issue.rule === "sentence_too_long")).toEqual([]);
    });

    it("L1은 길이를 제한하지 않는다", () => {
      const issues = lintRendition("L1", body("가".repeat(200)));
      expect(issues).toEqual([]);
    });
  });

  describe("호칭 일관성", () => {
    it("L4에서 '당신'과 '원고'가 섞이면 막는다", () => {
      const sentences = validL4();
      sentences.push({ orderIdx: 6, role: "body", text: "원고의 청구를 받아들였어요." });

      const issues = lintRendition("L4", sentences);
      const mixed = issues.find((issue) => issue.rule === "inconsistent_address");
      expect(mixed?.severity).toBe("error");
      expect(mixed?.orderIdx).toBe(6);
    });

    it("L2에서는 3인칭을 그대로 둔다", () => {
      const issues = lintRendition("L2", [
        ...body("원고의 청구를 받아들였어요."),
        heading("다음 절차", 1),
      ]);
      expect(issues.filter((issue) => issue.rule === "inconsistent_address")).toEqual([]);
    });
  });

  describe("필수 섹션", () => {
    it("L4에 '그래서 어떻게 되나요'가 없으면 막는다", () => {
      const issues = lintRendition("L4", [
        heading("결과", 0),
        { orderIdx: 1, role: "body", text: "당신 신청이 받아들여졌어요." },
        heading("이해 확인", 2),
      ]);

      const missing = issues.find((issue) => issue.rule === "missing_section");
      expect(missing?.severity).toBe("error");
      expect(missing?.message).toContain("그래서 어떻게 되나요");
      expect(hasBlockingIssue(issues)).toBe(true);
    });

    it("L2에 '다음 절차'가 없으면 막는다", () => {
      const issues = lintRendition("L2", body("구청의 결정을 취소해요."));
      expect(issues.some((issue) => issue.rule === "missing_section")).toBe(true);
    });

    it("띄어쓰기가 달라도 같은 섹션으로 본다", () => {
      const issues = lintRendition("L2", [
        ...body("구청의 결정을 취소해요."),
        heading("다음절차", 1),
      ]);
      expect(issues.filter((issue) => issue.rule === "missing_section")).toEqual([]);
    });
  });

  describe("비유", () => {
    it("L4에서 비유를 알린다", () => {
      const sentences = validL4();
      sentences.push({ orderIdx: 6, role: "body", text: "이것은 문을 여는 것처럼 쉬워요." });

      const issues = lintRendition("L4", sentences);
      const figurative = issues.find((issue) => issue.rule === "figurative_language");
      expect(figurative?.severity).toBe("warning");
    });

    it("L3에서는 비유를 허용한다", () => {
      const issues = lintRendition("L3", [
        ...body("이것은 약속을 지키는 것처럼 중요해요."),
        heading("다음에는 어떻게 되나요", 1),
      ]);
      expect(issues.filter((issue) => issue.rule === "figurative_language")).toEqual([]);
    });
  });
});
