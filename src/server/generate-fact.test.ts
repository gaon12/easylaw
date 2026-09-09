import { describe, expect, it } from "vitest";
import type { CompletionRequest, LlmClient } from "@/lib/llm/client";
import { verifyClaims } from "./generate";

function clientReturning(answer: unknown): LlmClient & { calls: number } {
  const client = {
    providerId: "test-provider",
    model: "test-model",
    calls: 0,
    complete: () => Promise.reject(new Error("쓰지 않는다")),
    completeJson: (_request: CompletionRequest, validate: (value: unknown) => unknown) => {
      client.calls += 1;
      return Promise.resolve(validate(answer));
    },
  } as LlmClient & { calls: number };
  return client;
}

describe("생성 파이프라인의 사실 검사", () => {
  it("명백히 틀린 금액은 모델 판정에 비용을 쓰기 전에 막는다", async () => {
    const client = clientReturning({ checks: [] });
    const [result] = await verifyClaims(client, [
      { orderIdx: 0, text: "보증금은 1,000만 원이에요.", sources: ["보증금은 100만 원이다."] },
    ]);

    expect(client.calls).toBe(0);
    expect(result).toMatchObject({ orderIdx: 0, verdict: "contradicted" });
  });

  it("결정론적 대조를 통과한 문장은 별도 함의 검사로 이어진다", async () => {
    const client = clientReturning({
      checks: [{ index: 0, verdict: "entailed", reason: "같은 사실" }],
    });
    const result = await verifyClaims(client, [
      { orderIdx: 3, text: "보증금은 100만 원이에요.", sources: ["보증금은 1,000,000원이다."] },
    ]);

    expect(client.calls).toBe(1);
    expect(result).toEqual([{ orderIdx: 3, verdict: "entailed", reason: "같은 사실" }]);
  });
});
