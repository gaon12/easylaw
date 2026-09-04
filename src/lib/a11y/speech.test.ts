import { describe, expect, it } from "vitest";
import { MAX_CHUNK, speechQueue, splitForSpeech } from "./speech";

describe("splitForSpeech", () => {
  it("문장 경계로 자른다", () => {
    expect(splitForSpeech("법원은 원고의 청구를 받아들였어요. 피고가 소송비용을 냅니다.")).toEqual([
      "법원은 원고의 청구를 받아들였어요.",
      "피고가 소송비용을 냅니다.",
    ]);
  });

  it("긴 문장은 띄어쓰기 자리에서 자른다 — 낱말 가운데를 자르면 소리가 어색하다", () => {
    const long = `${"판결문의 긴 문장 ".repeat(30)}끝.`;
    const chunks = splitForSpeech(long);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK);
    }
    // 자른 조각을 이으면 원문의 낱말이 그대로 남아 있어야 한다.
    expect(chunks.join(" ").replace(/\s+/gu, "")).toBe(long.replace(/\s+/gu, ""));
  });

  it("빈 글은 읽을 것이 없다", () => {
    expect(splitForSpeech("")).toEqual([]);
    expect(splitForSpeech("   ")).toEqual([]);
  });
});

describe("speechQueue", () => {
  it("제목도 읽는다 — 듣는 사람은 제목을 눈으로 훑을 수 없다", () => {
    const queue = speechQueue([
      { role: "heading", text: "다음 절차" },
      { role: "body", text: "항소는 판결문을 받은 날부터 2주 안에 할 수 있어요." },
    ]);

    expect(queue[0]).toBe("다음 절차");
    expect(queue).toHaveLength(2);
  });

  it("문장이 없으면 빈 차례다", () => {
    expect(speechQueue([])).toEqual([]);
  });
});
