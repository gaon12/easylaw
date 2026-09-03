import { describe, expect, it } from "vitest";
import { extractJson, parseCompletion } from "./parse";

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
