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
  /**
   * 그중 **생각하는 데** 쓴 몫.
   *
   * 생각하는 모델(GLM-4.7, o-시리즈…)은 답을 쓰기 전에 출력 한도를 먼저 갉아먹는다.
   * 한도에 걸려 잘렸을 때 이 숫자가 없으면 "한도를 올려라"밖에 말할 수 없는데,
   * 실제로는 **한도가 아니라 모델이 문제**인 경우가 많다. 구분해서 말하려고 읽는다.
   */
  readonly reasoningTokens: number | undefined;
}

const usageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    completion_tokens_details: z
      .object({ reasoning_tokens: z.number().optional() })
      .loose()
      .optional(),
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
    reasoningTokens: parsed.usage?.completion_tokens_details?.reasoning_tokens,
  };
}

/** ```json … ``` 울타리. 달라고 하지 않아도 씌워서 주는 모델이 많다. */
const CODE_FENCE = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/u;

/**
 * 글 안에서 **중괄호가 맞아떨어지는 덩어리**를 전부 찾는다. 문자열 안의 중괄호는 세지
 * 않는다 — 판결문 인용에 `{`가 섞여 들어오면 엉뚱한 자리에서 끊긴다.
 *
 * 예전에는 첫 `{`부터 마지막 `}`까지 한 번에 잘랐다. 그러면 모델이 **답을 두 번 쓴**
 * 경우에 두 덩어리를 통째로 삼켜 아무것도 파싱되지 않는다. Gemma가 실제로 그랬다 —
 * 초안 JSON을 쓰고, 그것을 스스로 점검하는 글을 쓰고, 고친 JSON을 다시 썼다.
 */
interface ScanState {
  depth: number;
  start: number;
  inString: boolean;
  escaped: boolean;
}

/** 문자열 안이다. 여기서는 중괄호를 세지 않는다. 끝났으면 그렇다고 알린다. */
function stepInString(state: ScanState, char: string | undefined): void {
  if (state.escaped) {
    state.escaped = false;
  } else if (char === "\\") {
    state.escaped = true;
  } else if (char === '"') {
    state.inString = false;
  }
}

/**
 * 문자열 밖이다. 중괄호를 세고, 하나가 닫혀 완성됐으면 그 자리를 돌려준다.
 * `undefined`는 "아직 덩어리가 끝나지 않았다"는 뜻이다.
 */
function stepOutsideString(state: ScanState, char: string | undefined, index: number): number {
  if (char === '"') {
    state.inString = true;
    return -1;
  }

  if (char === "{") {
    if (state.depth === 0) {
      state.start = index;
    }
    state.depth += 1;
    return -1;
  }

  if (char !== "}" || state.depth === 0) {
    return -1;
  }

  state.depth -= 1;
  return state.depth === 0 ? state.start : -1;
}

function braceRegions(text: string): string[] {
  const regions: string[] = [];
  const state: ScanState = { depth: 0, start: -1, inString: false, escaped: false };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (state.inString) {
      stepInString(state, char);
      continue;
    }

    const closed = stepOutsideString(state, char, index);
    if (closed !== -1) {
      regions.push(text.slice(closed, index + 1));
    }
  }

  return regions;
}

/**
 * 모델이 뱉은 텍스트에서 JSON일 법한 것을 **전부** 꺼낸다. 그럴듯한 순서로 준다.
 *
 * `response_format`을 줘도 순수 JSON만 오지는 않는다. 코드 울타리를 씌우거나, 머리말을
 * 붙이거나, 생각을 적은 뒤에 답을 쓰거나, **답을 쓰고 고쳐서 다시 쓴다.**
 *
 * 그래서 **나중에 쓴 것을 먼저** 준다. 모델이 두 번 썼다면 뒤엣것이 고친 것이다.
 *
 * 여기서 고른 조각은 **반드시 zod 스키마를 다시 통과해야** 쓰이므로(`completeJson`이
 * 후보를 차례로 검증한다), 잘못 고른 조각은 다음 단계에서 걸린다. 이 함수는 관대해도
 * 되고 스키마는 그러면 안 된다.
 */
function jsonCandidates(text: string): unknown[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error("모델이 빈 응답을 보냈습니다.");
  }

  const sources = [trimmed];

  const fenced = CODE_FENCE.exec(trimmed)?.[1];
  if (fenced !== undefined) {
    sources.push(fenced.trim());
  }

  sources.push(...braceRegions(trimmed).reverse());

  const parsed: unknown[] = [];
  const seen = new Set<string>();
  for (const source of sources) {
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    try {
      parsed.push(JSON.parse(source) as unknown);
    } catch {
      // 다음 후보로 넘어간다. 하나도 못 읽으면 부르는 쪽이 빈 목록을 본다.
    }
  }

  return parsed;
}

/** 후보 중 첫 번째. 읽을 것이 하나도 없으면 던진다. */
function extractJson(text: string): unknown {
  const candidates = jsonCandidates(text);
  if (candidates.length === 0) {
    throw new Error("모델 응답에서 JSON을 찾지 못했습니다.");
  }
  return candidates[0];
}

export { extractJson, jsonCandidates, parseCompletion };
export type { Completion, FinishReason };
