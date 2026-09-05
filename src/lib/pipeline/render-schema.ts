/**
 * 레벨 렌더링의 출력 규격. `PRODUCT.md` §5.5 [5]
 *
 * **문장마다 어느 구조 노드에서 나왔는지를 적게 한다.** 이것이 [4] → [5] 분리가
 * 의미를 갖는 지점이다 — 노드는 이미 원문 span에 매여 있으므로, 문장이 노드를 가리키면
 * 원문까지 되짚어진다. 노드를 안 적은 문장은 근거가 없는 문장이고, 근거 없는 문장은
 * 표시하지 않는다(P2).
 */

import { z } from "zod";
import { normalizeSpanLabel } from "./span-label";

/** `n0` 형태. 구조 노드에 붙인 이름이다(`renderable.ts`). */
const NODE_LABEL = /^n\d+$/u;

/** 이름을 가르는 것들. 모델이 `n0, n1`이나 `n0 n1`처럼 붙여 적는다. */
const LABEL_SEPARATORS = /[\s,]+/u;

/**
 * 모델이 답한 `from`을 **노드 하나**로 읽는다.
 *
 * 두 가지를 흘려 준다. 문서 줄이 `[n0] …`이라 **대괄호째** 베껴 오는 것과, 여러 노드를
 * 참고한 문장에 `"n0, n1, n2"`처럼 **여러 이름을 적어 오는** 것이다. 둘 다 Gemma에서
 * 실제로 나왔고, 그때마다 규격 검사에 걸려 **설명 한 편이 통째로** 버려졌다.
 *
 * 첫 이름만 쓴다. `rendition_sentence`는 노드 하나를 가리키게 되어 있고(근거 추적의
 * 출발점은 하나여야 한다), 모델이 댄 이름은 모두 실제 노드다. **고른 것이 맞는지는
 * 여기서 판단하지 않는다** — 문장이 그 노드에서 도출되는지는 사실 대조([6a])가 보고,
 * 아니면 `needs_check`로 표시된다. 여기서 관대해도 그 검사가 느슨해지지 않는다.
 */
function firstNodeLabel(raw: string): string {
  const [first = ""] = normalizeSpanLabel(raw).split(LABEL_SEPARATORS);
  return normalizeSpanLabel(first);
}

/**
 * 문장 하나.
 *
 * `role`을 모델이 정하게 하는 이유는 **필수 섹션 검사가 제목만 본다**는 것이다
 * (`rendition/lint.ts`). 제목을 본문으로 적으면 "다음 절차 섹션이 없습니다"가 되고,
 * 그러면 렌더가 막힌다.
 */
const sentenceSchema = z.object({
  /**
   * `gloss`는 **판결문이 아니라 사전에서 온 문장**이다(낱말 뜻). 근거를 판결문에서 댈 수
   * 없으므로 `from`을 요구하지 않고, 함의 검사도 하지 않는다 — 예전에는 이것도 `body`라
   * 검사가 전부 "확인 필요"로 깎았다. 우리가 시켜서 쓴 문장을 우리가 깎은 셈이다.
   */
  role: z.enum(["heading", "body", "gloss"]),
  text: z.string().min(1),
  /**
   * 이 문장이 나온 구조 노드.
   *
   * **제목에는 없어도 된다.** 제목은 우리가 정한 섹션 이름이지 판결문에서 나온 말이
   * 아니다. 없는 근거를 억지로 적게 하면 아무 노드나 적어 낸다.
   */
  from: z
    .string()
    .transform(firstNodeLabel)
    .refine((label) => NODE_LABEL.test(label), "노드 이름은 n0 형태여야 합니다.")
    .optional(),
});

const renditionSchema = z.object({
  sentences: z.array(sentenceSchema).min(1, "문장이 하나도 없습니다."),
});

type RenderedSentence = z.infer<typeof sentenceSchema>;
type RenderedRendition = z.infer<typeof renditionSchema>;

/** 오류 메시지에 문제 문장을 얼마나 보여 줄까. 다 넣으면 로그가 판결문으로 찬다. */
const SAMPLE_LENGTH = 20;

function parseRendition(value: unknown): RenderedRendition {
  const parsed = renditionSchema.parse(value);

  /*
   * 본문에 근거가 없으면 여기서 막는다. 스키마의 `optional`은 제목을 위한 것이지
   * 본문을 봐주기 위한 것이 아니다 — zod 한 줄로 표현되지 않아 따로 본다.
   */
  const ungrounded = parsed.sentences.filter(
    (sentence) => sentence.role === "body" && sentence.from === undefined,
  );
  if (ungrounded.length > 0) {
    throw new Error(
      `근거 노드가 없는 본문이 ${ungrounded.length}개 있습니다: "${ungrounded[0]?.text.slice(0, SAMPLE_LENGTH)}…"`,
    );
  }

  return parsed;
}

export { NODE_LABEL, parseRendition };
export type { RenderedRendition, RenderedSentence };
