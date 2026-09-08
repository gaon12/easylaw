import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OriginalPanel } from "./original-panel";

const spans = [
  { id: "root", paraIdx: 0, text: "【이 유】" },
  { id: "root-body", paraIdx: 1, text: "상고이유를 판단한다." },
  { id: "one", paraIdx: 2, text: "1. 사안의 개요" },
  { id: "one-body", paraIdx: 3, text: "다음과 같은 사실을 알 수 있다." },
  { id: "ga-dot", paraIdx: 4, text: "가. 근저당권 취득 등" },
  { id: "ga-dot-body", paraIdx: 5, text: "은행은 근저당권을 취득하였다." },
  { id: "one-paren", paraIdx: 6, text: "1) 첫 번째 부동산" },
  { id: "one-paren-body", paraIdx: 7, text: "토지에 근저당권을 설정하였다." },
  { id: "ga-paren", paraIdx: 8, text: "가) 2006. 6. 27. 설정" },
  { id: "ga-paren-body", paraIdx: 9, text: "채권최고액을 정하였다." },
] as const;

describe("원문 목차 계층 조판", () => {
  it("다음 동급·상위 제목 전까지 본문에 현재 제목 깊이를 유지한다", () => {
    const html = renderToStaticMarkup(<OriginalPanel level="L1" spans={spans} />);
    const depths = [...html.matchAll(/data-outline-depth="(\d)"/gu)].map((match) => match[1]);

    expect(depths).toEqual(["1", "1", "2", "2", "3", "3", "4", "4", "5", "5"]);
  });

  it("근거 강조가 문단 상자 대신 문장 글자에만 붙을 수 있는 요소를 둔다", () => {
    const html = renderToStaticMarkup(<OriginalPanel level="L1" spans={spans} />);

    expect(html).toMatch(/<p[^>]*id="ga-paren-body"[^>]*><span[^>]*>채권최고액을 정하였다/gu);
  });
});
