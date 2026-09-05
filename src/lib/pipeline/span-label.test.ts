import { describe, expect, it } from "vitest";
import { labelSpans, normalizeSpanLabel, spanLabel } from "./span-label";

/**
 * 여기서 보는 것은 **모델이 답한 이름을 우리 문장으로 되돌리는 일**이다. 이 연결이 끊기면
 * 근거를 잃은 노드가 통째로 버려지고, 판결문 한 편에서 아무것도 나오지 않는다.
 */

const SPANS = [
  { id: "uuid-a", paraIdx: 0, sentIdx: 0, text: "원고는 계약을 맺었다." },
  { id: "uuid-b", paraIdx: 1, sentIdx: 2, text: "상고를 기각한다." },
];

describe("spanLabel", () => {
  it("문단과 문장 번호로 이름을 만든다", () => {
    expect(spanLabel({ paraIdx: 1, sentIdx: 2 })).toBe("p1.s2");
  });
});

describe("normalizeSpanLabel", () => {
  /*
   * 문서의 각 줄이 `[p0.s3] 문장`이라 모델은 본 대로 대괄호째 답한다 — GLM에서 실제로
   * 그랬고, 그 판결문은 노드를 하나도 남기지 못했다.
   */
  it("모델이 베껴 온 대괄호를 벗긴다", () => {
    expect(normalizeSpanLabel("[p0.s3]")).toBe("p0.s3");
    expect(normalizeSpanLabel("  [p0.s3]  ")).toBe("p0.s3");
  });

  it("대괄호가 없으면 그대로 둔다", () => {
    expect(normalizeSpanLabel("p0.s3")).toBe("p0.s3");
  });

  it("안쪽은 건드리지 않는다 — 벗기는 것은 표기이지 내용이 아니다", () => {
    expect(normalizeSpanLabel("[p0.s3][p1.s0]")).toBe("p0.s3][p1.s0");
  });
});

describe("labelSpans", () => {
  it("각 줄에 이름을 붙이고 uuid는 싣지 않는다", () => {
    const labels = labelSpans(SPANS);

    expect(labels.document).toBe("[p0.s0] 원고는 계약을 맺었다.\n[p1.s2] 상고를 기각한다.");
    expect(labels.document).not.toContain("uuid-a");
  });

  it("대괄호를 쓴 답도 되돌린다", () => {
    const labels = labelSpans(SPANS);

    expect(labels.resolve("p1.s2")).toBe("uuid-b");
    expect(labels.resolve("[p1.s2]")).toBe("uuid-b");
  });

  it("지어낸 이름은 벗겨도 없는 것이다 — 여기까지가 관대함의 끝이다", () => {
    expect(labelSpans(SPANS).resolve("[p9.s9]")).toBeUndefined();
  });

  it("이름이 겹치면 나중 것을 버린다 — 가리키는 대상이 하나로 정해져야 한다", () => {
    const labels = labelSpans([
      SPANS[0] ?? { id: "", paraIdx: 0, sentIdx: 0, text: "" },
      { id: "uuid-c", paraIdx: 0, sentIdx: 0, text: "다른 문장." },
    ]);

    expect(labels.size).toBe(1);
    expect(labels.resolve("p0.s0")).toBe("uuid-a");
  });
});
