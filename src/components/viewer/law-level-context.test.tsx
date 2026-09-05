import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Citation } from "@/lib/law-citation/detect";
import { CitedLaws } from "./cited-laws";
import { CitedText } from "./cited-text";

const text = "민법 제105조";
const citation: Citation = {
  articleNo: "105",
  branchNo: undefined,
  clauseNo: undefined,
  end: text.length,
  itemNo: undefined,
  law: { lawId: "법령ID", matched: "민법", name: "민법" },
  named: true,
  start: 0,
  text,
};

describe("법령 원문 읽기 맥락", () => {
  it("쉬운말 원문의 조문 링크는 상세 화면에만 단계를 전달한다", () => {
    const html = renderToStaticMarkup(
      <CitedText
        citations={[citation]}
        decidedAt={new Date("2019-06-01T00:00:00.000Z")}
        level="L4"
        text={text}
      />,
    );

    expect(html).toContain("level=L4");
    expect(html).toContain("2019-06-01");
    expect(html).toContain(encodeURIComponent("법령ID"));
  });

  it("하단 인용 법령도 어린이 단계를 이어 간다", () => {
    const html = renderToStaticMarkup(
      <CitedLaws citations={new Map([["span-1", [citation]]])} decidedAt={null} level="L3" />,
    );

    expect(html).toContain("level=L3");
    expect(html).toContain("제105조");
  });

  it("일반 단계의 법령 주소에는 읽기 맥락을 붙이지 않는다", () => {
    const html = renderToStaticMarkup(
      <CitedText citations={[citation]} decidedAt={null} level="L2" text={text} />,
    );

    expect(html).not.toContain("level=");
  });
});
