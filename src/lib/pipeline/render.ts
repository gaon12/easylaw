/**
 * 레벨 렌더링. `PRODUCT.md` §5.5 [5]
 *
 * 구조 노드를 받아 그 레벨의 문장을 만든다. **원문은 보지 않는다** — 보면 모델이 그쪽을
 * 베끼고, 문장이 어느 노드에서 나왔는지가 흐려져 근거 추적이 끊긴다.
 *
 * 나온 문장은 자기가 파생된 노드를 통해 원문 span을 **상속한다**(§5.5 [5]).
 * 그래서 "이 문장은 원문 어디서 나왔나"에 언제나 답할 수 있다.
 */

import type { LlmClient } from "@/lib/llm/client";
import { hasBlockingIssue, type Level, type LintIssue, lintRendition } from "@/lib/rendition/lint";
import { RENDER_PROMPT_VERSION, renderInstruction } from "./render-prompt";
import { parseRendition } from "./render-schema";
import { normalizeSpanLabel } from "./span-label";

/** [4]가 낸 노드 중 렌더링에 필요한 것만. DB 행이든 방금 뽑은 것이든 이 모양이면 된다. */
interface RenderableNode {
  readonly id: string;
  readonly kind: string;
  readonly payload: unknown;
}

/** 저장소(`saveRendition`)가 받는 모양에 맞춘 결과 문장. */
interface RenderedLine {
  readonly orderIdx: number;
  readonly role: "heading" | "body";
  readonly text: string;
  /** 파생된 구조 노드. 제목은 없을 수 있다. */
  readonly structureNodeId: string | null;
  readonly confidence: "grounded" | "needs_check" | "ungrounded";
}

interface RenderResult {
  readonly level: Level;
  readonly lines: readonly RenderedLine[];
  readonly promptVersion: string;
  readonly model: string;
  /** 규칙 린터가 남긴 것. 막는 문제가 있으면 `blocked`가 true다. */
  readonly issues: readonly LintIssue[];
  readonly blocked: boolean;
  /** 모델이 댔지만 우리 구조에 없던 노드 이름. 세어 둔다. */
  readonly unknownNodeLabels: readonly string[];
  /** 이 단계에서 반드시 설명해야 하지만 모델이 한 번도 쓰지 않은 구조 노드. */
  readonly missingNodeIds: readonly string[];
}

const PARTY_LABELS: Readonly<Record<string, string>> = {
  plaintiff: "원고 측",
  defendant: "피고 측",
  prosecutor: "검사",
  other: "그 밖의 당사자",
};

function payloadRecord(payload: unknown): Readonly<Record<string, unknown>> {
  if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
    return payload as Readonly<Record<string, unknown>>;
  }
  return {};
}

/** 한 노드를 반드시 한 줄로 보낸다. 줄바꿈이 라벨 경계로 오인되지 않게 한다. */
function inlineText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return;
  }
  const text = value.replace(/\s+/gu, " ").trim();
  return text.length > 0 ? text : undefined;
}

function fallbackPayload(payload: unknown): string {
  const serialized = JSON.stringify(payload);
  return serialized === undefined ? String(payload) : serialized;
}

type NodeDescriber = (payload: Readonly<Record<string, unknown>>) => string | undefined;

function describeFact(payload: Readonly<Record<string, unknown>>): string | undefined {
  const text = inlineText(payload.text);
  if (text === undefined) {
    return;
  }
  const date = inlineText(payload.occurred_on);
  return date === undefined ? `사실관계: ${text}` : `사실관계(발생일: ${date}): ${text}`;
}

function describeText(label: string): NodeDescriber {
  return (payload) => {
    const text = inlineText(payload.text);
    return text === undefined ? undefined : `${label}: ${text}`;
  };
}

function describeClaim(payload: Readonly<Record<string, unknown>>): string | undefined {
  const text = inlineText(payload.text);
  if (text === undefined) {
    return;
  }
  const party = inlineText(payload.party);
  const partyLabel = party === undefined ? "주체가 표시되지 않은 당사자" : PARTY_LABELS[party];
  return `${partyLabel ?? `당사자(${party})`}의 주장: ${text}`;
}

function describeCitation(payload: Readonly<Record<string, unknown>>): string | undefined {
  const lawName = inlineText(payload.law_name);
  const article = inlineText(payload.article);
  if (lawName === undefined || article === undefined) {
    return;
  }
  const parts = [lawName, article, inlineText(payload.clause), inlineText(payload.item)];
  return `인용 법령: ${parts.filter((part) => part !== undefined).join(" ")}`;
}

const NODE_DESCRIBERS: Readonly<Record<string, NodeDescriber>> = {
  fact_event: describeFact,
  issue: describeText("사건의 쟁점"),
  claim: describeClaim,
  holding: describeText("법원의 판단과 이유"),
  conclusion: describeText("재판의 결론"),
  citation: describeCitation,
};

/**
 * [4]의 저장 모양(JSON 키)이 아니라, [5]가 뜻을 바로 알아볼 수 있는 한국어 한 줄로 바꾼다.
 * 특히 주장의 주체를 라벨에 넣어 당사자의 말을 법원의 판단으로 잘못 옮길 여지를 줄인다.
 */
function describeNode(node: RenderableNode): string {
  const payload = payloadRecord(node.payload);
  const description = NODE_DESCRIBERS[node.kind]?.(payload);

  // 저장소 경계가 이미 스키마를 검사하지만, 오래된 데이터나 새 종류가 와도 정보를 버리지 않는다.
  return description ?? `기타 구조(${node.kind}): ${fallbackPayload(node.payload)}`;
}

