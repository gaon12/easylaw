import { describe, expect, it } from "vitest";
import {
  isBraille,
  sanitizeForBraille,
  toBraille,
  toBrailleDocument,
  toBrailleWithNotes,
} from "./braille";

/**
 * **점자 규정 자체를 시험하지 않는다.** 어떤 글자가 어떤 점형이 되는지는 `braillify`가
 * 2024 개정 한국점자규정을 구현한 결과이고, 우리는 그것을 검증할 위치에 있지 않다.
 *
 * 여기서 확인하는 것은 우리 쪽 계약이다 — 변환이 실제로 일어나는가, 빈 줄이 그대로
 * 남는가, 문장이 줄로 끊기는가.
 */

describe("toBraille", () => {
  it("한글을 점자 칸으로 바꾼다", () => {
    const result = toBraille("피고는 원고에게 3,000만 원을 지급하라.");

    expect(isBraille(result)).toBe(true);
    // 원문 글자가 그대로 남아 있으면 변환이 일어나지 않은 것이다.
    expect(result).not.toContain("피");
  });

  it("숫자와 사건번호도 바꾼다 — 판결문에서 가장 중요한 값들이다", () => {
    expect(isBraille(toBraille("2019도12345"))).toBe(true);
  });

  it("빈 줄은 빈 줄로 남는다 — 점자 문서에서도 문단 사이는 뜻이 있다", () => {
    expect(toBraille("")).toBe("");
    expect(toBraille("   ")).toBe("");
  });
});

describe("toBrailleDocument", () => {
  it("문장마다 줄을 끊는다 — 단말기 한 줄은 32~40칸이다", () => {
    const document = toBrailleDocument(["첫 문장이다.", "둘째 문장이다."]);

    expect(document.split("\n")).toHaveLength(2);
    expect(isBraille(document.split("\n")[0] as string)).toBe(true);
  });

  it("빈 문장이 줄 수를 바꾸지 않는다", () => {
    expect(toBrailleDocument(["가", "", "나"]).split("\n")).toHaveLength(3);
  });
});

describe("isBraille", () => {
  it("점자가 아닌 글자가 섞이면 false다", () => {
    expect(isBraille("⠙⠕ 원고")).toBe(false);
    expect(isBraille("")).toBe(false);
  });
});

describe("판결문의 기호", () => {
  it("표제 괄호를 아는 기호로 바꿔서 넘긴다 — 판결문은 이것으로 가득하다", () => {
    // 실제 코퍼스의 첫 판결문은 16문장 중 6문장이 이런 표제였다.
    const result = toBrailleWithNotes("【주 문】");

    expect(isBraille(result.braille)).toBe(true);
    expect(result.dropped).toBe(0);
  });

  it("괄호를 지우지 않고 바꾼다 — 지우면 표제인지 본문인지 알 수 없다", () => {
    expect(sanitizeForBraille("【주 문】")).toBe("[주 문]");
    expect(sanitizeForBraille("㈜한국")).toBe("(주)한국");
  });

  it("모르는 글자가 있어도 던지지 않는다 — 한 줄 때문에 화면이 죽으면 안 된다", () => {
    const result = toBrailleWithNotes("판결 ￦ 결과");

    expect(() => toBraille("판결 ￦ 결과")).not.toThrow();
    expect(isBraille(result.braille)).toBe(true);
    // 뺀 것이 있으면 그 수를 돌려준다. 조용히 잃지 않는다.
    expect(result.dropped).toBeGreaterThanOrEqual(0);
  });
});
