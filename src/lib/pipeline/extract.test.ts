import { describe, expect, it } from "vitest";
import type { CompletionRequest, LlmClient } from "@/lib/llm/client";
import { extractStructure } from "./extract";
import { parseExtraction } from "./extract-schema";
import { labelSpans } from "./span-label";

/**
 * `CONVENTIONS.md` §8 — LLM을 실제로 호출하지 않는다. 기록해 둔 모양의 응답으로 돌린다.
 */

const spans = [
  { id: "uuid-a", paraIdx: 0, sentIdx: 0, text: "원고는 2019. 3. 1. 피고와 계약을 맺었다." },
  { id: "uuid-b", paraIdx: 0, sentIdx: 1, text: "피고는 대금을 지급하지 않았다." },
  { id: "uuid-c", paraIdx: 1, sentIdx: 0, text: "민법 제105조에 따라 판단한다." },
  { id: "uuid-d", paraIdx: 1, sentIdx: 1, text: "피고의 상고를 기각한다." },
];

/** 마지막 요청을 들여다볼 수 있는 가짜 클라이언트. */
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

const goodAnswer = {
  nodes: [
    {
      kind: "fact_event",
      source_spans: ["p0.s0"],
      text: "계약 체결",
      occurred_on: "2019-03-01",
    },
    { kind: "claim", source_spans: ["p0.s1"], party: "plaintiff", text: "대금 미지급" },
    { kind: "citation", source_spans: ["p1.s0"], law_name: "민법", article: "105" },
    { kind: "conclusion", source_spans: ["p1.s1"], text: "상고 기각" },
  ],
};

describe("문서 만들기", () => {
  it("문장마다 p{문단}.s{문장} 이름을 붙여 보낸다", async () => {
    const client = fakeClient(goodAnswer);
    await extractStructure(client, spans);

    const document = client.lastRequest?.documents?.[0]?.text ?? "";
    expect(document).toContain("[p0.s0] 원고는 2019. 3. 1. 피고와 계약을 맺었다.");
    expect(document).toContain("[p1.s1] 피고의 상고를 기각한다.");
    // UUID를 프롬프트에 싣지 않는다 — 토큰만 쓰고 모델이 틀리게 적는다.
    expect(document).not.toContain("uuid-a");
  });

  it("판결문을 지시가 아니라 문서로 보낸다", async () => {
    const client = fakeClient(goodAnswer);
    await extractStructure(client, spans);

    /*
     * 판결문의 **문장**이 지시문에 섞였는지를 본다. "원고는" 같은 낱말 하나로 보면
     * 안 된다 — 지시문의 출력 예시에도 그 말이 정당하게 들어간다(예시가 없으면 모델이
     * 칸 이름을 지어낸다). 실제로 옮겨졌다면 문장째 옮겨진다.
     */
    expect(client.lastRequest?.instruction).not.toContain("2019. 3. 1. 피고와 계약을 맺었다");
    expect(client.lastRequest?.documents).toHaveLength(1);
  });
});

describe("결과 되돌리기", () => {
  it("모델이 답한 이름을 우리 span id로 되돌린다", async () => {
    const result = await extractStructure(fakeClient(goodAnswer), spans);

    expect(result.nodes.map((node) => node.spanIds)).toEqual([
      ["uuid-a"],
      ["uuid-b"],
      ["uuid-c"],
      ["uuid-d"],
    ]);
  });

  it("종류와 내용을 payload에 담는다. kind와 근거는 빼고 나머지만", async () => {
    const [first] = (await extractStructure(fakeClient(goodAnswer), spans)).nodes;

    expect(first?.kind).toBe("fact_event");
    expect(first?.payload).toEqual({ text: "계약 체결", occurred_on: "2019-03-01" });
    expect(first?.occurredOn).toEqual(new Date("2019-03-01T00:00:00Z"));
  });

  it("모델과 프롬프트 버전을 함께 낸다 — 캐시 키가 된다", async () => {
    const result = await extractStructure(fakeClient(goodAnswer), spans);

    expect(result.model).toBe("test-model");
    expect(result.promptVersion).toMatch(/^extract-/u);
  });
});

describe("지어낸 근거", () => {
  it("문서에 없는 span 이름은 버리고 세어 둔다", async () => {
    const answer = {
      nodes: [{ kind: "issue", source_spans: ["p0.s0", "p9.s9"], text: "쟁점" }],
    };
    const result = await extractStructure(fakeClient(answer), spans);

    expect(result.nodes[0]?.spanIds).toEqual(["uuid-a"]);
    // 조용히 버리면 프롬프트가 잘 듣는지 볼 신호가 사라진다.
    expect(result.unknownSpanLabels).toEqual(["p9.s9"]);
  });

  it("근거가 전부 지어낸 것이면 노드째 버린다 — P2", async () => {
    const answer = {
      nodes: [
        { kind: "issue", source_spans: ["p9.s9"], text: "지어낸 쟁점" },
        { kind: "conclusion", source_spans: ["p1.s1"], text: "상고 기각" },
      ],
    };
    const result = await extractStructure(fakeClient(answer), spans);

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]?.kind).toBe("conclusion");
    // 버린 뒤에도 순서 번호가 이어져야 한다.
    expect(result.nodes[0]?.orderIdx).toBe(0);
  });
});

describe("규격 검사", () => {
  it("근거가 빈 노드를 받지 않는다 — 여기가 마지막 문지기다", () => {
    expect(() =>
      parseExtraction({ nodes: [{ kind: "issue", source_spans: [], text: "쟁점" }] }),
    ).toThrow();
  });

  it("span 이름의 모양이 다르면 받지 않는다", () => {
    expect(() =>
      parseExtraction({ nodes: [{ kind: "issue", source_spans: ["첫째 문장"], text: "쟁점" }] }),
    ).toThrow();
  });

  it("주장에 누구의 것인지가 없으면 받지 않는다 — 주장과 판단이 섞인다", () => {
    expect(() =>
      parseExtraction({ nodes: [{ kind: "claim", source_spans: ["p0.s0"], text: "주장" }] }),
    ).toThrow();
  });

  it("모르는 종류를 받지 않는다", () => {
    expect(() =>
      parseExtraction({ nodes: [{ kind: "guess", source_spans: ["p0.s0"], text: "?" }] }),
    ).toThrow();
  });

  it("노드가 하나도 없으면 받지 않는다 — 빈 구조는 실패다", () => {
    expect(() => parseExtraction({ nodes: [] })).toThrow();
  });

  it("날짜 모양이 다르면 받지 않는다 — 지어낸 날짜가 가장 위험하다", () => {
    expect(() =>
      parseExtraction({
        nodes: [
          {
            kind: "fact_event",
            source_spans: ["p0.s0"],
            text: "계약",
            occurred_on: "2019년 3월",
          },
        ],
      }),
    ).toThrow();
  });
});

describe("labelSpans", () => {
  it("이름이 겹치면 하나만 남긴다 — 가리키는 대상이 하나여야 한다", () => {
    const labels = labelSpans([
      { id: "first", paraIdx: 0, sentIdx: 0, text: "먼저" },
      { id: "second", paraIdx: 0, sentIdx: 0, text: "나중" },
    ]);

    expect(labels.size).toBe(1);
    expect(labels.resolve("p0.s0")).toBe("first");
    expect(labels.document).not.toContain("나중");
  });
});
