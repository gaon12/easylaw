/**
 * 구조화 추출. `PRODUCT.md` §5.5 [4]
 *
 * 파이프라인의 [4]다. **원문 → 구조**만 하고 레벨별 문장은 만들지 않는다([5]가 한다).
 * 둘을 나누는 것이 이 설계의 핵심이다 — 원문을 직접 "쉽게 써 줘"라고 시키면 근거 추적이
 * 끊긴다.
 *
 * `server`가 아니라 `lib`에 두는 이유는 **DB도 설정도 만지지 않기 때문**이다. 문장을 받아
 * 노드를 낸다. 그래서 클라이언트를 갈아 끼워 시험할 수 있다(§8 — 실호출 없이).
 */

import type { LlmClient } from "@/lib/llm/client";
import { EXTRACT_INSTRUCTION, PROMPT_VERSION } from "./extract-prompt";
import { type ExtractedNode, parseExtraction } from "./extract-schema";
import { type LabelledSpan, labelSpans } from "./span-label";

/** 저장소가 받는 모양(`StructureNodeInput`)에 맞춘 결과. */
interface StructureNode {
  readonly kind: ExtractedNode["kind"];
  readonly payload: Record<string, unknown>;
  readonly occurredOn: Date | undefined;
  readonly orderIdx: number;
  /** 우리 span id. 모델이 답한 이름은 여기 오기 전에 되돌려진다. */
  readonly spanIds: readonly string[];
}

interface ExtractResult {
  readonly nodes: readonly StructureNode[];
  readonly promptVersion: string;
  readonly model: string;
  /**
   * 모델이 댔지만 우리 문서에 없던 span 이름.
   *
   * **버리되 세어 둔다.** 지어낸 근거가 얼마나 나오는지는 프롬프트가 잘 듣는지를 보는
   * 지표이고, 조용히 버리면 그 신호가 사라진다.
   */
  readonly unknownSpanLabels: readonly string[];
}

/**
 * 노드에서 종류와 근거를 뺀 나머지가 payload다.
 *
 * `kind`는 열로 따로 저장하고 `source_spans`는 `node_span`으로 풀리므로, 둘을 payload에
 * 남겨 두면 같은 사실이 두 곳에 적힌다. 한쪽만 고치는 날이 오면 어느 쪽이 맞는지 알 수 없다.
 */
function toPayload(node: ExtractedNode): Record<string, unknown> {
  const { kind: _kind, source_spans: _spans, ...rest } = node;
  return rest as Record<string, unknown>;
}

function occurredOn(node: ExtractedNode): Date | undefined {
  if (node.kind !== "fact_event" || node.occurred_on === undefined) {
    return;
  }
  const parsed = new Date(`${node.occurred_on}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

/**
 * 문장을 주고 구조를 받는다.
 *
 * **모델이 지어낸 span 이름은 버린다.** 그러고 나서 근거가 하나도 안 남은 노드는 노드째
 * 버린다 — 근거 없는 노드를 통과시키면 그것에서 파생된 문장이 되짚을 원문 없이 태어난다
 * (P2). 저장소도 같은 것을 막지만(`saveStructure`), 여기서 먼저 걸러야 "왜 비었나"를
 * 알 수 있다.
 */
async function extractStructure(
  client: LlmClient,
  spans: readonly LabelledSpan[],
  signal?: AbortSignal,
): Promise<ExtractResult> {
  const labels = labelSpans(spans);

  const extraction = await client.completeJson(
    {
      instruction: EXTRACT_INSTRUCTION,
      documents: [{ name: "판결문", text: labels.document }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    parseExtraction,
    signal,
  );

  const unknown: string[] = [];
  const nodes: StructureNode[] = [];

  for (const node of extraction.nodes) {
    const spanIds: string[] = [];
    for (const label of node.source_spans) {
      const id = labels.resolve(label);
      if (id === undefined) {
        unknown.push(label);
      } else {
        spanIds.push(id);
      }
    }

    if (spanIds.length === 0) {
      // 근거가 전부 지어낸 것이었다. 노드째 버린다.
      continue;
    }

    nodes.push({
      kind: node.kind,
      payload: toPayload(node),
      occurredOn: occurredOn(node),
      orderIdx: nodes.length,
      spanIds,
    });
  }

  return {
    nodes,
    promptVersion: PROMPT_VERSION,
    model: client.model,
    unknownSpanLabels: unknown,
  };
}

/**
 * 판결문 하나의 구조는 길다. 조문이 많은 사건은 노드가 수십 개 나오고, 한도가 모자라면
 * JSON이 잘려 통째로 재시도가 된다(`completeJson`이 `length`를 따로 알린다).
 *
 * 생각하는 모델은 그 위에 한 겹을 더 얹는다 — 답을 쓰기 전에 한도를 먼저 쓴다.
 */
const MAX_OUTPUT_TOKENS = 16_384;

export { extractStructure };
export type { ExtractResult, StructureNode };
