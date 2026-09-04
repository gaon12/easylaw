import { describe, expect, it } from "vitest";
import type { CompletionRequest, LlmClient } from "@/lib/llm/client";
import { LEVEL_RULES } from "@/lib/rendition/lint";
import { renderLevel } from "./render";
import { RENDER_PROMPT_VERSION, renderInstruction } from "./render-prompt";
import { parseRendition } from "./render-schema";

/** `CONVENTIONS.md` §8 — 실호출하지 않는다. */

const nodes = [
  { id: "node-a", kind: "conclusion", payload: { text: "상고 기각" } },
  { id: "node-b", kind: "holding", payload: { text: "원심 판단이 옳다" } },
  { id: "node-c", kind: "claim", payload: { party: "defendant", text: "법리 오해" } },
];

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

/** L2가 통과하려면 "다음 절차" 제목이 있어야 한다. */
const goodL2 = {
  sentences: [
    { role: "body", text: "법원은 상고를 받아들이지 않았어요.", from: "n0" },
    { role: "body", text: "원심의 판단이 옳다고 보았어요.", from: "n1" },
    { role: "heading", text: "다음 절차" },
    { role: "body", text: "이 판결에 대해 더 다툴 수 있는지 확인해 보세요.", from: "n0" },
  ],
};

describe("프롬프트", () => {
  it("구조만 보내고 원문은 보내지 않는다 — §5.5 [5]", async () => {
    const client = fakeClient(goodL2);
    await renderLevel(client, "L2", nodes);

    const document = client.lastRequest?.documents?.[0]?.text ?? "";
    expect(document).toContain("[n0] 재판의 결론: 상고 기각");
    expect(document).toContain("[n2] 피고 측의 주장: 법리 오해");
    // 노드 id를 프롬프트에 싣지 않는다.
    expect(document).not.toContain("node-a");
    expect(document).not.toContain('{"party":"defendant"');
  });

  it("모든 구조 필드를 모델이 바로 읽을 수 있는 한국어 한 줄로 보낸다", async () => {
    const client = fakeClient(goodL2);
    await renderLevel(client, "L2", [
      { id: "f", kind: "fact_event", payload: { text: "계약을\n맺음", occurred_on: "2019-03-01" } },
      { id: "i", kind: "issue", payload: { text: "대금을 주어야 하는지" } },
      { id: "c1", kind: "claim", payload: { party: "plaintiff", text: "대금을 받지 못함" } },
      { id: "c2", kind: "claim", payload: { party: "prosecutor", text: "유죄라고 주장함" } },
      { id: "h", kind: "holding", payload: { text: "청구에 이유가 없음" } },
      { id: "o", kind: "conclusion", payload: { text: "상고 기각" } },
      {
        id: "law",
        kind: "citation",
        payload: { law_name: "민법", article: "제390조", clause: "제1항", item: "제2호" },
      },
    ]);

    expect(client.lastRequest?.documents?.[0]?.text).toBe(
      [
        "[n0] 사실관계(발생일: 2019-03-01): 계약을 맺음",
        "[n1] 사건의 쟁점: 대금을 주어야 하는지",
        "[n2] 원고 측의 주장: 대금을 받지 못함",
        "[n3] 검사의 주장: 유죄라고 주장함",
        "[n4] 법원의 판단과 이유: 청구에 이유가 없음",
        "[n5] 재판의 결론: 상고 기각",
        "[n6] 인용 법령: 민법 제390조 제1항 제2호",
      ].join("\n"),
    );
  });

  it("지시문이 실제 한국어 입력 모양과 주장 주체를 설명하고 버전을 구분한다", () => {
    const instruction = renderInstruction("L2");

    expect(instruction).toContain("[n0] 한국어 라벨: 내용");
    expect(instruction).toContain("피고 측의 주장");
    expect(instruction).toContain("법원의 판단과 이유");
    expect(instruction).not.toContain("[n0] 종류: 내용");
    expect(RENDER_PROMPT_VERSION).toBe("render-2026-09-05-v3");
  });

  it("린터가 검사하는 규칙을 지시문이 그대로 말한다", () => {
    // 지시문과 린터가 어긋나면, 모델이 성실히 따른 결과가 우리 검사에 걸려 재생성된다.
    for (const level of ["L2", "L3", "L4"] as const) {
      const instruction = renderInstruction(level);
      const rules = LEVEL_RULES[level];

      expect(instruction).toContain(String(rules.maxSentenceLength));
      for (const section of rules.requiredSections) {
        expect(instruction).toContain(section);
      }
    }
  });

  it("L4에만 당신 호칭과 비유 금지를 말한다", () => {
    expect(renderInstruction("L4")).toContain("당신");
    expect(renderInstruction("L4")).toContain("비유");
    expect(renderInstruction("L1")).not.toContain("비유를 쓰지 않습니다");
  });

  it("L2·L3·L4는 서로 다른 독자와 설명 방식을 지시한다", () => {
    const l2 = renderInstruction("L2");
    const l3 = renderInstruction("L3");
    const l4 = renderInstruction("L4");

    expect(l2).toContain("정중한 **-합니다**체");
    expect(l2).toContain("당사자에게 미치는 효과");

    expect(l3).toContain("초등 고학년~중학생이 아는 일상 낱말");
    expect(l3).toContain("시간 순서와 인물의 흐름");
    expect(l3).toContain("그 용어의 문맥상 뜻만");
    expect(l3).not.toContain("한 문장에 한 가지 정보만");

    expect(l4).toContain("한 문장에 한 가지 정보만");
    expect(l4).toContain("바로 다음 별도 문장");
    expect(l4).toContain("그 용어의 문맥상 뜻만");
    expect(l4).toContain("마지막에는 이해 확인 질문");
    expect(l4).not.toContain("시간 순서와 인물의 흐름");
  });

  it("모든 레벨에 단정 금지를 말한다 — 전문가가 지적한 결함이다", () => {
    for (const level of ["L1", "L2", "L3", "L4"] as const) {
      expect(renderInstruction(level)).toContain("이겼습니다");
    }
  });
});

