/**
 * 판결문 구조에서 **풀이가 필요할 만한 낱말**을 뽑는다. [F-29]
 *
 * 형태소 분석기를 두지 않는다. 한국어 조사는 낱말 뒤에 붙으므로("과태료를", "해태하였다는")
 * 사전을 **긴 쪽부터 맞춰 보면** 조사가 저절로 떨어진다 — 사전에 있는 형태가 곧 낱말이다.
 * 분석기를 들이면 의존성·사전·품사 판단이 따라오는데, 우리에게 필요한 것은 "이 글자
 * 뭉치가 우리 사전에 있나"뿐이다.
 *
 * **여기서는 후보만 만든다.** 실제로 사전에 있는지는 부르는 쪽이 본다(`server/glossary.ts`).
 * 이 파일이 DB를 모르게 두는 이유는 시험 때문이다 — 후보를 뽑는 규칙만 따로 검사한다.
 */

/** 한글 덩어리. 조사·어미가 붙은 채로 잘린다. */
const HANGUL_RUN = /[가-힣]+/gu;

/**
 * 너무 짧은 것은 낱말이 아니라 조각이다("의", "및"). 너무 긴 것은 문장이다.
 * 사전 표제어가 대체로 이 사이에 있다.
 */
const MIN_LENGTH = 2;
const MAX_LENGTH = 8;

/**
 * 풀어 줄 필요가 없는 말. **사전에 있어도 뜻을 달지 않는다.**
 *
 * "사건"·"법원"처럼 판결문에 항상 나오면서 누구나 아는 말에 풀이를 달면, 정작 어려운
 * 낱말이 그 사이에 묻힌다. L4는 문장 수가 곧 읽는 부담이라 이 판단이 특히 중요하다.
 */
const TOO_COMMON = new Set([
  "사건",
  "법원",
  "판결",
  "결정",
  "사람",
  "경우",
  "내용",
  "이유",
  "신청",
  "우리",
  "다음",
  "당신",
  "생각",
  "문제",
  "확인",
  "필요",
  "규정",
  "관한",
  "대한",
  "때문",
]);

/**
 * 한 덩어리에서 사전에 물어볼 형태들. **긴 것부터** 준다.
 *
 * `과태료를` → `과태료를`, `과태료`, `과태` 순. 부르는 쪽은 처음 맞는 것에서 멈추면
 * 되고, 그러면 `과태`가 아니라 `과태료`가 잡힌다.
 */
function trimmedForms(run: string): string[] {
  const forms: string[] = [];
  for (let length = Math.min(run.length, MAX_LENGTH); length >= MIN_LENGTH; length -= 1) {
    forms.push(run.slice(0, length));
  }
  return forms;
}

/**
 * 글에서 후보를 뽑는다. **나온 순서를 지킨다** — 앞에 나온 낱말이 대개 더 중요하다.
 *
 * 같은 덩어리는 한 번만 낸다. 부르는 쪽이 사전을 두드리는 횟수가 곧 비용이다.
 */
function candidateTerms(text: string): { run: string; forms: readonly string[] }[] {
  const seen = new Set<string>();
  const candidates: { run: string; forms: readonly string[] }[] = [];

  for (const match of text.matchAll(HANGUL_RUN)) {
    const run = match[0];
    if (run.length < MIN_LENGTH || seen.has(run)) {
      continue;
    }
    seen.add(run);

    const forms = trimmedForms(run).filter((form) => !TOO_COMMON.has(form));
    if (forms.length > 0) {
      candidates.push({ run, forms });
    }
  }

  return candidates;
}

export { candidateTerms, MAX_LENGTH, MIN_LENGTH };
