import { describe, expect, it } from "vitest";
import { detectHeadings, isHeading, tidyHeading } from "./headings";

/** 예문은 실제 판결문(서울고법 2023나2014894)의 문장을 그대로 가져왔다. */
const spans = [
  { id: "a", text: "【원고, 피항소인】                ○○○유동화전문 유한회사" },
  { id: "b", text: "【주    문】" },
  { id: "c", text: "1. 피고의 항소를 기각한다." },
  { id: "d", text: "【청구취지 및 항소취지】            1. 청구취지" },
  { id: "e", text: "【이    유】            1. 제1심판결의 인용" },
  { id: "f", text: "원고가 주장하는 【특별한 사정】은 인정되지 않는다." },
];

describe("detectHeadings", () => {
  it("표제만 골라 낸다", () => {
    expect(detectHeadings(spans).map((h) => h.label)).toEqual([
      "원고,피항소인",
      "주문",
      "청구취지및항소취지",
      "이유",
    ]);
  });

  it("표제 뒤에 본문이 이어 붙어도 표제만 읽는다", () => {
    // `【이 유】  1. 제1심판결의 인용`처럼 한 줄에 붙어 오는 경우가 흔하다.
    expect(detectHeadings([spans[4] as never])[0]?.label).toBe("이유");
  });

  it("문장 가운데의 낫표는 표제가 아니다", () => {
    // 본문에서 인용부호로도 쓰인다. 맨 앞에 있을 때만 표제로 본다.
    expect(detectHeadings([spans[5] as never])).toEqual([]);
    expect(isHeading(spans[5]?.text ?? "")).toBe(false);
  });

  it("문장 id를 그대로 들고 간다 — 앵커가 그 문장에 걸린다", () => {
    expect(detectHeadings(spans).map((h) => h.id)).toEqual(["a", "b", "d", "e"]);
  });
});

describe("tidyHeading", () => {
  it("벌려 쓴 글자를 붙인다", () => {
    // 판결문은 `【주 문】`처럼 글자 사이를 벌려 적는다. 세로쓰기 시절의 관습이다.
    expect(tidyHeading("주    문")).toBe("주문");
    expect(tidyHeading("이 유")).toBe("이유");
  });
});
