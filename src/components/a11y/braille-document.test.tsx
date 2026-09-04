import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { viewer } from "@/lib/strings";
import { BrailleDocument } from "./braille-document";

const baseProps = {
  backHref: "/case/2023다287663?level=L2",
  filename: "2023다287663-L2.txt",
  lines: ["법원은 처분을 취소했습니다."],
  meta: "2023다287663 · 일반인",
} as const;

describe("BrailleDocument", () => {
  it("과거 설명을 점자로 보여 줄 때 만든 시점과 한계를 알린다", () => {
    const outdatedAt = "2026년 9월 4일";
    const html = renderToStaticMarkup(<BrailleDocument {...baseProps} outdatedAt={outdatedAt} />);

    expect(html).toContain(viewer.outdatedHint(outdatedAt));
    expect(html).toContain(viewer.outdatedBody);
  });

  it("현재 설명이면 과거 설명 안내를 보이지 않는다", () => {
    const html = renderToStaticMarkup(<BrailleDocument {...baseProps} outdatedAt={null} />);

    expect(html).not.toContain(viewer.outdatedBody);
  });
});
