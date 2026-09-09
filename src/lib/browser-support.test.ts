import { describe, expect, it } from "vitest";
import { browserSupportForUserAgent } from "@/lib/browser-support";
import { browserSupportMajors } from "@/lib/browser-support.generated";

const newest = (versions: readonly number[]) => versions[0] ?? 1;

describe("browserSupportForUserAgent", () => {
  it("Internet Explorer와 EdgeHTML은 버전과 관계없이 막는다", () => {
    expect(
      browserSupportForUserAgent("Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko"),
    ).toMatchObject({ status: "unsupported", family: "ie", reason: "legacy" });
    expect(
      browserSupportForUserAgent("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Edge/18.19041"),
    ).toMatchObject({ status: "unsupported", family: "edgehtml", reason: "legacy" });
  });

  it("Chromium 계열은 UA의 Chrome 메이저 버전을 기준으로 삼는다", () => {
    const current = newest(browserSupportMajors.chrome);
    expect(
      browserSupportForUserAgent(
        `Mozilla/5.0 AppleWebKit/537.36 Chrome/${current}.0 Safari/537.36 Edg/${current}.0`,
      ),
    ).toMatchObject({ status: "supported", family: "edge", major: current });
    expect(
      browserSupportForUserAgent(
        `Mozilla/5.0 AppleWebKit/537.36 Chrome/${current - 3}.0 Safari/537.36`,
      ),
    ).toMatchObject({ status: "unsupported", reason: "outdated" });
  });

  it("Firefox ESR은 최근 정식 버전과 떨어져 있어도 허용한다", () => {
    const esr = Math.min(...browserSupportMajors.firefox);
    expect(browserSupportForUserAgent(`Mozilla/5.0 Firefox/${esr}.0`)).toMatchObject({
      status: "supported",
      family: "firefox",
      major: esr,
    });
  });

  it("Safari와 iOS Safari의 지원 범위를 따로 적용한다", () => {
    const safari = Math.min(...browserSupportMajors.safari);
    const ios = Math.min(...browserSupportMajors.iosSafari);
    expect(
      browserSupportForUserAgent(
        `Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/${safari}.0 Safari/605.1.15`,
      ),
    ).toMatchObject({ status: "supported", family: "safari" });
    expect(
      browserSupportForUserAgent(
        `Mozilla/5.0 (iPhone; CPU iPhone OS ${ios - 1}_7 like Mac OS X) Version/${
          ios - 1
        }.0 Mobile/15E148 Safari/604.1`,
      ),
    ).toMatchObject({ status: "unsupported", family: "ios-safari", reason: "outdated" });
  });

  it("새 메이저 버전과 브라우저가 아닌 호출, 검색봇은 막지 않는다", () => {
    const future = newest(browserSupportMajors.chrome) + 1;
    expect(
      browserSupportForUserAgent(`Mozilla/5.0 AppleWebKit/537.36 Chrome/${future}.0 Safari/537.36`),
    ).toMatchObject({ status: "supported", major: future });
    expect(browserSupportForUserAgent("curl/8.10.0")).toEqual({ status: "unknown" });
    expect(browserSupportForUserAgent("Googlebot/2.1")).toEqual({ status: "unknown" });
  });

  it("Mozilla 호환 문자열만 보내는 미지원 브라우저는 안내 대상으로 삼는다", () => {
    expect(browserSupportForUserAgent("Mozilla/5.0 CustomBrowser/1.0")).toMatchObject({
      status: "unsupported",
      family: "other",
      reason: "unlisted",
    });
  });
});
