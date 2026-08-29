import { describe, expect, it } from "vitest";
import { pickJosa, withJosa } from "./korean";

describe("pickJosa", () => {
  it("받침에 따라 조사를 고른다", () => {
    expect(pickJosa("가합", "은/는")).toBe("은");
    expect(pickJosa("도", "은/는")).toBe("는");
  });

  it("사건번호처럼 숫자로 끝나도 소리대로 고른다", () => {
    // "12345"는 "…오"로 읽혀 받침이 없다.
    expect(pickJosa("2019도12345", "은/는")).toBe("는");
    // "1"은 "일"로 읽혀 받침이 있다. es-hangul만으로는 "1는"이 된다.
    expect(pickJosa("1", "은/는")).toBe("은");
    expect(pickJosa("2020", "은/는")).toBe("은");
    expect(pickJosa("2", "은/는")).toBe("는");
  });

  it("알파벳 이름의 받침을 본다 — 글자 모양이 아니라", () => {
    // L은 "엘"로 읽혀 ㄹ 받침이 있다.
    expect(pickJosa("L", "은/는")).toBe("은");
    expect(pickJosa("PDF", "은/는")).toBe("는");
    expect(pickJosa("EasyLaw", "은/는")).toBe("는");
  });

  it("끝의 문장부호·공백은 건너뛴다", () => {
    // 조사는 부호가 아니라 그 앞의 말소리를 따른다.
    expect(pickJosa("홍길동!", "은/는")).toBe("은");
    expect(pickJosa("2019도12345.", "은/는")).toBe("는");
    expect(pickJosa("판결문 ", "은/는")).toBe("은");
  });

  it("와/과의 순서가 반대인 것을 그대로 처리한다", () => {
    expect(pickJosa("책", "와/과")).toBe("과");
    expect(pickJosa("사과", "와/과")).toBe("와");
  });

  it("으로/로도 받침을 따른다", () => {
    expect(pickJosa("법원", "으로/로")).toBe("으로");
    expect(pickJosa("법", "으로/로")).toBe("으로");
    expect(pickJosa("판사", "으로/로")).toBe("로");
  });

  it("판단할 소리가 없으면 받침 없는 쪽을 고른다", () => {
    // 사용자 입력을 그대로 보여 주는 자리에서 화면이 깨지면 안 된다.
    expect(pickJosa("", "은/는")).toBe("는");
    expect(pickJosa("?!", "이/가")).toBe("가");
    expect(pickJosa("", "와/과")).toBe("와");
  });
});

describe("withJosa", () => {
  it("말과 조사를 붙인다", () => {
    expect(withJosa("판결문", "을/를")).toBe("판결문을");
    expect(withJosa("어린이", "은/는")).toBe("어린이는");
  });
});