describe("결과", () => {
  it("문장을 구조 노드에 잇는다 — 노드를 통해 원문까지 되짚어진다", async () => {
    const result = await renderLevel(fakeClient(goodL2), "L2", nodes);

    expect(result.lines.map((line) => line.structureNodeId)).toEqual([
      "node-a",
      "node-b",
      null,
      "node-a",
    ]);
    expect(result.blocked).toBe(false);
  });

  it("제목은 근거가 없어도 grounded다 — 우리가 정한 섹션 이름이다", async () => {
    const result = await renderLevel(fakeClient(goodL2), "L2", nodes);
    const heading = result.lines.find((line) => line.role === "heading");

    expect(heading?.structureNodeId).toBeNull();
    expect(heading?.confidence).toBe("grounded");
  });

  it("지어낸 노드 이름은 세어 두고 그 문장을 ungrounded로 막는다", async () => {
    const answer = {
      sentences: [
        { role: "body", text: "지어낸 문장이에요.", from: "n9" },
        { role: "heading", text: "다음 절차" },
        { role: "body", text: "확인해 보세요.", from: "n0" },
      ],
    };
    const result = await renderLevel(fakeClient(answer), "L2", nodes);

    expect(result.unknownNodeLabels).toEqual(["n9"]);
    expect(result.lines[0]?.confidence).toBe("ungrounded");
    // 근거 없는 문장이 하나라도 있으면 그대로 보여 주지 않는다(P2).
    expect(result.blocked).toBe(true);
  });
});

describe("규칙 린터를 함께 돌린다", () => {
  it("필수 섹션이 없으면 막는다", async () => {
    const answer = {
      sentences: [{ role: "body", text: "상고를 받아들이지 않았어요.", from: "n0" }],
    };
    const result = await renderLevel(fakeClient(answer), "L2", nodes);

    expect(result.blocked).toBe(true);
    expect(result.issues.some((issue) => issue.rule === "missing_section")).toBe(true);
  });

  it("단정 표현을 잡는다", async () => {
    const answer = {
      sentences: [
        { role: "body", text: "당신이 이겼습니다.", from: "n0" },
        { role: "heading", text: "다음 절차" },
        { role: "body", text: "확인해 보세요.", from: "n0" },
      ],
    };
    const result = await renderLevel(fakeClient(answer), "L2", nodes);

    expect(result.issues.some((issue) => issue.rule === "assertive_outcome")).toBe(true);
    expect(result.blocked).toBe(true);
  });

  it("L4에서 문장이 길면 잡는다", async () => {
    const long = "당신은 법원이 내린 결정에 대하여 다시 한 번 다투어 볼 수 있는 방법이 있어요.";
    const answer = {
      sentences: [
        { role: "body", text: long, from: "n0" },
        { role: "heading", text: "그래서 어떻게 되나요" },
        { role: "heading", text: "이해 확인" },
      ],
    };
    const result = await renderLevel(fakeClient(answer), "L4", nodes);

    expect(long.length).toBeGreaterThan(LEVEL_RULES.L4.maxSentenceLength ?? 0);
    expect(result.issues.some((issue) => issue.rule === "sentence_too_long")).toBe(true);
  });

  it("고치지 않고 문제만 알린다 — 고치면 무엇이 문제였는지가 사라진다", async () => {
    const answer = {
      sentences: [{ role: "body", text: "당신이 이겼습니다.", from: "n0" }],
    };
    const result = await renderLevel(fakeClient(answer), "L2", nodes);

    expect(result.lines[0]?.text).toBe("당신이 이겼습니다.");
  });
});

describe("규격 검사", () => {
  it("근거 없는 본문을 받지 않는다", () => {
    expect(() => parseRendition({ sentences: [{ role: "body", text: "근거 없음" }] })).toThrow(
      "근거 노드가 없는 본문",
    );
  });

  it("제목은 근거가 없어도 된다", () => {
    expect(() =>
      parseRendition({ sentences: [{ role: "heading", text: "다음 절차" }] }),
    ).not.toThrow();
  });

  it("노드 이름의 모양이 다르면 받지 않는다", () => {
    expect(() =>
      parseRendition({ sentences: [{ role: "body", text: "글", from: "첫째 노드" }] }),
    ).toThrow();
  });

  it("문장이 하나도 없으면 받지 않는다", () => {
    expect(() => parseRendition({ sentences: [] })).toThrow();
  });
});
