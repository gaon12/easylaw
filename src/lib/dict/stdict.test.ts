import { describe, expect, it } from "vitest";
import { parseStdictFile, plainWord } from "./stdict";

/**
 * 시험에 쓰는 모양은 **실제 내려받은 파일에서 그대로 떠 왔다**(2026-08-06 판).
 * 우리가 상상한 모양으로 시험하면, 원본이 그와 다를 때 시험만 통과한다.
 */
const REAL_SHAPE = JSON.stringify({
  channel: {
    total: 2,
    item: [
      {
        target_code: 518401,
        word_info: {
          word: "가족^수당",
          original_language_info: [{ original_language: "家族手當", language_type: "한자" }],
          word_type: "한자어",
          pos_info: [
            {
              pos: "품사 없음",
              comm_pattern_info: [
                {
                  sense_info: [
                    {
                      definition: "가족 수에 따라 주는 수당.",
                      cat_info: [{ cat: "법률" }],
                      type: "일반어",
                      sense_code: 662935,
                    },
                    {
                      definition: "두 번째 뜻.",
                      cat_info: [{ cat: "없음" }],
                      type: "일반어",
                      sense_code: 662936,
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
      {
        target_code: 9,
        word_info: { word: "  ", pos_info: [] },
      },
    ],
  },
});

describe("plainWord", () => {
  /* 원본 부호를 그대로 두면 판결문에 적힌 형태로는 영영 못 찾는다. */
  it("띄어 쓸 자리 표시(^)를 뺀다", () => {
    expect(plainWord("가족^수당")).toBe("가족수당");
  });

  it("접사 경계(-)와 동형어 번호를 뺀다", () => {
    expect(plainWord("-스럽다")).toBe("스럽다");
    expect(plainWord("사과0")).toBe("사과");
  });

  it("글자는 바꾸지 않는다", () => {
    expect(plainWord("과태료")).toBe("과태료");
  });
});

describe("parseStdictFile", () => {
  it("뜻 단위로 편다 — 표제어 단위로 두면 분야별로 고를 수 없다", () => {
    const entries = parseStdictFile(REAL_SHAPE);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.word).toBe("가족수당");
    expect(entries[0]?.wordRaw).toBe("가족^수당");
    expect(entries[0]?.definition).toBe("가족 수에 따라 주는 수당.");
    expect(entries[0]?.senseOrder).toBe(1);
    expect(entries[1]?.senseOrder).toBe(2);
  });

  it("분야를 남긴다 — '기각'의 법률 뜻과 일상 뜻은 다른 말이다", () => {
    const [first, second] = parseStdictFile(REAL_SHAPE);

    expect(first?.category).toBe("법률");
    // `없음`은 분야가 아니다.
    expect(second?.category).toBeUndefined();
  });

  it("한자와 품사를 함께 담는다", () => {
    expect(parseStdictFile(REAL_SHAPE)[0]?.hanja).toBe("家族手當");
    expect(parseStdictFile(REAL_SHAPE)[0]?.pos).toBe("품사 없음");
  });

  it("표제어가 비었으면 버린다", () => {
    expect(parseStdictFile(REAL_SHAPE).some((entry) => entry.word.length === 0)).toBe(false);
  });

  it("id는 원본의 두 코드를 잇는다 — 다시 받아도 같은 id여야 한다", () => {
    expect(parseStdictFile(REAL_SHAPE)[0]?.id).toBe("518401-662935");
  });
});
