import { describe, expect, it } from "vitest";
import { GET } from "@/app/unsupported-browser/route";

describe("unsupported browser route", () => {
  it("오래된 브라우저가 실행할 스크립트 없이 426 안내와 공식 링크를 보낸다", async () => {
    const response = GET(new Request("https://example.test/unsupported-browser?reason=legacy"));
    const html = await response.text();

    expect(response.status).toBe(426);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(html).toContain("Internet Explorer와 구형 Microsoft Edge");
    expect(html).toContain("easylaw-guides-v1-compat.png");
    expect(html).toContain("https://www.microsoft.com/edge/download");
    expect(html).not.toContain("<script");
  });
});
