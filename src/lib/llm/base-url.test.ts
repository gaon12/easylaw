import { describe, expect, it } from "vitest";
import { baseUrlAdvice, checkBaseUrl, isBaseUrlProblem, trimBaseUrl } from "./base-url";

/**
 * 사람이 제공자 문서에서 그대로 복사해 오는 값들이다. 여기 있는 예시는 전부 실제 문서에
 * 적혀 있는 형태다 — 우리가 지어낸 오타가 아니다.
 *
 * **여기서 값을 고쳐 주지 않는다.** 한때 잘못된 주소를 자동으로 바로잡아 불렀는데,
 * 그러면 저장된 값과 실제로 부르는 주소가 달라져 사람이 자기가 넣은 것을 모르게 된다.
 * 그래서 이 시험이 보는 것은 **무엇이 통과하고, 막힌 것에 무슨 말을 하는가**다.
 */

describe("trimBaseUrl", () => {
  it("앞뒤 공백과 끝의 슬래시만 턴다", () => {
    expect(trimBaseUrl("  https://api.z.ai/api/paas/v4/  ")).toBe("https://api.z.ai/api/paas/v4");
  });

  it("그 밖에는 한 글자도 바꾸지 않는다", () => {
    expect(trimBaseUrl("https://api.openai.com/v1")).toBe("https://api.openai.com/v1");
  });
});

describe("checkBaseUrl", () => {
  it("OpenAI 형식을 통과시킨다", () => {
    expect(checkBaseUrl("https://api.openai.com/v1")).toBeUndefined();
  });

  it("끝의 슬래시는 문제가 아니다 — Z.AI 문서가 그렇게 적어 둔다", () => {
    expect(checkBaseUrl("https://api.z.ai/api/paas/v4/")).toBeUndefined();
  });

  it("빈 값은 문제가 아니다 — AI 연결을 켜지 않겠다는 뜻이다", () => {
    expect(checkBaseUrl("   ")).toBeUndefined();
  });

  it("끝까지 적힌 엔드포인트를 막는다", () => {
    expect(checkBaseUrl("https://api.openai.com/v1/chat/completions")).toBe("completions_suffix");
  });

  it("Gemini 네이티브 주소를 막는다", () => {
    expect(checkBaseUrl("https://generativelanguage.googleapis.com/v1beta")).toBe("gemini_native");
  });

  it("Gemini라도 `/openai`가 있으면 통과시킨다", () => {
    expect(checkBaseUrl("https://generativelanguage.googleapis.com/v1beta/openai")).toBeUndefined();
  });

  it("주소가 아닌 글자를 막는다", () => {
    expect(checkBaseUrl('"https://api.openai.com/v1"')).toBe("not_a_url");
  });

  it("내 컴퓨터가 아닌 http는 막는다 — 키가 그대로 나간다", () => {
    expect(checkBaseUrl("http://api.example.com/v1")).toBe("insecure_http");
  });

  it("내 컴퓨터에 띄운 모델은 http라도 통과시킨다", () => {
    expect(checkBaseUrl("http://127.0.0.1:11434/v1")).toBeUndefined();
    expect(checkBaseUrl("http://localhost:8000/v1")).toBeUndefined();
  });
});

describe("baseUrlAdvice", () => {
  it("넣은 값을 주면 고쳐 쓴 주소를 예로 보여 준다", () => {
    const advice = baseUrlAdvice(
      "completions_suffix",
      "https://api.openai.com/v1/chat/completions",
    );

    expect(advice).toContain("https://api.openai.com/v1`까지만");
  });

  it("값이 없어도 방법은 말한다 — 주소줄로 돌아온 경우다", () => {
    expect(baseUrlAdvice("gemini_native")).toContain("/openai");
  });

  it("모든 문제에 할 말이 있다", () => {
    for (const problem of ["not_a_url", "not_http", "insecure_http"] as const) {
      expect(baseUrlAdvice(problem).length).toBeGreaterThan(0);
    }
  });
});

describe("isBaseUrlProblem", () => {
  it("우리가 아는 이름만 통과시킨다 — 주소줄로 아무 글이나 들어온다", () => {
    expect(isBaseUrlProblem("gemini_native")).toBe(true);
    expect(isBaseUrlProblem("여기로 전화하세요 010-0000-0000")).toBe(false);
    expect(isBaseUrlProblem(undefined)).toBe(false);
  });
});
