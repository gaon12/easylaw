import { describe, expect, it } from "vitest";
import { extractJson, jsonCandidates, parseCompletion } from "./parse";

/** 최소한의 정상 응답. 각 테스트가 필요한 부분만 덮어쓴다. */
function response(overrides: Record<string, unknown> = {}): unknown {
  return {
    choices: [{ message: { role: "assistant", content: "안녕하세요" }, finish_reason: "stop" }],
    ...overrides,
  };
}

describe("parseCompletion", () => {
  it("첫 선택지의 텍스트를 꺼낸다", () => {
    expect(parseCompletion(response()).text).toBe("안녕하세요");
  });

  it("모르는 종료 사유는 other로 모은다", () => {
    const payload = response({
      choices: [{ message: { content: "…" }, finish_reason: "정체불명" }],
    });
    expect(parseCompletion(payload).finishReason).toBe("other");
  });

  it("잘린 응답을 length로 알린다 — 망가진 JSON과 원인이 다르다", () => {
    const payload = response({
      choices: [{ message: { content: '{"a":' }, finish_reason: "length" }],
    });
    expect(parseCompletion(payload).finishReason).toBe("length");
  });

  it("content가 null이면 빈 문자열로 본다", () => {
    const payload = response({ choices: [{ message: { content: null }, finish_reason: "stop" }] });
    expect(parseCompletion(payload).text).toBe("");
  });

  it("사용량을 담는다. 서버가 안 주면 undefined다", () => {
    const withUsage = parseCompletion(
      response({ usage: { prompt_tokens: 12, completion_tokens: 3 } }),
    );
    expect(withUsage.promptTokens).toBe(12);
    expect(withUsage.completionTokens).toBe(3);
    expect(parseCompletion(response()).promptTokens).toBeUndefined();
  });

  it("모르는 필드가 섞여 있어도 읽는다 — 제공자마다 덧붙이는 것이 다르다", () => {
    const payload = response({ id: "chatcmpl-1", system_fingerprint: "fp", object: "x" });
    expect(parseCompletion(payload).text).toBe("안녕하세요");
  });

  it("선택지가 없으면 던진다 — 빈 문자열로 넘기면 '못 읽음'과 구분되지 않는다", () => {
    expect(() => parseCompletion({ choices: [] })).toThrow();
    expect(() => parseCompletion({})).toThrow();
  });
});

describe("extractJson", () => {
  it("그대로 된 JSON을 읽는다", () => {
    expect(extractJson('{"결론":"파기환송"}')).toEqual({ 결론: "파기환송" });
  });

  it("코드 울타리를 벗긴다", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("앞뒤에 붙은 말을 잘라 낸다", () => {
    expect(extractJson('다음과 같습니다:\n{"a":1}\n이상입니다.')).toEqual({ a: 1 });
  });

  it("중첩 객체를 마지막 닫는 괄호까지 가져온다", () => {
    expect(extractJson('설명 {"a":{"b":2}} 끝')).toEqual({ a: { b: 2 } });
  });

  it("빈 응답과 JSON이 없는 응답을 구분해서 던진다", () => {
    expect(() => extractJson("   ")).toThrow("빈 응답");
    expect(() => extractJson("죄송합니다, 만들 수 없습니다.")).toThrow("JSON을 찾지 못했");
  });

  it("잘린 JSON은 던진다 — 조용히 절반만 쓰지 않는다", () => {
    expect(() => extractJson('{"a": 1, "b"')).toThrow();
  });
});

/*
 * Gemma가 실제로 보낸 모양이다 — 초안을 쓰고, 그것을 스스로 점검하는 글을 쓰고, 고친 답을
 * 다시 썼다. 첫 `{`부터 마지막 `}`까지 한 번에 자르면 두 덩어리를 통째로 삼켜 아무것도
 * 읽히지 않는다.
 */
describe("jsonCandidates", () => {
  it("답을 두 번 쓴 응답에서 둘 다 꺼내고, 나중 것을 먼저 준다", () => {
    const text = [
      "생각을 적어 봅니다.",
      "```json",
      '{"sentences": [{"role": "body", "text": "초안"}]}',
      "```",
      "다시 보니 고칠 곳이 있습니다.",
      "```json",
      '{"sentences": [{"role": "body", "text": "고친 것"}]}',
      "```",
    ].join("\n");

    const candidates = jsonCandidates(text);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toEqual({ sentences: [{ role: "body", text: "고친 것" }] });
    expect(candidates[1]).toEqual({ sentences: [{ role: "body", text: "초안" }] });
  });

  it("문자열 안의 중괄호를 세지 않는다 — 판결문에 섞여 들어온다", () => {
    expect(jsonCandidates('앞말 {"a": "여는 괄호 { 와 닫는 괄호 }"} 뒷말')[0]).toEqual({
      a: "여는 괄호 { 와 닫는 괄호 }",
    });
  });

  it("읽을 것이 하나도 없으면 빈 목록이다 — 던지는 것은 빈 응답뿐이다", () => {
    expect(jsonCandidates("죄송합니다, 만들 수 없습니다.")).toEqual([]);
    expect(() => jsonCandidates("   ")).toThrow("빈 응답");
  });
});
