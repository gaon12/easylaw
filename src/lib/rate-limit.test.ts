import { describe, expect, it } from "vitest";
import { RateLimiter } from "./rate-limit";

const MINUTE = 60_000;

function limiter() {
  return new RateLimiter({ limit: 3, windowMs: 15 * MINUTE });
}

describe("RateLimiter", () => {
  it("한도까지는 허용한다", () => {
    const rl = limiter();
    for (let i = 0; i < 3; i += 1) {
      expect(rl.allows("a@example.com", 0)).toBe(true);
      rl.fail("a@example.com", 0);
    }
    expect(rl.allows("a@example.com", 0)).toBe(false);
  });

  it("창이 지나면 다시 허용한다", () => {
    const rl = limiter();
    for (let i = 0; i < 3; i += 1) {
      rl.fail("a@example.com", 0);
    }
    expect(rl.allows("a@example.com", 14 * MINUTE)).toBe(false);
    expect(rl.allows("a@example.com", 16 * MINUTE)).toBe(true);
  });

  it("성공하면 기록을 지운다", () => {
    const rl = limiter();
    rl.fail("a@example.com", 0);
    rl.fail("a@example.com", 0);
    rl.succeed("a@example.com");
    expect(rl.allows("a@example.com", 0)).toBe(true);
  });

  it("키마다 따로 센다 — 한 사람이 막혔다고 다른 사람이 막히면 안 된다", () => {
    const rl = limiter();
    for (let i = 0; i < 3; i += 1) {
      rl.fail("a@example.com", 0);
    }
    expect(rl.allows("a@example.com", 0)).toBe(false);
    expect(rl.allows("b@example.com", 0)).toBe(true);
  });

  it("지난 기록을 버린다 — 아무 문자열이나 넣어 메모리를 채울 수 있다", () => {
    const rl = limiter();
    rl.fail("a@example.com", 0);
    rl.sweep(16 * MINUTE);
    // 버려졌으므로 다시 처음부터 센다.
    expect(rl.allows("a@example.com", 16 * MINUTE)).toBe(true);
  });
});
