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
  { id: "g", text: "【원심결정】 대전지법 2013. 1. 23.자 2012라987 결정" },
];

describe("detectHeadings", () => {
  it("표제만 골라 낸다", () => {
    expect(detectHeadings(spans).map((h) => h.label)).toEqual([
      "주문",
      "청구취지및항소취지",
      "이유",
    ]);
  });

  it("표제와 같은 줄의 본문이 어디서 시작하는지 구분한다", () => {
    const source = spans[4]?.text ?? "";
    const heading = detectHeadings([spans[4] as never])[0];

    expect(heading?.label).toBe("이유");
    expect(source.slice(heading?.contentStart).trim()).toBe("1. 제1심판결의 인용");
  });

  it("당사자와 이전 재판 정보는 구간 제목이 아니다", () => {
    expect(isHeading(spans[0]?.text ?? "")).toBe(false);
    expect(isHeading(spans[6]?.text ?? "")).toBe(false);
  });

  it("문장 가운데의 낫표는 표제가 아니다", () => {
    // 본문에서 인용부호로도 쓰인다. 맨 앞에 있을 때만 표제로 본다.
    expect(detectHeadings([spans[5] as never])).toEqual([]);
    expect(isHeading(spans[5]?.text ?? "")).toBe(false);
  });

  it("어느 문장에 걸린 표제인지 들고 간다", () => {
    expect(detectHeadings(spans).map((h) => h.spanId)).toEqual(["b", "d", "e"]);
  });

  /*
   * 앵커는 **순서로** 짓는다. 문장 id(UUID)를 주소에 쓰면 사람이 읽을 수 없고,
   * 판결문을 다시 받아 오면 바뀌어 저장해 둔 링크가 조용히 깨진다.
   */
  it("앵커는 셀 수 있는 이름이다 — 남에게 '이 구간'을 보낼 수 있어야 한다", () => {
    expect(detectHeadings(spans).map((h) => h.id)).toEqual(["s-1", "s-2", "s-3"]);
  });

  it("같은 표제가 두 번 나와도 앵커는 겹치지 않는다", () => {
    const twice = [
      { id: "x", text: "【이    유】" },
      { id: "y", text: "본안에 관한 판단이다." },
      { id: "z", text: "【이    유】" },
    ];

    expect(detectHeadings(twice).map((h) => h.id)).toEqual(["s-1", "s-2"]);
  });
});

describe("tidyHeading", () => {
  it("벌려 쓴 글자를 붙인다", () => {
    // 판결문은 `【주 문】`처럼 글자 사이를 벌려 적는다. 세로쓰기 시절의 관습이다.
    expect(tidyHeading("주    문")).toBe("주문");
    expect(tidyHeading("이 유")).toBe("이유");
  });
});
