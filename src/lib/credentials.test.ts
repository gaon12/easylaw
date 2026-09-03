import { describe, expect, it } from "vitest";
import {
  normalizeEmail,
  PASSWORD_MIN,
  validateNewCredentials,
  validateNickname,
} from "./credentials";

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

describe("validateNickname", () => {
  it("앞뒤 공백을 털고 받는다", () => {
    const result = validateNickname("  법돌이  ");
    expect(result.ok && result.nickname).toBe("법돌이");
  });

  it("두 글자보다 짧으면 받지 않는다 — 한 글자는 이름으로 읽히지 않는다", () => {
    expect(validateNickname("가")).toEqual({ ok: false, problem: "nickname_too_short" });
    expect(validateNickname("   ")).toEqual({ ok: false, problem: "nickname_required" });
  });

  it("스무 글자를 넘기면 받지 않는다 — 헤더가 무너진다", () => {
    expect(validateNickname("가".repeat(21)).ok).toBe(false);
    expect(validateNickname("가".repeat(20)).ok).toBe(true);
  });

  it("보이지 않는 글자를 막는다", () => {
    /*
     * 화면에 그대로 그려지는 값이다. 제어문자가 섞이면 이름이 이상하게 잘리고,
     * 양방향 제어문자는 글자 순서를 뒤집어 보이게 만드는 데 쓰인다.
     */
    for (const bad of ["법\u0000돌이", "법\u200b돌이", "법\u202e돌이", "법\u2028돌이"]) {
      expect(validateNickname(bad)).toEqual({ ok: false, problem: "nickname_invalid" });
    }
  });

  it("한글·영문·숫자·이모지는 받는다", () => {
    for (const good of ["법돌이", "lawbot", "판례123", "법돌이 2호"]) {
      expect(validateNickname(good).ok).toBe(true);
    }
  });
});
