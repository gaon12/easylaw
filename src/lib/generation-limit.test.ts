import { describe, expect, it } from "vitest";
import { checkDocumentLength, GenerationLimiter } from "./generation-limit";

describe("GenerationLimiter", () => {
  it("IP와 세션 상한을 함께 적용하고 거절할 때 몫을 쓰지 않는다", () => {
    const limiter = new GenerationLimiter({ ipLimit: 2, sessionLimit: 3, windowMs: 100 });
    expect(limiter.claim({ ip: "1", session: "a" }, 0).allowed).toBe(true);
    expect(limiter.claim({ ip: "1", session: "b" }, 1).allowed).toBe(true);
    const rejected = limiter.claim({ ip: "1", session: "a" }, 2);
    expect(rejected).toMatchObject({ allowed: false, ipRemaining: 0, sessionRemaining: 2 });
    expect(limiter.claim({ ip: "2", session: "a" }, 3)).toMatchObject({
      allowed: true,
      sessionRemaining: 1,
    });
  });

  it("익명 요청은 IP만 센다", () => {
    const limiter = new GenerationLimiter({ ipLimit: 1, sessionLimit: 1 });
    expect(limiter.claim({ ip: "1" }).allowed).toBe(true);
    expect(limiter.claim({ ip: "1" }).allowed).toBe(false);
  });

  it("창이 끝나면 다시 허용하고 만료 키를 청소한다", () => {
    const limiter = new GenerationLimiter({ ipLimit: 1, sessionLimit: 1, windowMs: 10 });
    expect(limiter.claim({ ip: "1", session: "a" }, 0).allowed).toBe(true);
    limiter.sweep(10);
    expect(limiter.claim({ ip: "1", session: "a" }, 10).allowed).toBe(true);
  });

  it("뒤 단계가 거절하면 예약한 몫을 되돌릴 수 있다", () => {
    const limiter = new GenerationLimiter({ ipLimit: 1, sessionLimit: 1 });
    const identity = { ip: "1", session: "a" };
    expect(limiter.claim(identity).allowed).toBe(true);
    limiter.release(identity);
    expect(limiter.claim(identity).allowed).toBe(true);
  });
});

describe("checkDocumentLength", () => {
  const limits = { confirmAfter: 80_000, maxChars: 150_000 };

  it("보통 문서는 즉시 허용한다", () => {
    expect(checkDocumentLength({ charCount: 80_000, ...limits })).toEqual({
      kind: "ok",
      charCount: 80_000,
    });
  });

  it("긴 문서는 확인받고, 최대 길이를 넘으면 거절한다", () => {
    expect(checkDocumentLength({ charCount: 80_001, ...limits }).kind).toBe("confirm");
    expect(checkDocumentLength({ charCount: 80_001, ...limits, confirmed: true }).kind).toBe("ok");
    expect(checkDocumentLength({ charCount: 150_001, ...limits }).kind).toBe("too_long");
  });
});