/** 노드에 프롬프트용 이름을 붙인다. `[4]`의 `p0.s3`과 같은 이유로 id를 그대로 쓰지 않는다. */
function labelNodes(nodes: readonly RenderableNode[]): {
  document: string;
  resolve: (label: string) => string | undefined;
} {
  const byLabel = new Map<string, string>();
  const lines: string[] = [];

  for (const [index, node] of nodes.entries()) {
    const label = `n${index}`;
    byLabel.set(label, node.id);
    lines.push(`[${label}] ${describeNode(node)}`);
  }

  return {
    document: lines.join("\n"),
    /*
     * 대괄호를 벗기고 찾는다. 문서에 `[n0] …`이라고 적혀 있으니 모델은 본 대로
     * `[n0]`이라고 답한다 — 추출 단계에서 실제로 그랬다(`normalizeSpanLabel`).
     */
    resolve: (label) => byLabel.get(normalizeSpanLabel(label)),
  };
}

/**
 * 넉넉하게 잡는다. **생각하는 모델은 답을 쓰기 전에 한도를 먼저 쓴다** — GLM-4.7에서
 * 두 문장짜리 답에 943토큰 중 860을 생각에 썼다. 4096으로는 이 단계가 늘 잘렸다.
 * 남는 몫에 값이 붙지는 않는다. 실제로 쓴 만큼만 청구된다.
 */
const MAX_OUTPUT_TOKENS = 16_384;

/**
 * 모델이 답한 문장들을 우리 줄로 옮긴다. **신뢰도를 여기서 정한다.**
 *
 * - 제목은 우리가 정한 섹션 이름이라 근거가 필요 없다 → grounded.
 * - 본문에 노드가 붙었으면 그 노드의 span이 근거다 → grounded.
 * - 본문인데 노드를 못 찾았으면(지어낸 이름) 근거가 없다 → ungrounded.
 *   `ungrounded`는 렌더를 막고 재생성 대상이 된다(§5.5 [7]).
 *
 * 이 값은 **함의 검사([6b]) 전의 잠정치**다. 그 검사가 돌면 `needs_check`로 내려갈 수 있다.
 */
function toLines(
  sentences: readonly { role: "heading" | "body"; text: string; from?: string }[],
  labels: { resolve: (label: string) => string | undefined },
): { lines: RenderedLine[]; unknown: string[] } {
  const unknown: string[] = [];
  const lines: RenderedLine[] = [];

  for (const sentence of sentences) {
    const nodeId = sentence.from === undefined ? undefined : labels.resolve(sentence.from);
    if (sentence.from !== undefined && nodeId === undefined) {
      unknown.push(sentence.from);
    }

    lines.push({
      orderIdx: lines.length,
      role: sentence.role,
      text: sentence.text,
      structureNodeId: nodeId ?? null,
      confidence: sentence.role === "heading" || nodeId !== undefined ? "grounded" : "ungrounded",
    });
  }

  return { lines, unknown };
}

/**
 * 구조에서 그 레벨의 문장을 만든다.
 *
 * 만든 뒤 **바로 규칙 린터를 돌린다**(§5.5 [6](c)). 막는 문제가 있으면 결과에 표시해
 * 올린다 — 재생성할지, 배지를 붙여 보여 줄지, 버릴지는 부르는 쪽이 정한다(§5.5 [7]).
 * 여기서 조용히 고치지 않는다. 고치면 무엇이 문제였는지가 사라진다.
 */
async function renderLevel(
  client: LlmClient,
  level: Level,
  allNodes: readonly RenderableNode[],
  signal?: AbortSignal,
): Promise<RenderResult> {
  /*
   * **인용 법령 노드는 문장으로 만들지 않는다.**
   *
   * 넘겨 줬더니 모델이 "제16조 제6항이 인용되었다", "민법의 조합에 관한 규정이
   * 적용되었다" 같은 문장을 썼다. 읽는 사람에게 아무것도 알려 주지 않는 문장이다 —
   * 그 조문이 **무슨 말을 하는지**는 이미 판단 노드가 담고 있고, 조문 자체는 화면에서
   * 링크와 모달이 맡는다(`citation-dialog`).
   *
   * 노드를 버리는 것이 아니라 **쓰는 자리를 옮기는 것**이다. 저장소에는 그대로 남는다.
   */
  const nodes = allNodes.filter((node) => node.kind !== "citation");
  const labels = labelNodes(nodes);

  const rendition = await client.completeJson(
    {
      instruction: renderInstruction(level),
      documents: [{ name: "판결문 구조", text: labels.document }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    },
    parseRendition,
    signal,
  );

  const { lines, unknown } = toLines(rendition.sentences, labels);

  const issues = lintRendition(level, lines);
  const coveredNodeIds = new Set(
    lines.flatMap((line) => (line.structureNodeId === null ? [] : [line.structureNodeId])),
  );
  const missingNodeIds = nodes
    .filter((node) => !coveredNodeIds.has(node.id))
    .map((node) => node.id);

  return {
    level,
    lines,
    promptVersion: RENDER_PROMPT_VERSION,
    model: client.model,
    issues,
    blocked:
      hasBlockingIssue(issues) ||
      lines.some((line) => line.confidence === "ungrounded") ||
      missingNodeIds.length > 0,
    unknownNodeLabels: unknown,
    missingNodeIds,
  };
}

export { renderLevel };
export type { RenderableNode, RenderedLine, RenderResult };
