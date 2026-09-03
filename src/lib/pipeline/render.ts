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
    lines.push(`[${label}] ${node.kind}: ${JSON.stringify(node.payload)}`);
  }

  return { document: lines.join("\n"), resolve: (label) => byLabel.get(label.trim()) };
}

const MAX_OUTPUT_TOKENS = 4096;

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
  nodes: readonly RenderableNode[],
  signal?: AbortSignal,
): Promise<RenderResult> {
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

  const unknown: string[] = [];
  const lines: RenderedLine[] = [];

  for (const sentence of rendition.sentences) {
    const nodeId = sentence.from === undefined ? undefined : labels.resolve(sentence.from);
    if (sentence.from !== undefined && nodeId === undefined) {
      unknown.push(sentence.from);
    }

    /*
     * 신뢰도를 여기서 정한다.
     * - 제목은 우리가 정한 섹션 이름이라 근거가 필요 없다 → grounded.
     * - 본문에 노드가 붙었으면 그 노드의 span이 근거다 → grounded.
     * - 본문인데 노드를 못 찾았으면(지어낸 이름) 근거가 없다 → ungrounded.
     *   `ungrounded`는 렌더를 막고 재생성 대상이 된다(§5.5 [7]).
     *
     * 이 값은 **함의 검사([6b]) 전의 잠정치**다. 그 검사가 돌면 `needs_check`로 내려갈 수 있다.
     */
    const confidence =
      sentence.role === "heading" || nodeId !== undefined ? "grounded" : "ungrounded";

    lines.push({
      orderIdx: lines.length,
      role: sentence.role,
      text: sentence.text,
      structureNodeId: nodeId ?? null,
      confidence,
    });
  }

  const issues = lintRendition(level, lines);

  return {
    level,
    lines,
    promptVersion: RENDER_PROMPT_VERSION,
    model: client.model,
    issues,
    blocked: hasBlockingIssue(issues) || lines.some((line) => line.confidence === "ungrounded"),
    unknownNodeLabels: unknown,
  };
}

export { renderLevel };
export type { RenderableNode, RenderedLine, RenderResult };
