/**
 * 한글 조사 처리. `DESIGN.md` §9 (문체)
 *
 * 조사를 문자열에 박아 두면 절반이 틀린다 — `"도"는`은 맞고 `"가합"는`은 틀리다.
 * 받침에 따라 조사를 고르는 일은 [es-hangul](https://github.com/toss/es-hangul)이 이미
 * 정확하게 하므로 그대로 쓴다. 다만 **es-hangul이 다루지 않는 두 가지**를 여기서 채운다.
 *
 * 1. **숫자로 끝나는 말.** 사건번호(`2019도12345`)가 그렇다. 조사는 글자가 아니라 *소리*를
 *    따르므로 `1`은 "일"로 읽혀 받침이 있고(`1은`), `2`는 "이"로 읽혀 받침이 없다(`2는`).
 *    es-hangul은 숫자를 받침 없는 글자로 보아 `1는`을 만든다.
 * 2. **문장부호로 끝나는 말.** 따옴표 안에 넣는 사용자 입력이 그렇다. 조사는 부호가 아니라
 *    그 앞의 말소리를 따른다.
 *
 * 그래서 이 모듈은 **조사만** 돌려주는 `pickJosa`를 기본으로 둔다. 따옴표 밖에 조사를 붙이는
 * `"홍길동"으로` 같은 표기를 만들려면 조사와 말을 따로 다뤄야 하기 때문이다.
 */

import { josa } from "es-hangul";

/** es-hangul이 받는 조사 짝. 직접 나열하지 않고 따라간다 — 라이브러리가 늘리면 같이 늘어난다. */
type JosaOption = Parameters<typeof josa>[1];

/**
 * 숫자의 한글 읽기 중 **마지막 글자**. 받침 판단에는 끝소리만 필요하다.
 * 0은 "영"으로 읽는다 — "공"으로 읽어도 받침(ㅇ)은 같으므로 결과가 달라지지 않는다.
 */
const DIGIT_TAIL: Readonly<Record<string, string>> = {
  "0": "영",
  "1": "일",
  "2": "이",
  "3": "삼",
  "4": "사",
  "5": "오",
  "6": "육",
  "7": "칠",
  "8": "팔",
  "9": "구",
};

/**
 * 알파벳 이름의 **마지막 글자**. `엘(L)`, `엠(M)`, `엔(N)`, `알(R)`처럼 받침이 있는 것이 있어
 * 글자 모양만 보면 틀린다.
 */
const LETTER_TAIL: Readonly<Record<string, string>> = {
  A: "이",
  B: "비",
  C: "시",
  D: "디",
  E: "이",
  F: "프",
  G: "지",
  H: "치",
  I: "이",
  J: "이",
  K: "이",
  L: "엘",
  M: "엠",
  N: "엔",
  O: "오",
  P: "피",
  Q: "큐",
  R: "알",
  S: "스",
  T: "티",
  U: "유",
  V: "이",
  W: "유",
  X: "스",
  Y: "이",
  Z: "지",
};

const HANGUL_SYLLABLE = /[가-힣]/u;
const DIGIT = /\d/u;
const LETTER = /[A-Za-z]/u;

/**
 * 받침 판단에 쓸 **소리 나는 마지막 글자**를 한글 한 글자로 돌려준다.
 * 뒤쪽 문장부호·공백은 소리가 없으므로 건너뛴다. 판단할 것이 없으면 undefined.
 */
function soundingTail(word: string): string | undefined {
  for (let index = word.length - 1; index >= 0; index -= 1) {
    const char = word[index];
    if (char === undefined) {
      continue;
    }
    if (HANGUL_SYLLABLE.test(char)) {
      return char;
    }
    if (DIGIT.test(char)) {
      return DIGIT_TAIL[char];
    }
    if (LETTER.test(char)) {
      return LETTER_TAIL[char.toUpperCase()];
    }
  }
  return;
}

/**
 * 판단할 소리가 없을 때 대신 세워 두는 글자. 받침이 없다.
 *
 * 짝의 두 번째를 잘라 쓰지 않는 이유가 있다 — `와/과`만 나머지와 순서가 반대라
 * (`사과와` / `책과`) 문자열을 자르면 이 하나에서만 틀린다. 규칙은 라이브러리에 맡긴다.
 */
const NO_BATCHIM_SAMPLE = "가";

/**
 * 말에 맞는 조사만 돌려준다.
 *
 * 판단할 소리가 없으면(빈 문자열, 부호만 있는 입력) **받침 없는 쪽**을 고른다.
 * 사용자 입력을 그대로 보여 주는 자리에서 화면이 깨지는 것보다 낫다.
 */
function pickJosa(word: string, option: JosaOption): string {
  return josa.pick(soundingTail(word) ?? NO_BATCHIM_SAMPLE, option);
}

/** 말과 조사를 붙여 돌려준다. 따옴표 같은 것이 끼지 않는 자리에서 쓴다. */
function withJosa(word: string, option: JosaOption): string {
  return word + pickJosa(word, option);
}

export { pickJosa, withJosa };
export type { JosaOption };
