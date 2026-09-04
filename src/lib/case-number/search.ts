import { getChoseong } from "es-hangul";
import { CASE_CODES } from "./codes";

/**
 * 초성 검색 한 번에 넓힐 검색어 수.
 *
 * 짧은 초성은 여러 사건부호와 설명어에 걸릴 수 있다. 후보를 전부 법제처에 보내면 검색 한 번이
 * 수십 번의 외부 요청으로 불어나므로 가장 가까운 후보만 쓴다.
 */
const DEFAULT_EXPANSION_LIMIT = 4;

const CHOSEONG_ONLY = /^[ㄱ-ㅎ\s]+$/u;
const LABEL_WORD = /[가-힣]+/gu;

interface SearchTerm {
  readonly text: string;
  readonly choseong: string;
  readonly order: number;
}

/** `소액사건`처럼 설명에 붙은 일반 접미사는 검색 범위를 넓히기 위해 떼어 낸다. */
function normalizeLabelWord(word: string): string {
  const withoutCase = word.endsWith("사건") ? word.slice(0, -2) : word;
  return withoutCase.length > 0 ? withoutCase : word;
}

function buildSearchTerms(): readonly SearchTerm[] {
  const seen = new Set<string>();
  const terms: SearchTerm[] = [];

  function add(text: string): void {
    if (seen.has(text)) {
      return;
    }
    seen.add(text);
    terms.push({ text, choseong: getChoseong(text), order: terms.length });
  }

  for (const entry of CASE_CODES) {
    add(entry.code);
    for (const match of entry.label.matchAll(LABEL_WORD)) {
      const word = match[0];
      add(normalizeLabelWord(word));
    }
  }

  return terms;
}

const SEARCH_TERMS = buildSearchTerms();

/**
 * 사건부호 표의 초성을 실제 검색어로 넓힌다.
 *
 * `ㅅㅇ` → `소액`, `ㅎㅅ` → `형사`처럼 사람이 키보드에서 초성만 입력해도 법령·판례
 * 내용 검색이 이해할 수 있는 낱말을 만든다. 일반 한글·사건번호·영문 검색어는 빈 배열을
 * 돌려 기존 검색 경로를 그대로 보존한다.
 */
function expandCaseChoseongQuery(
  query: string,
  limit = DEFAULT_EXPANSION_LIMIT,
): readonly string[] {
  const trimmed = query.trim();
  if (!CHOSEONG_ONLY.test(trimmed)) {
    return [];
  }

  const choseong = trimmed.replaceAll(/\s/gu, "");
  if (choseong.length < 2 || limit <= 0) {
    return [];
  }

  return SEARCH_TERMS.filter((term) => term.choseong.startsWith(choseong))
    .sort((left, right) => {
      const leftRemainder = left.choseong.length - choseong.length;
      const rightRemainder = right.choseong.length - choseong.length;
      return leftRemainder - rightRemainder || left.order - right.order;
    })
    .slice(0, limit)
    .map((term) => term.text);
}

export { expandCaseChoseongQuery };
