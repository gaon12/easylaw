/**
 * OpenAI 호환 chat completions 응답 파서.
 *
 * biome-ignore-all lint/style/useNamingConvention: 응답·요청 필드명이 snake_case다.
 * 스키마 키는 프로토콜과 글자 그대로 같아야 하며, 이름을 바꾸면 파싱이 조용히 실패한다.
 *
 * `.dev/CONVENTIONS.md` §7 — 외부 API 응답을 신뢰하지 않는다. 파싱 후 스키마로 검증한다.
 * 모델 응답은 특히 그렇다. 우리가 JSON을 달라고 했다는 사실이 JSON이 온다는 보장은 아니다.
 */

import { z } from "zod";

/** 왜 끝났는가. `length`는 **잘린 것**이고, 잘린 JSON은 망가진 JSON과 고치는 방법이 다르다. */
type FinishReason = "stop" | "length" | "content_filter" | "tool_calls" | "other";

interface Completion {
  readonly text: string;
  readonly finishReason: FinishReason;
  /** 비용 추적용. 서버가 안 줄 수도 있다. */
  readonly promptTokens: number | undefined;
  readonly completionTokens: number | undefined;
}

const usageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
  })
  .loose();

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z
          .object({
            // 도구 호출만 있는 응답은 content가 null이다. 우리는 텍스트만 쓰므로 빈 문자열로 본다.
            content: z.string().nullish(),
          })
          .loose(),
        finish_reason: z.string().nullish(),
      }),
    )
    .min(1, "선택지가 없는 응답입니다."),
  usage: usageSchema.optional(),
});

const KNOWN_FINISH_REASONS = new Set(["stop", "length", "content_filter", "tool_calls"]);

function toFinishReason(raw: string | null | undefined): FinishReason {
  if (typeof raw === "string" && KNOWN_FINISH_REASONS.has(raw)) {
    return raw as FinishReason;
  }
  return "other";
}

/**
 * 응답 봉투에서 첫 선택지의 텍스트를 꺼낸다.
 *
 * 형태가 어긋나면 던진다. 빈 문자열로 넘기면 "모델이 아무 말도 안 했다"와
 * "우리가 응답을 못 읽었다"가 같은 값이 되고, 위쪽에서 구분할 방법이 사라진다.
 */
function parseCompletion(payload: unknown): Completion {
  const parsed = responseSchema.parse(payload);
  const choice = parsed.choices[0];
  if (choice === undefined) {
    throw new Error("선택지가 없는 응답입니다.");
  }
  return {
    text: choice.message.content ?? "",
    finishReason: toFinishReason(choice.finish_reason),
    promptTokens: parsed.usage?.prompt_tokens,
    completionTokens: parsed.usage?.completion_tokens,
  };
}

/** ```json … ``` 울타리. 달라고 하지 않아도 씌워서 주는 모델이 많다. */
const CODE_FENCE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/u;

/**
 * 모델이 뱉은 텍스트에서 JSON 객체를 꺼낸다.
 *
 * `response_format`을 줘도 순수 JSON만 오지는 않는다. 코드 울타리를 씌우거나
 * "다음과 같습니다:" 같은 머리말을 붙이는 모델이 흔하다. 세 단계로 시도한다.
 *
 * 1. 그대로 파싱
 * 2. 코드 울타리를 벗기고 파싱
 * 3. 첫 `{`부터 마지막 `}`까지 잘라서 파싱
 *
 * 3번은 거칠다 — 본문에 중괄호가 섞인 산문이 앞뒤로 붙으면 틀린 조각을 자를 수 있다.
 * 그래도 여기서 잘라 낸 결과는 **반드시 zod 스키마를 다시 통과해야** 쓰이므로,
 * 잘못 자른 조각은 다음 단계에서 걸린다. 이 함수는 관대해도 되고 스키마는 그러면 안 된다.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("모델이 빈 응답을 보냈습니다.");
  }

  const candidates = [trimmed];

  const fenced = CODE_FENCE.exec(trimmed)?.[1];
  if (fenced !== undefined) {
    candidates.push(fenced.trim());
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) {
    candidates.push(trimmed.slice(first, last + 1));
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // 다음 후보로 넘어간다. 전부 실패하면 아래에서 던진다.
    }
  }

  throw new Error("모델 응답에서 JSON을 찾지 못했습니다.");
}

export { extractJson, parseCompletion };
export type { Completion, FinishReason };
