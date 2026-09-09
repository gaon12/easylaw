import { describe, expect, it } from "vitest";
import { errorFingerprint, publicErrorCode } from "./error-code";

describe("공개 오류 번호", () => {
  it("같은 digest를 항상 같은 짧은 Base58 번호로 바꾼다", () => {
    expect(publicErrorCode("1234567890")).toBe(publicErrorCode("1234567890"));
    expect(publicErrorCode("1234567890")).toMatch(
      /^EL-[1-9A-HJ-NP-Za-km-z]{4}-[1-9A-HJ-NP-Za-km-z]{4}$/,
    );
  });

  it("헷갈리는 Base58 제외 문자를 쓰지 않는다", () => {
    const code = publicErrorCode("server-error-digest");
    expect(code).not.toMatch(/[0OIl]/);
  });

  it("서버 digest가 있으면 메시지보다 우선한다", () => {
    const error = Object.assign(new Error("브라우저에는 감춘 메시지"), { digest: "778899" });
    expect(errorFingerprint(error)).toBe("778899");
  });
});
