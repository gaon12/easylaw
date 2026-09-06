/**
 * 판결문의 표제를 찾는다. `DESIGN.md` §11.5
 *
 * 판결문은 `【주 문】`, `【이 유】`, `【청구취지 및 항소취지】` 같은 표제로 구간이 나뉜다.
 * 우리 문장 분할은 그 표제를 **한 문장으로** 잡아 두는데(줄바꿈이 경계이므로), 그 덕에
 * 표제를 따로 표시하지 않고도 되찾을 수 있다.
 *
 * 이 표제들이 목차의 뼈대다. 판결문은 짧아도 수십 문장이고, 읽는 사람이 찾는 것은
 * 대개 "주문"이나 "이유" 한 구간이다.
 */

/** `【주 문】` 형태. 표제 뒤에 본문이 이어 붙는 경우가 있어(`【이 유】  1. …`) 앞부분만 본다. */
const HEADING = /^\s*【([^】]{1,30})】/u;

/**
 * 목차를 만드는 **구조 표제**만 둔다.
 *
 * 판결문은 당사자·원심·변론종결도 `【…】`로 적는다. 모양만 보고 전부 제목으로 만들면
 * 사건 정보가 목차를 차지하고, 같은 줄의 값까지 굵은 제목이 된다. 실제 코퍼스에 있는
 * 구조 표제와 법원 문서에서 반복되는 표제만 명시적으로 허용한다.
 */
const SECTION_HEADINGS = new Set([
  "주문",
  "이유",
  "인정근거",
  "판시사항",
  "판결요지",
  "청구취지",
  "청구원인",
  "항소취지",
  "항소이유",
  "상고취지",
  "상고이유",
  "재항고이유",
  "반소청구취지",
  "청구취지및항소취지",
  "참조조문",
  "참조판례",
  "판단",
  "결론",
]);

/**
 * 표제 안의 공백을 턴다.
 *
 * 판결문은 `【주 문】`처럼 글자 사이를 벌려 적는다 — 세로쓰기 시절의 관습이다.
 * 목차에 그대로 쓰면 `주 문`이 되어 어색하고, 앵커 id로 쓰면 주소에 공백이 들어간다.
 */
function tidyHeading(raw: string): string {
  return raw.replace(/\s+/gu, "");
}

interface HeadingSpan {
  /** 앵커 id. `s-1`처럼 **순서로** 짓는다 — 아래 `sectionAnchor` 참고. */
  readonly id: string;
  /** 이 표제를 담고 있는 원문 문장의 id. 화면이 그 문장에 앵커를 걸 때 쓴다. */
  readonly spanId: string;
  readonly label: string;
  /** 닫는 `】` 바로 뒤의 위치. 같은 줄에 붙은 본문을 제목과 나눌 때 쓴다. */
  readonly contentStart: number;
}

function parseHeading(text: string): { label: string; contentStart: number } | undefined {
  const matched = HEADING.exec(text);
  const rawLabel = matched?.[1];
  if (matched === null || rawLabel === undefined) {
    return;
  }

  const label = tidyHeading(rawLabel);
  if (!SECTION_HEADINGS.has(label)) {
    return;
  }
  return { label, contentStart: matched[0].length };
}

/**
 * `【원고, 피상고인】 ○○○유동화전문 유한회사 (…)` 처럼 **이름과 값**으로 적힌 줄.
 *
 * 판결문 머리에는 당사자·원심판결·변론종결이 이 꼴로 온다. 구간 표제와 모양이 같아서
 * 한때 둘을 함께 제목으로 만들었는데, 그러면 사건 정보가 목차를 차지하고 같은 줄에 붙은
 * **값까지 굵은 제목**이 됐다. 그래서 되돌려 평문으로 두었더니 이번에는 반대가 됐다 —
 * `【원고, 피상고인】`이 문장 한가운데 글자로 남아, 무엇이 이름이고 무엇이 값인지
 * 화면에서 구분되지 않았다.
 *
 * **셋째 갈래로 둔다.** 목차에는 올리지 않고(구간이 아니다), 이름과 값을 나눠 그린다.
 * 원문 글자는 그대로 두고 화면에서만 나눈다 — 점자와 좌표는 원문을 본다.
 */
function parseFieldLabel(text: string): { label: string; contentStart: number } | undefined {
  const matched = HEADING.exec(text);
  const rawLabel = matched?.[1];
  if (matched === null || rawLabel === undefined) {
    return;
  }

  const label = tidyHeading(rawLabel);
  // 구간 표제는 제목이지 이름표가 아니다.
  if (SECTION_HEADINGS.has(label)) {
    return;
  }

  /*
   * 값이 없으면 이름표가 아니다. `【전 문】`처럼 홀로 선 낫표를 빈 값과 함께 그리면
   * 화면에 이름만 있고 오른쪽이 비어 있는 줄이 남는다 — 그때는 평문이 낫다.
   */
  const value = text.slice(matched[0].length).trim();
  if (value.length === 0) {
    return;
  }

  return { label: tidyLabel(rawLabel), contentStart: matched[0].length };
}

/**
 * 이름표의 공백을 **다듬되 뜻을 지킨다.**
 *
 * 구간 표제는 `【주 문】`처럼 글자 사이만 벌어져 있어 공백을 전부 털면 된다. 이름표는
 * `【원고, 피상고인】`처럼 **쉼표 뒤의 공백이 뜻을 가진다** — 전부 털면 `원고,피상고인`이
 * 되어 읽기 나빠진다. 그래서 연속 공백만 하나로 줄인다.
 */
function tidyLabel(raw: string): string {
  return raw.trim().replace(/\s+/gu, " ");
}

/**
 * 구간 앵커. `s-1`, `s-2` …
 *
 * **span id(UUID)를 주소에 쓰지 않는다.** 두 가지가 나빠서다.
 *
 * 1. 주소가 사람이 읽을 수 없는 것이 된다 — 나무위키의 `#s-2.1`처럼 **셀 수 있는** 이름이
 *    남에게 "이 구간"을 보내는 데 쓰인다.
 * 2. UUID는 판결문을 다시 받아 오면 바뀐다. 그때 누가 저장해 둔 링크가 조용히 깨진다.
 *
 * 표제의 글자로 짓지 않는 이유는 같은 표제가 두 번 나오는 판결문이 있기 때문이다
 * (`【이 유】`가 본안과 반소에 각각 나오는 경우). 순서는 언제나 유일하다.
 */
function sectionAnchor(index: number): string {
  return `s-${index + 1}`;
}

/**
 * 표제인 문장만 골라 낸다.
 *
 * **표제가 아닌 문장은 건드리지 않는다.** 본문 중간에 `【`가 나오는 경우가 있는데
 * (인용부호로 쓰이기도 한다) 문장 **맨 앞**에 있을 때만 표제로 본다.
 */
function detectHeadings(spans: readonly { id: string; text: string }[]): HeadingSpan[] {
  const headings: HeadingSpan[] = [];
  for (const span of spans) {
    const heading = parseHeading(span.text);
    if (heading !== undefined) {
      headings.push({
        id: sectionAnchor(headings.length),
        spanId: span.id,
        label: heading.label,
        contentStart: heading.contentStart,
      });
    }
  }
  return headings;
}

/** 이 문장이 표제인가. 화면이 다르게 그릴지 정하는 데 쓴다. */
function isHeading(text: string): boolean {
  return parseHeading(text) !== undefined;
}

export { detectHeadings, isHeading, parseFieldLabel, sectionAnchor, tidyHeading };
export type { HeadingSpan };
