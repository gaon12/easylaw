import { describe, expect, it } from "vitest";
import { GET } from "@/app/unsupported-browser/route";

describe("unsupported browser route", () => {
  it("IE에는 실행할 스크립트 없이 다른 브라우저 선택지를 보낸다", async () => {
    const response = GET(
      new Request("https://example.test/unsupported-browser?reason=legacy&family=ie"),
    );
    const html = await response.text();

    expect(response.status).toBe(426);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(html).toContain("Internet Explorer와 구형 Microsoft Edge");
    expect(html).toContain("easylaw-guides-errors-v2-compat.png");
    expect(html).toContain("https://www.microsoft.com/edge/download");
    expect(html).toContain("https://www.google.com/chrome/");
    expect(html).toContain("https://www.mozilla.org/firefox/new/");
    expect(html).not.toContain("https://support.apple.com/102665");
    expect(html).not.toContain("<script");
  });

  it("오래된 Firefox에는 Firefox 최신 버전 링크만 보낸다", async () => {
    const response = GET(
      new Request("https://example.test/unsupported-browser?reason=outdated&family=firefox"),
    );
    const html = await response.text();

    expect(html).toContain("https://www.mozilla.org/firefox/new/");
    expect(html).not.toContain("https://www.google.com/chrome/");
    expect(html).not.toContain("https://www.microsoft.com/edge/download");
  });
});
