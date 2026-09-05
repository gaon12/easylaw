/**
 * 원문 문장에 **모델이 가리킬 이름**을 붙인다. `PRODUCT.md` §5.5 [3]
 *
 * 우리 span id는 UUID다. 그것을 프롬프트에 그대로 넣으면 두 가지가 나빠진다.
 *
 * 1. **토큰이 낭비된다.** 36글자짜리 id가 문장 수만큼 들어가고, 모델이 그것을 다시 적는다.
 * 2. **모델이 틀리게 적는다.** 의미 없는 글자열은 한 글자만 어긋나도 알아볼 수 없고,
 *    그러면 근거 연결이 통째로 끊긴다.
 *
 * 그래서 `p0.s3`처럼 **읽을 수 있고 규칙이 있는 이름**을 쓴다(§5.5 [3]이 정한 형태다).
 * 모델이 `p0.s9`를 지어내도 우리 표에 없으므로 그 자리에서 걸린다 — 알아볼 수 없는
 * UUID 오타와 달리, 틀린 것이 틀린 것으로 드러난다.
 */

interface LabelledSpan {
  readonly id: string;
  readonly paraIdx: number;
  readonly sentIdx: number;
  readonly text: string;
}

/** 앞뒤 대괄호. 안쪽은 건드리지 않는다. */
const BRACKETS = /^\[(.*)\]$/u;

/**
 * 모델이 답한 이름을 우리가 아는 형태로 맞춘다. **가리키는 대상은 바뀌지 않는다.**
 *
 * 문서의 각 줄이 `[p0.s3] 문장`이라, 모델은 본 대로 `[p0.s3]`이라고 답한다(GLM에서 실제로
 * 그랬다). 대괄호는 우리가 줄을 구분하려고 씌운 것이지 이름의 일부가 아니다. 여기서
 * 벗기지 않으면 근거가 전부 "지어낸 이름"으로 분류되고, 근거를 잃은 노드는 통째로 버려져
 * 판결문 한 편에서 아무것도 안 나온다.
 *
 * **여기까지가 관대함의 끝이다.** 벗긴 뒤에도 우리 표에 없는 이름은 없는 것으로 둔다 —
 * 지어낸 근거를 살려 주지 않는다.
 */
function normalizeSpanLabel(raw: string): string {
  return raw.trim().replace(BRACKETS, "$1").trim();
}

/** `p{문단}.s{문장}`. 사람도 읽고 모델도 다시 적을 수 있는 형태다. */
function spanLabel(span: { paraIdx: number; sentIdx: number }): string {
  return `p${span.paraIdx}.s${span.sentIdx}`;
}

interface SpanLabels {
  /** 프롬프트에 넣을 본문. 각 줄이 `[p0.s0] 문장`이다. */
  readonly document: string;
  /** 모델이 답한 이름을 우리 span id로 되돌린다. 모르는 이름이면 undefined. */
  resolve(label: string): string | undefined;
  readonly size: number;
}

/**
 * 문장 목록에 이름을 붙이고, 되돌리는 표를 함께 만든다.
 *
 * 이름이 겹치면 **나중 것을 버린다.** 같은 이름이 둘이면 어느 쪽을 가리키는지 알 수 없고,
 * 그 상태로 근거를 붙이면 반은 엉뚱한 문장을 가리킨다. 조용히 덮어쓰는 것보다
 * 하나만 남기는 편이 낫다 — 적어도 가리키는 대상이 하나로 정해진다.
 */
function labelSpans(spans: readonly LabelledSpan[]): SpanLabels {
  const byLabel = new Map<string, string>();
  const lines: string[] = [];

  for (const span of spans) {
    const label = spanLabel(span);
    if (byLabel.has(label)) {
      continue;
    }
    byLabel.set(label, span.id);
    lines.push(`[${label}] ${span.text}`);
  }

  return {
    document: lines.join("\n"),
    resolve: (label) => byLabel.get(normalizeSpanLabel(label)),
    size: byLabel.size,
  };
}

export { labelSpans, normalizeSpanLabel, spanLabel };
export type { LabelledSpan, SpanLabels };
