import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { viewer } from "@/lib/strings";
import { RenditionPanel } from "./rendition-panel";

function renderConfidence(
  confidence: "grounded" | "needs_check" | "ungrounded",
  checkReason: string | null,
): string {
  return renderToStaticMarkup(
    <RenditionPanel
      level="L2"
      needsCheckCount={confidence === "needs_check" ? 1 : 0}
      sentences={[
        {
          id: "sentence-1",
          role: "body",
          text: "법원이 이유를 살펴보았습니다.",
          confidence,
          checkReason,
        },
      ]}
    />,
  );
}

describe("확인 필요 안내", () => {
  it("구체적인 검사 이유가 없어도 원문과 대조할 행동을 알려 준다", () => {
    const html = renderConfidence("needs_check", null);

    expect(html).toContain(viewer.confidence.needs_check);
    expect(html).toContain(viewer.needsCheckHint);
  });

  it("검사기가 남긴 구체적인 이유가 있으면 그 이유를 우선한다", () => {
    const reason = "법적 효과가 원문보다 넓게 표현되었어요.";
    const html = renderConfidence("needs_check", reason);

    expect(html).toContain(reason);
    expect(html).not.toContain(viewer.needsCheckHint);
  });

  it("근거가 확인된 문장에는 배지와 안내를 붙이지 않는다", () => {
    const html = renderConfidence("grounded", null);

    expect(html).not.toContain(viewer.confidence.grounded);
    expect(html).not.toContain(viewer.needsCheckHint);
  });
});
