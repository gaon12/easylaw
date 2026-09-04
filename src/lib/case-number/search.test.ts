import { describe, expect, it } from "vitest";
import { expandCaseChoseongQuery } from "./search";

describe("expandCaseChoseongQuery", () => {
  it("설명어의 초성을 실제 판례·법령 검색어로 바꾼다", () => {
    expect(expandCaseChoseongQuery("ㅅㅇ")).toEqual(["소액"]);
    expect(expandCaseChoseongQuery("ㅎㅅ")).toEqual(["항소", "형사", "회생", "헌사"]);
  });

  it("사건부호와 분야가 함께 걸리면 가까운 후보부터 낸다", () => {
    expect(expandCaseChoseongQuery("ㄱㅅ")).toEqual(["가소", "가사", "가사비송", "가사신청"]);
  });

  it("초성 사이의 공백을 무시한다", () => {
    expect(expandCaseChoseongQuery(" ㅅ ㅇ ")).toEqual(["소액"]);
  });

  it("일반 검색어와 사건번호는 기존 검색 경로에 맡긴다", () => {
    expect(expandCaseChoseongQuery("소액")).toEqual([]);
    expect(expandCaseChoseongQuery("2019도12345")).toEqual([]);
    expect(expandCaseChoseongQuery("civil")).toEqual([]);
  });

  it("너무 넓은 한 글자 초성과 잘못된 상한은 확장하지 않는다", () => {
    expect(expandCaseChoseongQuery("ㅁ")).toEqual([]);
    expect(expandCaseChoseongQuery("ㅅㅇ", 0)).toEqual([]);
  });
});
