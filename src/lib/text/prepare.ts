/**
 * 올린 문서를 저장 가능한 형태로 다듬는다. `PRODUCT.md` §5.5 [1]~[2]
 *
 * 순서가 중요하다: **줄바꿈 정규화 → 마스킹 → 문장 분할**.
 * 마스킹이 글자 수를 바꾸므로 분할을 먼저 하면 문장 좌표가 통째로 어긋난다.
 *
 * 이 모듈은 저장소도 네트워크도 모른다. 그래야 텍스트 처리만 따로 테스트할 수 있다.
 */

import { type MaskKind, maskPersonalData, summarizeHits } from "./mask";
import { type Segment, segmentJudgment } from "./segment";

/**
 * 너무 짧은 입력은 판결문이 아니다. 실수로 빈 칸이나 한 단어를 낸 경우를 걸러 낸다.
 * 문턱을 높이면 짧은 결정문을 막게 되므로 낮게 둔다.
 */
const MIN_CHARS = 50;

/**
 * 상한. 서버 액션 본문 기본 한도가 1MB이고 한글은 글자당 3바이트라, 여유를 두고 자른다.
 * 실제 판결문은 대개 수만 자다.
 */
const MAX_CHARS = 150_000;

type RejectReason = "empty" | "too_short" | "too_long" | "no_sentences";

interface PreparedDocument {
  /** 마스킹을 마친 본문. 저장·표시되는 것은 이것뿐이다. */
  readonly text: string;
  readonly spans: readonly Segment[];
  /** 종류별로 몇 건을 가렸는지. 가린 내용은 담지 않는다. */
  readonly maskCounts: Readonly<Partial<Record<MaskKind, number>>>;
  readonly charCount: number;
}

type PrepareResult =
  | { readonly ok: true; readonly document: PreparedDocument }
  | { readonly ok: false; readonly reason: RejectReason };

/**
 * 줄바꿈을 LF로 맞추고 보이지 않는 문자를 걷어낸다.
 *
 * 붙여넣기로 들어오는 텍스트에는 CRLF, BOM, 비분리 공백이 섞인다. 그대로 두면
 * 문장 분할 정규식이 어긋나고, 화면에서는 보이지 않는데 좌표만 밀린다.
 */
const BYTE_ORDER_MARK = /^\uFEFF/u;
const CARRIAGE_RETURN = /\r\n?/gu;
/** 눈에 보이지 않는 공백. 비분리 공백(U+00A0)과 폭 없는 공백(U+200B). */
const INVISIBLE_SPACE = /[\u00A0\u200B]/gu;

function normalizeWhitespace(raw: string): string {
  return raw
    .replace(BYTE_ORDER_MARK, "")
    .replace(CARRIAGE_RETURN, "\n")
    .replace(INVISIBLE_SPACE, " ")
    .trim();
}

/**
 * 문서를 마스킹하고 문장으로 나눈다.
 *
 * 실패는 예외가 아니라 값으로 돌려준다 — 왜 거절됐는지를 화면에서 그대로 말해 줘야 한다.
 */
function prepareDocument(raw: string): PrepareResult {
  const normalized = normalizeWhitespace(raw);

  if (normalized.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (normalized.length < MIN_CHARS) {
    return { ok: false, reason: "too_short" };
  }
  if (normalized.length > MAX_CHARS) {
    return { ok: false, reason: "too_long" };
  }

  const masked = maskPersonalData(normalized);
  const spans = segmentJudgment(masked.text);

  if (spans.length === 0) {
    /*
     * 불변식 방어. 지금의 분할기는 공백이 아닌 글자가 하나라도 있으면 문장을 하나 이상
     * 만들므로 여기 걸리지 않는다(그래서 테스트로 재현할 수 없다). 그래도 남겨 둔다 —
     * 분할 규칙이 바뀌었을 때 조용히 빈 문서를 저장하는 것이 이 자리의 실패 모드다.
     */
    return { ok: false, reason: "no_sentences" };
  }

  return {
    ok: true,
    document: {
      text: masked.text,
      spans,
      maskCounts: summarizeHits(masked.hits),
      charCount: masked.text.length,
    },
  };
}

export { MAX_CHARS, MIN_CHARS, prepareDocument };
export type { PrepareResult, PreparedDocument, RejectReason };
