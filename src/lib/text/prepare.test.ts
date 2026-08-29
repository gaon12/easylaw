import { describe, expect, it } from "vitest";
import { MAX_CHARS, prepareDocument } from "./prepare";

const BODY = [
  "주문",
  "원고의 청구를 기각한다.",
  "",
  "이유",
  "원고 홍길동은 피고 김철수를 상대로 소를 제기하였다.",
  "연락처는 010-1234-5678이다.",
].join("\n");

describe("prepareDocument", () => {
  it("마스킹한 본문과 문장을 함께 돌려준다", () => {
    const result = prepareDocument(BODY);
    if (!result.ok) {
      throw new Error(`거절됨: ${result.reason}`);
    }

    expect(result.document.text).toContain("○○○");
    expect(result.document.text).toContain("[전화번호]");
    expect(result.document.maskCounts).toEqual({ name: 2, phone: 1 });
    expect(result.document.spans.length).toBeGreaterThan(0);
  });

  it("문장 좌표가 마스킹된 본문을 가리킨다", () => {
    // 마스킹이 글자 수를 바꾸므로, 좌표가 원문 기준이면 여기서 어긋난다.
    const result = prepareDocument(BODY);
    if (!result.ok) {
      throw new Error(`거절됨: ${result.reason}`);
    }

    const { text, spans } = result.document;
    for (const span of spans) {
      expect(text.slice(span.charStart, span.charEnd)).toBe(span.text);
    }
  });

  it("CRLF와 BOM을 정리한다", () => {
    const result = prepareDocument(`\uFEFF${BODY.replace(/\n/gu, "\r\n")}`);
    if (!result.ok) {
      throw new Error(`거절됨: ${result.reason}`);
    }
    expect(result.document.text).not.toContain("\r");
    expect(result.document.text.startsWith("주문")).toBe(true);
  });

  it("빈 입력과 너무 짧은 입력을 이유와 함께 거절한다", () => {
    expect(prepareDocument("   \n  ")).toEqual({ ok: false, reason: "empty" });
    expect(prepareDocument("판결문")).toEqual({ ok: false, reason: "too_short" });
  });

  it("너무 긴 입력을 거절한다", () => {
    expect(prepareDocument("가".repeat(MAX_CHARS + 1))).toEqual({ ok: false, reason: "too_long" });
  });

  it("보이지 않는 문자만 있는 입력도 빈 것으로 본다", () => {
    // 폭 없는 공백(U+200B)은 화면에서 안 보인다. 글자 수만 채운 입력을 통과시키면 안 된다.
    const invisible = "\u200B".repeat(60);
    expect(prepareDocument(invisible)).toEqual({ ok: false, reason: "empty" });
  });
});
