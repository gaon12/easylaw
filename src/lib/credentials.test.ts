import { describe, expect, it } from "vitest";
import { normalizeEmail, PASSWORD_MIN, validateNewCredentials } from "./credentials";

describe("normalizeEmail", () => {
  it("소문자로 맞추고 공백을 턴다", () => {
    // A@b.com과 a@b.com으로 각각 가입되면 사용자는 어느 것으로 가입했는지 알 수 없다.
    expect(normalizeEmail("  HONG@Example.COM ")).toBe("hong@example.com");
  });
});

describe("validateNewCredentials", () => {
  it("정상 입력을 통과시킨다", () => {
    const result = validateNewCredentials("Hong@Example.com", "보증금돌려받기2026");
    expect(result).toEqual({
      ok: true,
      credentials: { email: "hong@example.com", password: "보증금돌려받기2026" },
    });
  });

  it("이메일이 없거나 형식이 아니면 거절한다", () => {
    expect(validateNewCredentials("", "보증금돌려받기2026")).toEqual({
      ok: false,
      problem: "email_required",
    });
    expect(validateNewCredentials("hong", "보증금돌려받기2026")).toEqual({
      ok: false,
      problem: "email_invalid",
    });
  });

  it(`비밀번호는 ${PASSWORD_MIN}자 이상이어야 한다`, () => {
    expect(validateNewCredentials("hong@example.com", "가".repeat(PASSWORD_MIN - 1))).toEqual({
      ok: false,
      problem: "password_too_short",
    });
    expect(validateNewCredentials("hong@example.com", "가".repeat(PASSWORD_MIN)).ok).toBe(true);
  });

  it("구성 규칙을 요구하지 않는다 — 길이만 본다", () => {
    // 대문자·특수문자를 강제하면 사람들은 Password1! 같은 예측 가능한 변형을 만든다.
    expect(validateNewCredentials("hong@example.com", "그냥긴한글비밀번호입니다").ok).toBe(true);
  });

  it("아주 흔한 비밀번호를 막는다", () => {
    expect(validateNewCredentials("hong@example.com", "password123")).toEqual({
      ok: false,
      problem: "password_too_common",
    });
    expect(validateNewCredentials("hong@example.com", "PASSWORD123")).toEqual({
      ok: false,
      problem: "password_too_common",
    });
  });

  it("비밀번호에 이메일 앞부분이 들어가면 막는다", () => {
    // 사실상 아이디를 비밀번호로 쓰는 것이다.
    expect(validateNewCredentials("hong@example.com", "hong12345678")).toEqual({
      ok: false,
      problem: "password_contains_email",
    });
  });

  it("아주 긴 비밀번호를 막는다 — 해시 계산으로 서버를 묶어 둘 수 있다", () => {
    expect(validateNewCredentials("hong@example.com", "가".repeat(200))).toEqual({
      ok: false,
      problem: "password_too_long",
    });
  });
});
