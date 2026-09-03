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

/** 사전이 찾아 준 법. 이름이 아니라 `lawId`가 진짜 열쇠다. */
interface LawRef {
  readonly lawId: string;
  /** 정식명. 원문에 약칭이 적혀 있어도 이쪽을 화면에 쓴다. */
  readonly name: string;
  /** 원문에 적힌 그대로. 약칭이면 정식명과 다르다. */
  readonly matched: string;
}

/** 우리가 아는 법인가. 부르는 쪽이 `law_version`에서 만들어 넘긴다. */
interface LawNameIndex {
  /** `text`의 `end` 위치에서 끝나는, 우리가 아는 가장 긴 이름·약칭. 없으면 undefined. */
  longestEndingAt(text: string, end: number): LawRef | undefined;
}

interface Citation {
  /** 원문에서의 위치. 하이라이트와 링크를 이 좌표에 건다. */
  readonly start: number;
  readonly end: number;
  /** 원문에 적힌 그대로. 화면에 보여 줄 글자다. */
  readonly text: string;
  /**
   * 가리키는 법. **앞에서 이어받은 것일 수도 있다.**
   * 사전에 없으면 undefined이고, 그때는 링크하지 않는다.
   */
  readonly law: LawRef | undefined;
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

/** 가운뎃점이 여러 종류로 섞여 온다. 코퍼스에도 `·`가 4,405건, `ㆍ`가 4,488건이었다. */
const MIDDLE_DOTS = /[ㆍ・•·]/gu;
const QUOTES = /[「」『』]/gu;
const SPACES = /\s+/gu;

/**
 * 대조용 표기로 고른다.
 *
 * 판결문과 법제처가 같은 법을 다르게 적는다 — 가운뎃점 종류가 다르고, 낫표를 두르고,
 * 띄어쓰기가 다르다. 글자 그대로 맞추면 그 차이 하나에 링크가 끊긴다.
 */
function normalizeLawName(text: string): string {
  return text.replace(QUOTES, "").replace(MIDDLE_DOTS, "·").replace(SPACES, " ").trim();
}

/**
 * 판결문이 쓰지만 법령 목록에는 그 이름으로 없는 것.
 *
 * **손으로 적는 표다.** 자동으로 만들 방법이 없어서, 확실한 것만 적는다.
 * 지금은 하나뿐이다 — 판결문은 `헌법 제21조`라고 쓰는데 법령명은 `대한민국헌법`이고,
 * 공식 약칭이 없다(실측 확인). 한국 판결문에서 `헌법`이 다른 것을 가리키는 경우는 없다.
 */
const ALIASES: Readonly<Record<string, string>> = {
  헌법: "대한민국헌법",
};

interface LawNameSource {
  readonly lawId: string;
  readonly name: string;
  readonly shortName?: string | null;
}

/**
 * 이름·약칭으로 법을 찾는 사전.
 *
 * 세 가지를 지킨다.
 *
 * 1. **가장 긴 것부터 맞춘다.** `도로교통법`과 `도로교통법 시행령`이 둘 다 있을 때 짧은
 *    쪽을 먼저 집으면 시행령 인용이 법률로 간다.
 * 2. **정식명이 약칭을 이긴다.** 어떤 법의 약칭이 다른 법의 정식명과 같은 경우가 842건
 *    있었다(실측). 그때는 정식명 쪽이 맞다.
 * 3. **모호한 것은 버린다.** 한 이름이 두 개 이상의 `lawId`를 가리키면 어느 쪽인지 알 수
 *    없다. 반쯤 맞는 링크보다 링크가 없는 편이 낫다(P6).
 */
function createLawNameIndex(sources: Iterable<LawNameSource>): LawNameIndex {
  /** 표기 → 후보 법. 값이 null이면 "모호해서 버린 이름"이다. */
  const formal = new Map<string, LawRef | null>();
  const short = new Map<string, LawRef | null>();
  let longest = MIN_NAME_LENGTH;

  function add(bucket: Map<string, LawRef | null>, raw: string, lawId: string, name: string) {
    const key = normalizeLawName(raw);
    if (key.length < MIN_NAME_LENGTH || key.length > MAX_NAME_LENGTH) {
      return;
    }
    const existing = bucket.get(key);
    if (existing === undefined) {
      bucket.set(key, { lawId, name, matched: raw });
    } else if (existing !== null && existing.lawId !== lawId) {
      bucket.set(key, null);
    }
    longest = Math.max(longest, key.length);
  }

  for (const source of sources) {
    add(formal, source.name, source.lawId, source.name);
    if (source.shortName !== undefined && source.shortName !== null && source.shortName !== "") {
      add(short, source.shortName, source.lawId, source.name);
    }
  }

  for (const [alias, target] of Object.entries(ALIASES)) {
    const found = formal.get(normalizeLawName(target));
    if (found !== undefined && found !== null) {
      formal.set(normalizeLawName(alias), found);
      longest = Math.max(longest, alias.length);
    }
  }

  return {
    longestEndingAt(text, end) {
      for (let length = Math.min(longest, end); length >= MIN_NAME_LENGTH; length -= 1) {
        const key = normalizeLawName(text.slice(end - length, end));
        // 정식명을 먼저 본다. 없을 때만 약칭을 본다.
        const found = formal.get(key) ?? short.get(key);
        if (found !== undefined && found !== null) {
          return { ...found, matched: text.slice(end - length, end) };
        }
      }
      return;
    },
  };
}

/**
 * `같은 법`, `같은 법 시행령`, `같은 법 시행규칙`.
 *
 * 참조조문이 이 말을 자주 쓴다 — `「도로교통법」 제44조의2, 같은 법 시행령 제10조`.
 * 앞에서 말한 법을 그대로 잇기만 하면 **시행령 인용이 법률로 간다.** 조문 번호는 있는데
 * 다른 법의 조문을 가리키게 되므로, 없는 링크보다 나쁘다 — 그럴듯하게 틀린다.
 */
const SAME_LAW = /같은\s*법(?:\s*(시행령|시행규칙))?\s*$/u;

/**
 * `같은 법 …`이 가리키는 법을 찾는다.
 *
 * 시행령·시행규칙은 **별개의 법령**이고 각자 `lawId`가 있다. 그래서 이어받은 법의 이름에
 * 그 말을 붙여 사전에서 다시 찾는다.
 *
 * `asked`가 중요하다. 글이 `같은 법 시행령`이라고 **명시했는데** 그 시행령을 못 찾았다면,
 * 이어받기로 되돌아가 모법을 가리키면 안 된다 — 조문 번호는 있는데 다른 법의 조문을
 * 가리키게 되고, 그건 링크가 없는 것보다 나쁘다. 그럴듯하게 틀리기 때문이다.
 */
function resolveSameLaw(
  head: string,
  carried: LawRef | undefined,
  index: LawNameIndex,
): { asked: boolean; law: LawRef | undefined } {
  const matched = SAME_LAW.exec(head);
  if (matched === null) {
    return { asked: false, law: undefined };
  }

  const suffix = matched[1];
  if (suffix === undefined) {
    // 그냥 `같은 법`이다. 이어받기와 결과가 같다.
    return { asked: false, law: carried };
  }
  if (carried === undefined) {
    return { asked: true, law: undefined };
  }

  const wanted = `${carried.name} ${suffix}`;
  return { asked: true, law: index.longestEndingAt(wanted, wanted.length) };
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
  let carried: LawRef | undefined;

  CITATION.lastIndex = 0;
  let matched = CITATION.exec(text);
  while (matched !== null) {
    const [whole, articleNo, branchNo, clauseNo, itemNo] = matched;
    const start = matched.index;

    const head = text.slice(0, nameEndBefore(text, start));
    /*
     * `같은 법 시행령`을 먼저 본다. 이름 사전으로 먼저 찾으면 `법`에서 끝나는 다른 법에
     * 걸릴 수 있고, 무엇보다 시행령을 놓친다.
     */
    const sameLaw = resolveSameLaw(head, carried, index);
    const named = sameLaw.law ?? index.longestEndingAt(text, head.length);
    if (named !== undefined) {
      carried = named;
    }
    /*
     * `같은 법 시행령`이라고 적혀 있었는데 그 시행령을 못 찾은 경우다. 이어받기로
     * 되돌아가면 모법을 가리키게 되므로, 이 인용은 모른다고 둔다.
     */
    const law = sameLaw.asked && sameLaw.law === undefined ? undefined : (named ?? carried);

    if (articleNo !== undefined) {
      found.push({
        start,
        end: start + whole.length,
        text: whole,
        law,
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

export { createLawNameIndex, detectCitations, formatCitation, normalizeLawName };
export type { Citation, LawNameIndex, LawNameSource, LawRef };
