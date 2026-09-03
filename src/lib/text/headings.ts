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
 * 표제 안의 공백을 턴다.
 *
 * 판결문은 `【주 문】`처럼 글자 사이를 벌려 적는다 — 세로쓰기 시절의 관습이다.
 * 목차에 그대로 쓰면 `주 문`이 되어 어색하고, 앵커 id로 쓰면 주소에 공백이 들어간다.
 */
function tidyHeading(raw: string): string {
  return raw.replace(/\s+/gu, "");
}

interface HeadingSpan {
  readonly id: string;
  readonly label: string;
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
    const matched = HEADING.exec(span.text);
    const label = matched?.[1];
    if (label !== undefined) {
      headings.push({ id: span.id, label: tidyHeading(label) });
    }
  }
  return headings;
}

/** 이 문장이 표제인가. 화면이 다르게 그릴지 정하는 데 쓴다. */
function isHeading(text: string): boolean {
  return HEADING.test(text);
}

export { detectHeadings, isHeading, tidyHeading };
export type { HeadingSpan };
