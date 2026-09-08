/**
 * 사건명을 이름과 쟁점으로 나눈다.
 *
 * 법제처가 주는 사건명은 두 가지가 붙어 있다.
 *
 * ```
 * 부당이득금[선순위 회생담보권자가 후순위 회생담보권자를 상대로 회생계획에서 정한 바에 따라 …]
 * └─ 이름 ─┘└──────────────────────── 쟁점 ────────────────────────┘
 * ```
 *
 * 앞은 소송물의 이름(부당이득금·손해배상(기)·소유권이전등기)이고, 대괄호 안은 대법원이
 * 붙인 **쟁점 한 줄**이다. 둘을 통째로 제목에 쓰면 문서 제목이 200자가 된다 — 390px
 * 화면에서 제목만 열 줄을 차지했고, 오른쪽 정보 틀이 같은 글을 한 번 더 반복했다.
 *
 * **쟁점을 버리지는 않는다.** "이 판결이 무엇을 다뤘나"는 이 화면에 온 사람이 가장 먼저
 * 알고 싶은 것 중 하나다. 제목이 아니라 제목 아래 한 줄로 옮길 뿐이다.
 */

/** `이름[쟁점]` — 대괄호가 **끝까지** 닫혀 있을 때만 쟁점으로 본다. */
const NAME_WITH_ISSUE = /^([^[]+)\[(.+)\]$/su;

interface CaseName {
  /** 소송물의 이름. 언제나 있다 — 나눌 것이 없으면 원래 값 그대로다. */
  readonly name: string;
  /** 대법원이 붙인 쟁점 한 줄. 없으면 undefined. */
  readonly issue: string | undefined;
}

function splitCaseName(raw: string | null | undefined): CaseName | undefined {
  const text = raw?.trim();
  if (text === undefined || text.length === 0) {
    return;
  }

  const matched = NAME_WITH_ISSUE.exec(text);
  const name = matched?.[1]?.trim();
  const issue = matched?.[2]?.trim();

  /*
   * 이름 쪽이 비면(`[…]`로 시작하는 사건명) 나누지 않는다. 빈 제목을 만드느니 긴 제목이 낫다.
   */
  if (name === undefined || name.length === 0 || issue === undefined || issue.length === 0) {
    return { name: text, issue: undefined };
  }

  return { name, issue };
}

export { splitCaseName };
export type { CaseName };
