import "server-only";
import { translateToUnicode } from "braillify";

/**
 * 점자 변환. `FEATURES.md` [F-11] 계열 · `PAGES.md` §5
 *
 * **왜 서버에서 하나.** `braillify`는 WebAssembly 묶음이 5.8MB다. 점자를 쓰지 않는
 * 사람에게까지 그것을 내려보낼 이유가 없고, 이 서비스는 외부 요청을 0으로 두는 대신
 * 무거운 것을 서버에 둔다(글꼴을 자체 호스팅한 것과 같은 판단이다).
 * 번들에 말아 넣지 않는 이유는 `next.config.ts`에 적었다.
 *
 * **무엇을 내보내나.** 유니코드 점자(U+2800~)다. 점자정보단말기·점자 프린터로 가는 길이
 * 그것이기 때문이다 — 화면에 그리는 것이 목적이 아니라 **가져갈 수 있는 것**이 목적이다.
 *
 * **우리가 보증하지 못하는 것.** 규정 해석(2024 개정 한국점자규정)은 `braillify`의 것이고
 * 우리는 그것을 검증할 위치에 있지 않다. 그래서 화면에 출처와 한계를 함께 적는다.
 * 마스킹과 같은 태도다 — 도구는 돕는 것이지 보증하는 것이 아니다.
 */

/** 유니코드 점자 칸. 빈 칸(U+2800)까지 포함한다. */
const BRAILLE_BLOCK = /^[⠀-⣿\s]*$/u;

/**
 * 변환기가 모르는 기호를 아는 기호로 바꾼다.
 *
 * **판결문은 이 기호들로 가득하다.** `【주 문】`, `【청구취지】` 같은 표제가 대표적이고,
 * 변환기는 이런 글자를 만나면 그 줄 전체를 실패로 돌려준다(실제로 겪었다 — 우리 코퍼스의
 * 첫 판결문은 16문장 중 6문장이 표제였다).
 *
 * 그래서 **뜻이 같은 아는 기호로 바꾼다.** 지우지 않는다 — `【주 문】`에서 괄호를 지우면
 * 표제인지 본문인지 알 수 없게 된다.
 */
const SYMBOL_MAP: Readonly<Record<string, string>> = {
  "【": "[",
  "】": "]",
  "〔": "[",
  "〕": "]",
  "「": "'",
  "」": "'",
  "『": '"',
  "』": '"',
  "《": "<",
  "》": ">",
  "〈": "<",
  "〉": ">",
  "㈜": "(주)",
  "＊": "*",
  "＋": "+",
  "－": "-",
  "～": "~",
  "―": "-",
  "—": "-",
  "–": "-",
  "‘": "'",
  "’": "'",
  "“": '"',
  "”": '"',
  "…": "...",
  "·": ",",
  "•": ",",
  "○": "O",
  "●": "O",
  "◇": "<>",
  "△": "^",
  "▲": "^",
  "□": "[]",
  "■": "[]",
  "※": "*",
  "→": "->",
  "←": "<-",
};

/** 낱말을 가르는 공백. 최상위에 둔다 — 호출마다 정규식을 다시 만들지 않는다. */
const WHITESPACE = /\s+/u;

const SYMBOLS = new RegExp(`[${Object.keys(SYMBOL_MAP).join("")}]`, "gu");

/** 변환기에 넣기 전에 기호를 정리한다. 글자 수가 바뀔 수 있으므로 좌표에 쓰지 않는다. */
function sanitizeForBraille(text: string): string {
  return text.replace(SYMBOLS, (match) => SYMBOL_MAP[match] ?? match);
}

interface BrailleResult {
  readonly braille: string;
  /** 끝내 바꾸지 못해 뺀 낱말 수. 0이 아니면 화면이 그 사실을 말해야 한다. */
  readonly dropped: number;
}

/**
 * 한 줄을 점자로. **던지지 않는다.**
 *
 * 변환기는 모르는 글자를 만나면 예외를 낸다(그것도 메시지 없이). 판결문 한 줄 때문에
 * 화면 전체가 500이 되면 안 되므로, 실패하면 **낱말 단위로 잘라 되는 것만** 모은다.
 * 뺀 낱말 수를 함께 돌려준다 — 조용히 잃는 것이 가장 나쁘다.
 */
function toBrailleWithNotes(text: string): BrailleResult {
  const clean = sanitizeForBraille(text);
  if (clean.trim().length === 0) {
    return { braille: "", dropped: 0 };
  }

  try {
    return { braille: translateToUnicode(clean), dropped: 0 };
  } catch {
    // 줄 전체가 막혔다. 되는 낱말만 모은다.
  }

  const pieces: string[] = [];
  let dropped = 0;
  for (const word of clean.split(WHITESPACE)) {
    if (word.length === 0) {
      continue;
    }
    try {
      pieces.push(translateToUnicode(word));
    } catch {
      dropped += 1;
    }
  }

  return { braille: pieces.join("⠀"), dropped };
}

/** 한 줄을 점자로. 뺀 낱말이 몇인지는 보지 않는 자리에서 쓴다. */
function toBraille(text: string): string {
  return toBrailleWithNotes(text).braille;
}

/**
 * 문장 목록을 점자 문서로.
 *
 * 문장마다 한 줄로 끊는다. 판결문 한 문단을 한 줄로 이으면 점자 단말기(보통 32~40칸)에서
 * 끝없이 흐르고, 읽는 사람이 지금 어느 문장인지 알 수 없다.
 */
function toBrailleDocument(lines: readonly string[]): string {
  return lines.map((line) => toBraille(line)).join("\n");
}

/** 점자 칸으로만 이루어졌나. 변환이 실제로 일어났는지 확인할 때 쓴다. */
function isBraille(text: string): boolean {
  return text.length > 0 && BRAILLE_BLOCK.test(text);
}

export { isBraille, sanitizeForBraille, toBraille, toBrailleDocument, toBrailleWithNotes };
export type { BrailleResult };
