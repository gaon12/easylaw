/**
 * 판결문을 문단·문장으로 쪼개고 원문 위치를 붙인다. `.dev/PRODUCT.md` §5.5 [3]
 *
 * 이 모듈이 만드는 `charStart`/`charEnd`가 **근거 연결의 좌표계**다. 여기가 틀리면
 * "근거 보기"가 엉뚱한 문장을 가리키고, 신뢰도 검사도 같이 무너진다.
 *
 * 한국어 판결문의 함정은 마침표다 — `대법원 2019. 5. 3. 선고 2019도12345 판결`처럼
 * 날짜와 사건 표시에 마침표가 잔뜩 들어간다. 마침표만 보고 자르면 한 문장이 다섯 조각이 된다.
 */

interface Segment {
  readonly paraIdx: number;
  readonly sentIdx: number;
  /** 원문에서의 시작 위치(공백 제외). */
  readonly charStart: number;
  /** 원문에서의 끝 위치(배타적). */
  readonly charEnd: number;
  readonly text: string;
}

/**
 * 문장 경계. 두 가지를 경계로 본다.
 *
 * 1. 한국어 종결어미 뒤의 마침표. 앞이 종결어미라는 조건 덕에 날짜·조문 번호의
 *    마침표(`2019. 5. 3.`, `제32조 제1항`)는 걸리지 않는다.
 * 2. 줄바꿈. 판결문은 `주문`·`이유` 같은 표제와 번호 항목을 각각 한 줄에 둔다.
 *    줄바꿈을 무시하면 표제가 다음 문장에 들러붙는다.
 */
const SENTENCE_BOUNDARY = /(?<=[다요까죠오슴음함네])\.(?=\s|$)|[?!](?=\s|$)|\n/gu;

const NEWLINE = "\n";

/** 문단 구분: 빈 줄. */
const BLANK_LINE = /\n[ \t]*\n\s*/gu;

interface Range {
  start: number;
  end: number;
}

const WHITESPACE = /\s/u;

/** 앞뒤 공백을 뺀 범위. 남는 것이 없으면 undefined. */
function trimRange(source: string, range: Range): Range | undefined {
  let { start, end } = range;
  while (start < end && WHITESPACE.test(source[start] ?? "")) {
    start += 1;
  }
  while (end > start && WHITESPACE.test(source[end - 1] ?? "")) {
    end -= 1;
  }
  return end > start ? { start, end } : undefined;
}

function compact(source: string, ranges: readonly Range[]): Range[] {
  return ranges.map((range) => trimRange(source, range)).filter((range) => range !== undefined);
}

/** 구분자 정규식으로 원문을 잘라 범위 목록을 만든다. 위치를 잃지 않으려고 인덱스로 다룬다. */
function splitParagraphs(source: string, within: Range): Range[] {
  const ranges: Range[] = [];
  let cursor = within.start;

  BLANK_LINE.lastIndex = within.start;
  for (let match = BLANK_LINE.exec(source); match !== null; match = BLANK_LINE.exec(source)) {
    if (match.index >= within.end) {
      break;
    }
    ranges.push({ start: cursor, end: match.index });
    cursor = match.index + match[0].length;
  }
  ranges.push({ start: cursor, end: within.end });

  return compact(source, ranges);
}

/** 문단 안의 문장 범위. 종결부호는 문장에 포함시키고, 줄바꿈은 버린다. */
function splitSentences(source: string, paragraph: Range): Range[] {
  const ranges: Range[] = [];
  let cursor = paragraph.start;

  SENTENCE_BOUNDARY.lastIndex = paragraph.start;
  for (
    let match = SENTENCE_BOUNDARY.exec(source);
    match !== null && match.index < paragraph.end;
    match = SENTENCE_BOUNDARY.exec(source)
  ) {
    const matched = match[0];
    const end = matched === NEWLINE ? match.index : match.index + matched.length;
    ranges.push({ start: cursor, end });
    cursor = match.index + matched.length;
  }
  if (cursor < paragraph.end) {
    ranges.push({ start: cursor, end: paragraph.end });
  }

  return compact(source, ranges);
}

/**
 * 판결문 원문을 문장 단위로 쪼갠다.
 *
 * 반환된 `charStart`/`charEnd`는 **입력 문자열 그대로의 위치**다. 호출하는 쪽은 원문을
 * 손대지 않고 그대로 보관해야 한다 — 정규화한 문자열로 위치를 계산하면 하이라이트가 어긋난다.
 */
function segmentJudgment(source: string): Segment[] {
  const whole = trimRange(source, { start: 0, end: source.length });
  if (whole === undefined) {
    return [];
  }

  const segments: Segment[] = [];
  splitParagraphs(source, whole).forEach((paragraph, paraIdx) => {
    splitSentences(source, paragraph).forEach((sentence, sentIdx) => {
      segments.push({
        paraIdx,
        sentIdx,
        charStart: sentence.start,
        charEnd: sentence.end,
        text: source.slice(sentence.start, sentence.end),
      });
    });
  });

  return segments;
}

export { segmentJudgment };
export type { Segment };
