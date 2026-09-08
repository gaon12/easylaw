import { describe, expect, it } from "vitest";
import { diffParagraphs, type Paragraph } from "./revision-diff";

const paragraphs = (...texts: string[]): Paragraph[] =>
  texts.map((text, index) => ({ index, text }));

describe("diffParagraphs", () => {
  it("중간에 들어온 문단 뒤의 같은 문단을 변경으로 세지 않는다", () => {
    const result = diffParagraphs(
      paragraphs("주문", "청구를 기각한다.", "이유", "원고의 주장을 살핀다."),
      paragraphs(
        "주문",
        "청구를 기각한다.",
        "소송비용은 원고가 부담한다.",
        "이유",
        "원고의 주장을 살핀다.",
      ),
    );

    expect(result).toMatchObject({ unchanged: 4, removed: 0, added: 1 });
    expect(result.chunks.map(({ kind }) => kind)).toEqual(["same", "added", "same"]);
  });

  it("이동한 문단은 양쪽에 그대로 있다고 숨기지 않고 삭제·추가로 표시한다", () => {
    const result = diffParagraphs(
      paragraphs("주문", "이유", "판단", "결론"),
      paragraphs("주문", "판단", "이유", "결론"),
    );

    expect(result.unchanged).toBe(3);
    expect(result.removed).toBe(1);
    expect(result.added).toBe(1);
  });

  it("반복 문단이 있는 긴 머리말과 맺음말도 정확히 보존한다", () => {
    const result = diffParagraphs(
      paragraphs("같음", "같음", "옛 판단", "끝", "끝"),
      paragraphs("같음", "같음", "새 판단", "끝", "끝"),
    );

    expect(result).toMatchObject({ unchanged: 4, removed: 1, added: 1 });
  });
});
