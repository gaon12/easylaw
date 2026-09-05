/**
 * 구조화 추출의 출력 규격. `PRODUCT.md` §5.5 [4]
 *
 * **모든 노드에 `source_spans`가 필수다.** 이것이 이 단계의 존재 이유다 —
 * 원문을 직접 "쉽게 써 줘"라고 시키면 근거 추적이 끊기고 환각이 섞인다(§5.5). 구조를
 * 먼저 뽑고 그 구조만 보고 문장을 만들면, 모든 생성 문장이 노드를 거쳐 원문으로 되짚어진다.
 *
 * 그래서 스키마가 관대하면 안 된다. `source_spans`를 선택으로 두는 순간 모델은 어려운
 * 노드에서 그것을 빼먹고, 근거 없는 노드가 파이프라인 안쪽으로 들어온다.
 * **여기가 마지막 문지기다.**
 */

import { z } from "zod";
import { normalizeSpanLabel } from "./span-label";

/** 노드 종류. 스키마(`corpus/schema.ts`)의 enum과 같아야 한다. */
const NODE_KINDS = ["fact_event", "issue", "claim", "holding", "conclusion", "citation"] as const;

/** `p0.s3` 형태만 받는다. 모델이 다른 모양을 지어내면 여기서 걸린다. */
const SPAN_LABEL = /^p\d+\.s\d+$/u;

/*
 * 대괄호를 벗기고 나서 본다. 문서에 `[p0.s3]`이라고 적혀 있으니 모델은 그대로 베껴 오고,
 * 그 형태를 여기서 거절하면 판결문 한 편이 통째로 재시도로 간다. **벗기는 것은 표기이지
 * 내용이 아니다** — 어느 문장을 가리키는지는 조금도 달라지지 않는다. 지어낸 이름은
 * 그다음 `resolve`에서 여전히 걸린다.
 */
const spanLabels = z
  .array(
    z
      .string()
      .transform(normalizeSpanLabel)
      .refine((label) => SPAN_LABEL.test(label), "span 이름은 p0.s0 형태여야 합니다."),
  )
  .min(1, "근거 span이 없는 노드는 받지 않습니다.");

/** 사실 이벤트의 날짜. 모르면 비운다 — 지어낸 날짜가 가장 위험하다. */
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "날짜는 YYYY-MM-DD 형태여야 합니다.")
  .optional();

const baseNode = z.object({
  source_spans: spanLabels,
});

/**
 * 종류마다 담는 것이 다르다.
 *
 * `claim`에 누구의 주장인지를 반드시 적게 하는 이유는, 원고 주장과 법원 판단을 섞는 것이
 * 이 제품에서 가장 위험한 오류이기 때문이다(`EASY-READ.md`의 전문가 지적). 화면에서
 * "법원이 이렇게 봤어요"와 "원고는 이렇게 주장했어요"는 완전히 다른 말이다.
 */
const nodeSchema = z.discriminatedUnion("kind", [
  baseNode.extend({
    kind: z.literal("fact_event"),
    text: z.string().min(1),
    occurred_on: isoDate,
  }),
  baseNode.extend({ kind: z.literal("issue"), text: z.string().min(1) }),
  baseNode.extend({
    kind: z.literal("claim"),
    /** 누가 한 주장인가. 이것을 빼먹으면 주장과 판단이 섞인다. */
    party: z.enum(["plaintiff", "defendant", "prosecutor", "other"]),
    text: z.string().min(1),
  }),
  baseNode.extend({ kind: z.literal("holding"), text: z.string().min(1) }),
  baseNode.extend({ kind: z.literal("conclusion"), text: z.string().min(1) }),
  baseNode.extend({
    kind: z.literal("citation"),
    law_name: z.string().min(1),
    article: z.string().min(1),
    clause: z.string().optional(),
    item: z.string().optional(),
  }),
]);

const extractionSchema = z.object({
  nodes: z.array(nodeSchema).min(1, "구조 노드가 하나도 없습니다."),
});

type ExtractedNode = z.infer<typeof nodeSchema>;
type Extraction = z.infer<typeof extractionSchema>;
type NodeKind = (typeof NODE_KINDS)[number];

/**
 * 모델이 답한 JSON을 규격에 맞춰 읽는다. 어긋나면 던진다.
 *
 * `LlmClient.completeJson`이 이 함수를 검증기로 받아, 통과하지 못하면 재시도할 만한
 * 오류로 올린다(§5.5 [7]).
 */
function parseExtraction(value: unknown): Extraction {
  return extractionSchema.parse(value);
}

export { NODE_KINDS, parseExtraction, SPAN_LABEL };
export type { Extraction, ExtractedNode, NodeKind };
