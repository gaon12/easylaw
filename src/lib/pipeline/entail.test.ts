import { describe, expect, it } from "vitest";
import type { CompletionRequest, LlmClient } from "@/lib/llm/client";
import { checkEntailment, ENTAIL_INSTRUCTION, toConfidence } from "./entail";

/** `CONVENTIONS.md` §8 — 실호출하지 않는다. */

function fakeClient(answer: unknown): LlmClient & { lastRequest?: CompletionRequest } {
  const client = {
    model: "test-model",
    complete: () => Promise.reject(new Error("쓰지 않는다")),
    completeJson: (request: CompletionRequest, validate: (value: unknown) => unknown) => {
      client.lastRequest = request;
      return Promise.resolve(validate(answer));
    },
  } as LlmClient & { lastRequest?: CompletionRequest };
  return client;
}

const claims = [
  { orderIdx: 0, text: "법원은 상고를 받아들이지 않았어요.", sources: ["상고를 기각한다."] },
  { orderIdx: 1, text: "원심의 판단이 옳다고 보았어요.", sources: ["원심판결은 정당하다."] },
];

describe("자기 확증을 막는다", () => {
  it("원문과 문장만 준다 — 어떻게 만들었는지는 주지 않는다", async () => {
    // §5.5 [6](b): "이 문장을 만든 이유"를 함께 주면 자기 확증이 일어난다.
    const client = fakeClient({
      checks: [
        { index: 0, verdict: "entailed", reason: "같은 뜻" },
        { index: 1, verdict: "entailed", reason: "같은 뜻" },
      ],
    });
    await checkEntailment(client, claims);

    const sent = JSON.stringify(client.lastRequest);
    expect(sent).toContain("상고를 기각한다.");
    expect(sent).toContain("법원은 상고를 받아들이지 않았어요.");
    // 레벨·구조 노드·렌더링 지시가 새어 들어가면 안 된다.
    expect(sent).not.toContain("conclusion");
    expect(sent).not.toContain("L2");
    expect(sent).not.toContain("해요체");
  });

  it("지시문이 '법 지식으로 판단하지 말라'고 말한다", () => {
    expect(ENTAIL_INSTRUCTION).toContain("근거에 적힌 것만");
    expect(ENTAIL_INSTRUCTION).toContain("법적으로 맞는 말이어도");
  });
});

describe("판정", () => {
  it("모델의 판정을 문장 순서에 맞춰 돌려준다", async () => {
    const client = fakeClient({
      checks: [
        { index: 1, verdict: "unsupported", reason: "근거에 없음" },
        { index: 0, verdict: "entailed", reason: "같은 뜻" },
      ],
    });
    const result = await checkEntailment(client, claims);

    expect(result.map((check) => [check.orderIdx, check.verdict])).toEqual([
      [0, "entailed"],
      [1, "unsupported"],
    ]);
  });

  it("근거가 없는 문장은 묻지 않고 unsupported로 둔다", async () => {
    const client = fakeClient({ checks: [{ index: 0, verdict: "entailed", reason: "ok" }] });
    const withHeading = [
      { orderIdx: 0, text: "다음 절차", sources: [] },
      ...claims.map((claim) => ({ ...claim, orderIdx: claim.orderIdx + 1 })),
    ];
    const result = await checkEntailment(client, withHeading);

    expect(result[0]?.verdict).toBe("unsupported");
    expect(result[0]?.reason).toContain("근거로 삼을 원문이 없");
    // 근거 없는 문장은 프롬프트에도 실리지 않는다 — 물어봤자 답이 정해져 있다.
    expect(JSON.stringify(client.lastRequest)).not.toContain("다음 절차");
  });

  it("모델이 빠뜨린 문장은 unsupported다 — 빠뜨림이 통과가 되면 안 된다", async () => {
    const client = fakeClient({ checks: [{ index: 0, verdict: "entailed", reason: "같은 뜻" }] });
    const result = await checkEntailment(client, claims);

    expect(result[1]?.verdict).toBe("unsupported");
    expect(result[1]?.reason).toContain("판정하지 않았");
  });

  it("없는 번호를 답하면 버린다", async () => {
    const client = fakeClient({
      checks: [
        { index: 0, verdict: "entailed", reason: "ok" },
        { index: 99, verdict: "entailed", reason: "지어낸 번호" },
      ],
    });
    const result = await checkEntailment(client, claims);

    expect(result).toHaveLength(2);
    expect(result[1]?.verdict).toBe("unsupported");
  });

  it("물어볼 문장이 하나도 없으면 호출하지 않는다", async () => {
    const client = fakeClient({ checks: [] });
    const result = await checkEntailment(client, [{ orderIdx: 0, text: "제목", sources: [] }]);

    expect(result).toHaveLength(1);
    expect(client.lastRequest).toBeUndefined();
  });
});

describe("toConfidence", () => {
  it("어긋나는 문장은 막고, 알 수 없는 문장은 배지를 붙여 보여 준다", () => {
    expect(toConfidence("entailed")).toBe("grounded");
    // unsupported는 "틀렸다"가 아니라 "알 수 없다"다. 막지 않고 알린다.
    expect(toConfidence("unsupported")).toBe("needs_check");
    expect(toConfidence("contradicted")).toBe("ungrounded");
  });
});
