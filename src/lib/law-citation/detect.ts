/**
 * 판결문에서 법령 인용을 찾는다. `PRODUCT.md` §5.5 [6a] · [F-30]
 *
 * ## 왜 사전이 필요한가
 *
 * 법 이름에는 **공백이 들어간다.** 실제 판결문에서 이런 것들이 나온다.
 *
 * - `채무자 회생 및 파산에 관한 법률 제193조`
 * - `민사소송법 제202조`
 * - `민법 제105조`
 *
 * "제N조 앞의 한 낱말"을 이름으로 잡으면 첫 번째가 `법률 제193조`가 된다. 어디서부터가
 * 이름인지는 **글만 봐서는 알 수 없다.** 그래서 우리가 이미 갖고 있는 법령 이름 목록
 * (`law_version`의 13,265개)에 대고 **가장 긴 것부터 맞춰 본다.**
 *
 * ## 판결문이 실제로 쓰는 형태
 *
 * | 형태 | 예 |
 * |---|---|
 * | 이름 + 조 | `민법 제105조` |
 * | 낫표 | `「도로교통법」 제3조` |
 * | 가지 조문 | `제4조의2` |
 * | 항·호 | `제243조 제1항 제4호` |
 * | 괄호가 끼어듦 | `채무자 회생 및 파산에 관한 법률(이하 ‘채무자회생법’이라 한다) 제252조` |
 * | 이름 없이 이어짐 | `제251조, 제252조 제1항` ← 앞에서 말한 법을 가리킨다 |
 *
 * 마지막 것이 중요하다. `참조조문`은 `… 법률 제251조, 제252조 제1항` 처럼 이름을 한 번만
 * 쓰고 조문을 나열한다. 이름 없는 인용을 버리면 절반을 놓치고, 아무 법에나 붙이면 틀린
 * 곳으로 링크한다. **바로 앞에서 이름이 나온 법을 잇는다.**
 */

/** 우리가 아는 법 이름인가. 부르는 쪽이 `law_version`에서 만들어 넘긴다. */
interface LawNameIndex {
  /** `text`의 `end` 위치에서 끝나는, 우리가 아는 가장 긴 법 이름. 없으면 undefined. */
  longestEndingAt(text: string, end: number): string | undefined;
}

interface Citation {
  /** 원문에서의 위치. 하이라이트와 링크를 이 좌표에 건다. */
  readonly start: number;
  readonly end: number;
  /** 원문에 적힌 그대로. 화면에 보여 줄 글자다. */
  readonly text: string;
  /**
   * 법 이름. **앞에서 이어받은 것일 수도 있다.**
   * 사전에 없는 이름이면 undefined이고, 그때는 링크하지 않는다.
   */
  readonly lawName: string | undefined;
  /** 이름이 이 인용에 직접 적혀 있었는가. 이어받은 것과 구분해 화면에서 다르게 다룰 수 있다. */
  readonly named: boolean;
  readonly articleNo: string;
  /** `제4조의2`의 `2`. */
  readonly branchNo: string | undefined;
  readonly clauseNo: string | undefined;
  readonly itemNo: string | undefined;
}

/**
 * 조문 표기. `제3조` `제 4 조 의 2` 뒤에 `제1항 제4호`가 붙을 수 있다.
 *
 * 항·호를 같은 정규식에 넣는 이유는 **붙어 있을 때만 그 조문의 것**이기 때문이다.
 * 따로 찾으면 다음 문장의 `제1항`을 앞 조문에 잘못 붙인다.
 */
const CITATION =
  /제\s*(\d+)\s*조(?:\s*의\s*(\d+))?(?:\s*제\s*(\d+)\s*항)?(?:\s*제\s*(\d+)\s*호)?/gu;

/**
 * 이름과 조문 사이에 낄 수 있는 것들.
 *
 * - `(이하 ‘채무자회생법’이라 한다)` 같은 괄호
 * - 낫표 `」`
 * - 공백·쉼표
 *
 * 이것들을 건너뛰고 그 앞에서 이름을 찾는다.
 */
const BETWEEN_NAME_AND_ARTICLE = /(?:\s|」|,|、|\([^()]*\)|（[^（）]*）)*$/u;

/** 법 이름 길이의 상한. 가장 긴 한국 법령명도 이보다 짧다. */
const MAX_NAME_LENGTH = 60;
const MIN_NAME_LENGTH = 2;

/**
 * 이름 목록으로 사전을 만든다.
 *
 * 가장 긴 것부터 맞춘다 — `도로교통법`과 `도로교통법 시행령`이 둘 다 있을 때 짧은 쪽을
 * 먼저 집으면 시행령 인용이 법률로 간다.
 */
function createLawNameIndex(names: Iterable<string>): LawNameIndex {
  const known = new Set<string>();
  let longest = MIN_NAME_LENGTH;
  for (const name of names) {
    const trimmed = name.trim();
    if (trimmed.length >= MIN_NAME_LENGTH) {
      known.add(trimmed);
      longest = Math.max(longest, Math.min(trimmed.length, MAX_NAME_LENGTH));
    }
  }

  return {
    longestEndingAt(text, end) {
      for (let length = Math.min(longest, end); length >= MIN_NAME_LENGTH; length -= 1) {
        const candidate = text.slice(end - length, end);
        if (known.has(candidate)) {
          return candidate;
        }
      }
      return;
    },
  };
}

/** 앞쪽에서 이름이 끝나는 자리를 찾는다. 괄호·낫표·공백을 건너뛴 지점이다. */
function nameEndBefore(text: string, articleStart: number): number {
  const head = text.slice(0, articleStart);
  const skipped = BETWEEN_NAME_AND_ARTICLE.exec(head);
  return articleStart - (skipped?.[0].length ?? 0);
}

/**
 * 본문에서 인용을 모두 찾는다.
 *
 * 이름이 없는 인용은 **바로 앞에서 이름이 나온 법**을 잇는다(`제251조, 제252조 제1항`).
 * 다만 앞에 아무 법도 없었으면 잇지 않는다 — 아무 법에나 붙이는 것보다 모른다고 두는
 * 편이 낫다(P6).
 */
function detectCitations(text: string, index: LawNameIndex): Citation[] {
  const found: Citation[] = [];
  let carriedName: string | undefined;

  CITATION.lastIndex = 0;
  let matched = CITATION.exec(text);
  while (matched !== null) {
    const [whole, articleNo, branchNo, clauseNo, itemNo] = matched;
    const start = matched.index;

    const named = index.longestEndingAt(text, nameEndBefore(text, start));
    if (named !== undefined) {
      carriedName = named;
    }

    if (articleNo !== undefined) {
      found.push({
        start,
        end: start + whole.length,
        text: whole,
        lawName: named ?? carriedName,
        named: named !== undefined,
        articleNo,
        branchNo,
        clauseNo,
        itemNo,
      });
    }
    matched = CITATION.exec(text);
  }

  return found;
}

/** 사람이 읽는 표기로 되돌린다. 링크 제목과 화면 안내에 쓴다. */
function formatCitation(citation: Citation): string {
  const parts = [`제${citation.articleNo}조${citation.branchNo ? `의${citation.branchNo}` : ""}`];
  if (citation.clauseNo !== undefined) {
    parts.push(`제${citation.clauseNo}항`);
  }
  if (citation.itemNo !== undefined) {
    parts.push(`제${citation.itemNo}호`);
  }
  return parts.join(" ");
}

export { createLawNameIndex, detectCitations, formatCitation };
export type { Citation, LawNameIndex };
