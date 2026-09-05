import { describe, expect, it } from "vitest";
import type { LawApi } from "@/lib/law-api/client";
import { LawApiError } from "@/lib/law-api/client";
import type { LlmClient } from "@/lib/llm/client";
import { LlmError } from "@/lib/llm/client";
import { PROBE_CASE_NO, probeLawApi, probeLlm } from "./connection-test";

/** 시험 대상을 인자로 받게 만든 덕에 네트워크 없이 확인할 수 있다. */

/** 시험이 쓰는 것은 `searchByCaseNumber` 하나뿐이다. 나머지는 불리면 터지게 둔다. */
function fakeLawApi(overrides: Partial<LawApi>): LawApi {
  const notUsed = () => Promise.reject(new Error("연결 시험은 이 함수를 쓰지 않습니다."));
  return {
    searchByCaseNumber: () => Promise.resolve([]),
    searchByKeyword: notUsed,
    fetchDetail: () => Promise.resolve(undefined),
    searchLaws: notUsed,
    fetchLaw: notUsed,
    searchTerms: notUsed,
    fetchTerms: notUsed,
    searchDecisions: notUsed,
    fetchDecision: notUsed,
    ...overrides,
  };
}

function fakeLlm(overrides: Partial<LlmClient>): LlmClient {
  return {
    model: "test-model",
    complete: () =>
      Promise.resolve({
        text: "준비됨",
        finishReason: "stop" as const,
        promptTokens: undefined,
        completionTokens: undefined,
        reasoningTokens: undefined,
      }),
    completeJson: () => Promise.reject(new Error("쓰지 않는다")),
    ...overrides,
  };
}

describe("probeLawApi", () => {
  it("설정이 없으면 실패가 아니라 '안 켬'이다", async () => {
    expect(await probeLawApi(undefined)).toEqual({ kind: "not_configured" });
  });

  it("0건이 와도 성공이다 — 키가 맞아야 목록 응답 자체가 온다", async () => {
    const result = await probeLawApi(fakeLawApi({ searchByCaseNumber: () => Promise.resolve([]) }));

    expect(result.kind).toBe("ok");
    expect(result.kind === "ok" && result.detail).toContain("0건");
  });

  it("우리가 실제로 조회하는 사건번호로 시험한다", async () => {
    let asked: string | undefined;
    await probeLawApi(
      fakeLawApi({
        searchByCaseNumber: (caseNo) => {
          asked = caseNo;
          return Promise.resolve([]);
        },
      }),
    );

    expect(asked).toBe(PROBE_CASE_NO);
  });

  it("인증이 틀려 던지면 그 이유를 그대로 전한다", async () => {
    const result = await probeLawApi(
      fakeLawApi({
        searchByCaseNumber: () =>
          Promise.reject(new LawApiError("법제처 API가 JSON이 아닌 응답을 보냈습니다.")),
      }),
    );

    expect(result.kind).toBe("failed");
    expect(result.kind === "failed" && result.message).toContain("JSON이 아닌");
  });
});

describe("probeLlm", () => {
  it("설정이 없으면 실패가 아니라 '안 켬'이다", async () => {
    expect(await probeLlm(undefined)).toEqual({ kind: "not_configured" });
  });

  it("모델 이름과 답을 함께 알린다", async () => {
    const result = await probeLlm(fakeLlm({}));

    expect(result.kind).toBe("ok");
    expect(result.kind === "ok" && result.detail).toContain("test-model");
    expect(result.kind === "ok" && result.detail).toContain("준비됨");
  });

  it("판결문을 실어 보내지 않는다 — 시험 한 번이 지출이 되면 안 된다", async () => {
    let documents: unknown;
    await probeLlm(
      fakeLlm({
        complete: (request) => {
          documents = request.documents;
          return Promise.resolve({
            text: "준비됨",
            finishReason: "stop" as const,
            promptTokens: undefined,
            completionTokens: undefined,
            reasoningTokens: undefined,
          });
        },
      }),
    );

    expect(documents).toBeUndefined();
  });

  it("200이 와도 빈 답이면 실패로 본다", async () => {
    const result = await probeLlm(
      fakeLlm({
        complete: () =>
          Promise.resolve({
            text: "   ",
            finishReason: "stop" as const,
            promptTokens: undefined,
            completionTokens: undefined,
            reasoningTokens: undefined,
          }),
      }),
    );

    expect(result.kind).toBe("failed");
    expect(result.kind === "failed" && result.message).toContain("빈 응답");
  });

  it("연결 실패의 이유를 그대로 전한다", async () => {
    const result = await probeLlm(
      fakeLlm({
        complete: () => Promise.reject(new LlmError("AI 서버 응답이 401입니다.", { status: 401 })),
      }),
    );

    expect(result.kind).toBe("failed");
    expect(result.kind === "failed" && result.message).toContain("401");
  });
});
