import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

const IE_USER_AGENT = "Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko";

function request(path: string, headers: Record<string, string>): NextRequest {
  return new NextRequest(`https://example.test${path}`, { headers });
}

describe("browser support proxy", () => {
  it("IE의 문서 탐색은 이유가 표시된 안내 화면으로 보낸다", () => {
    const response = proxy(
      request("/case/2023da287663", {
        accept: "text/html",
        "sec-fetch-dest": "document",
        "user-agent": IE_USER_AGENT,
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.test/unsupported-browser?reason=legacy",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("IE라도 API와 정적 자원 요청은 막지 않는다", () => {
    const apiResponse = proxy(
      request("/api/law/article", { accept: "application/json", "user-agent": IE_USER_AGENT }),
    );
    const cssResponse = proxy(
      request("/unsupported-browser.css", { accept: "text/css", "user-agent": IE_USER_AGENT }),
    );

    expect(apiResponse.headers.get("x-middleware-next")).toBe("1");
    expect(cssResponse.headers.get("x-middleware-next")).toBe("1");
  });
});
