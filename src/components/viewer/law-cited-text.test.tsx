import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Citation } from "@/lib/law-citation/detect";
import { LawCitedText } from "./law-cited-text";

const text = "제5조와 모호법 제1조";
const citations: Citation[] = [
  {
    articleNo: "5",
    branchNo: undefined,
    clauseNo: undefined,
    end: 3,
    itemNo: undefined,
    law: { lawId: "law-1", matched: "예시법", name: "예시법" },
    named: false,
    start: 0,
    text: "제5조",
  },
  {
    articleNo: "1",
    branchNo: undefined,
    clauseNo: undefined,
    end: text.length,
    itemNo: undefined,
    law: undefined,
    named: false,
    start: text.lastIndexOf("제1조"),
    text: "제1조",
  },
];

describe("법령 전체 화면 인용", () => {
  it("확정된 조문만 가벼운 링크로 만들고 기준일과 앵커를 유지한다", () => {
    const html = renderToStaticMarkup(
      <LawCitedText at="2020-01-02" citations={citations} level="L4" text={text} />,
    );

    expect(html).toContain("2020-01-02");
    expect(html).toContain("level=L4");
    expect(html).toContain("#조5");
    expect(html.match(/<a /g) ?? []).toHaveLength(1);
    expect(html).toContain("모호법 제1조");
  });
});
