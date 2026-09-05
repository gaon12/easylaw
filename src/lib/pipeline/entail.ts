/**
 * 함의 검사. `PRODUCT.md` §5.5 [6](b)
 *
 * "생성한 문장이 근거 span에서 실제로 도출되는가"를 묻는다. 규칙 린터([6c])는 문장의
 * **모양**을 보고, 사실 대조([6a])는 날짜·금액·조문을 **글자**로 맞춰 본다. 그 둘을 다
 * 통과하고도 **근거가 말하지 않은 것을 말하는** 문장이 남는다. 여기가 그것을 잡는 자리다.
 *
 * ## 왜 따로 물어야 하는가
 *
 * §5.5가 못박아 둔 것: **"[6](b)는 [5]와 다른 컨텍스트에서 실행한다 — 검증 모델에
 * '이 문장을 만든 이유'를 함께 주면 자기 확증이 일어난다."**
 *
 * 그래서 이 함수는 **원문 span과 생성 문장만** 준다. 구조 노드도, 레벨도, 어떤 지시로
 * 만들었는지도 주지 않는다. 판정자가 아는 것은 "이 원문"과 "이 문장" 둘뿐이다.
 */

import { z } from "zod";
import type { LlmClient } from "@/lib/llm/client";

/** 판정. `PRODUCT.md` §3.4의 신뢰도 3색과 그대로 맞춘다. */
type Entailment =
  /** 근거에서 나온다. */
  | "entailed"
  /** 근거만으로는 알 수 없다. 틀렸다는 뜻이 아니다 — 배지를 붙여 보여 준다. */
  | "unsupported"
  /** 근거와 어긋난다. 렌더를 막는다. */
  | "contradicted";

interface EntailmentCheck {
  readonly orderIdx: number;
  readonly verdict: Entailment;
  readonly reason: string;
}

/** 판정할 문장 하나와 그 근거. */
interface Claim {
  readonly orderIdx: number;
  readonly text: string;
  /** 이 문장이 매달린 원문 문장들. 노드를 거쳐 상속된 것이다. */
  readonly sources: readonly string[];
}

const ENTAIL_INSTRUCTION = [
  "당신은 사실 확인만 하는 도구입니다. JSON만 출력합니다.",
  "",
  "각 항목에는 **근거**(판결문 원문 문장들)와 **문장**(확인할 문장)이 있습니다.",
  "문장이 근거에서 나오는지만 판정합니다.",
  "",
  "- `entailed` — 근거에 적힌 것으로 그 문장이 성립합니다.",
  "- `unsupported` — 근거만으로는 알 수 없습니다. **틀렸다는 뜻이 아닙니다.**",
  "- `contradicted` — 근거와 어긋납니다.",
  "",
  "## 규칙",
  "",
  "- **근거에 적힌 것만 봅니다.** 일반적인 법 지식으로 판단하지 않습니다.",
  "  법적으로 맞는 말이어도 근거에 없으면 `unsupported`입니다.",
  "- 문장이 근거를 쉬운 말로 바꿔 적은 것이면 `entailed`입니다. 표현이 달라도 됩니다.",
  "- 근거보다 **더 많이** 말하면 `unsupported`입니다. 근거가 말하지 않은 조건·범위·확실성을",
  "  덧붙인 경우가 여기 해당합니다.",
  "- `reason`은 한 문장으로 짧게 적습니다.",
  "",
  "## 출력 형태",
  "",
  '{"checks": [{"index": 0, "verdict": "entailed", "reason": "..."}]}',
].join("\n");

/** 프롬프트 버전. 고치면 올린다. */
const ENTAIL_PROMPT_VERSION = "entail-2026-09-03";

const resultSchema = z.object({
  checks: z
    .array(
      z.object({
        index: z.number().int().min(0),
        verdict: z.enum(["entailed", "unsupported", "contradicted"]),
        reason: z.string().default(""),
      }),
    )
    .min(1),
});

/** 판정할 항목을 프롬프트용 글로 만든다. */
function buildClaimDocument(claims: readonly Claim[]): string {
  return claims
    .map((claim, index) =>
      [
        `### ${index}`,
        "근거:",
        ...claim.sources.map((source) => `- ${source}`),
        `문장: ${claim.text}`,
      ].join("\n"),
    )
    .join("\n\n");
}

/**
 * 넉넉하게 잡는다. 판정할 문장이 수십 개면 답도 그만큼 길어지고, **답 앞에 설명을 길게
 * 적는 모델**은 그 전에 한도를 태운다 — Gemma가 L4에서 실제로 4096에 걸려 잘렸다.
 * 다른 단계(`extract`·`render`)와 같은 값이다. 남는 몫에 값이 붙지는 않는다.
 */
const MAX_OUTPUT_TOKENS = 16_384;

/**
 * 문장들이 근거에서 도출되는지 판정한다.
 *
 * **근거가 없는 문장은 모델에 묻지 않는다.** 물어봤자 판정할 것이 없고, 답은 이미
 * 정해져 있다 — 근거가 없으면 도출될 수 없다. 토큰을 쓰지 않고 `unsupported`로 둔다.
 *
 * **모델이 판정을 빠뜨린 문장도 `unsupported`다.** 빠뜨린 것을 통과로 다루면, 모델이
 * 어려운 문장을 조용히 건너뛰는 것이 곧 통과가 된다.
 */
async function checkEntailment(
  client: LlmClient,
  claims: readonly Claim[],
  signal?: AbortSignal,
): Promise<EntailmentCheck[]> {
  const askable = claims.filter((claim) => claim.sources.length > 0);

  const unanswered = new Map<number, EntailmentCheck>(
    claims.map((claim) => [
      claim.orderIdx,
      {
        orderIdx: claim.orderIdx,
        verdict: "unsupported" as const,
        reason:
          claim.sources.length === 0
            ? "근거로 삼을 원문이 없습니다."
            : "모델이 이 문장을 판정하지 않았습니다.",
      },
    ]),
  );

  if (askable.length === 0) {
    return [...unanswered.values()];
  }

  const answer = await client.completeJson(
    {
      instruction: ENTAIL_INSTRUCTION,
      documents: [{ name: "확인할 문장", text: buildClaimDocument(askable) }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    (value) => resultSchema.parse(value),
    signal,
  );

  for (const check of answer.checks) {
    const claim = askable[check.index];
    if (claim === undefined) {
      // 없는 번호를 답했다. 버린다 — 그 문장은 판정되지 않은 것으로 남는다.
      continue;
    }
    unanswered.set(claim.orderIdx, {
      orderIdx: claim.orderIdx,
      verdict: check.verdict,
      reason: check.reason,
    });
  }

  return [...unanswered.values()].sort((a, b) => a.orderIdx - b.orderIdx);
}

/** 판정을 저장소의 신뢰도 값으로 옮긴다. `PRODUCT.md` §3.4 */
function toConfidence(verdict: Entailment): "grounded" | "needs_check" | "ungrounded" {
  if (verdict === "entailed") {
    return "grounded";
  }
  // 어긋나는 문장은 보여 주지 않는다. 알 수 없는 문장은 배지를 붙여 보여 준다.
  return verdict === "contradicted" ? "ungrounded" : "needs_check";
}

export {
  buildClaimDocument,
  checkEntailment,
  ENTAIL_INSTRUCTION,
  ENTAIL_PROMPT_VERSION,
  toConfidence,
};
export type { Claim, Entailment, EntailmentCheck };
