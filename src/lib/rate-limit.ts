/**
 * 시도 횟수 제한. `.dev/CONVENTIONS.md` §7
 *
 * 로그인 창은 비밀번호를 무한정 넣어 볼 수 있는 자리다. scrypt가 한 번에 100ms쯤 걸리므로
 * 속도 자체가 어느 정도 방벽이지만, 그것만 믿으면 흔한 비밀번호는 결국 뚫린다.
 *
 * **한계를 분명히 해 둔다.** 이 구현은 프로세스 메모리에 센다.
 * - 서버를 재시작하면 초기화된다.
 * - 인스턴스를 여러 개 띄우면 각자 따로 센다.
 *
 * 그럼에도 지금 이 형태를 고른 이유는, 자동화된 대량 시도를 막는 데는 이것으로 충분하고
 * 저장소를 하나 더 붙이는 비용이 아직 값하지 않기 때문이다. 여러 인스턴스로 가는 순간
 * 이 모듈만 갈아 끼우면 되도록 인터페이스를 좁게 뒀다.
 */

interface Attempt {
  count: number;
  /** 이 시각이 지나면 기록을 버린다. */
  resetAt: number;
}

interface RateLimitOptions {
  /** 창 안에서 허용할 실패 횟수. */
  readonly limit: number;
  /** 창 길이(밀리초). */
  readonly windowMs: number;
}

/** 실패만 센다. 성공한 로그인은 횟수를 되돌린다. */
class RateLimiter {
  readonly #attempts = new Map<string, Attempt>();
  readonly #limit: number;
  readonly #windowMs: number;

  constructor(options: RateLimitOptions) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
  }

  /** 지금 시도해도 되는가. */
  allows(key: string, now: number = Date.now()): boolean {
    const attempt = this.#attempts.get(key);
    if (attempt === undefined || attempt.resetAt <= now) {
      return true;
    }
    return attempt.count < this.#limit;
  }

  /** 실패를 기록한다. */
  fail(key: string, now: number = Date.now()): void {
    const attempt = this.#attempts.get(key);
    if (attempt === undefined || attempt.resetAt <= now) {
      this.#attempts.set(key, { count: 1, resetAt: now + this.#windowMs });
      return;
    }
    attempt.count += 1;
  }

  /** 성공했다. 기록을 지운다. */
  succeed(key: string): void {
    this.#attempts.delete(key);
  }

  /**
   * 지난 기록을 버린다.
   *
   * 지우지 않으면 시도된 키만큼 Map이 자란다 — 로그인 창은 아무 문자열이나 넣을 수 있어서
   * 이것 자체가 메모리 공격 통로가 된다. 실패를 기록할 때마다 함께 부른다.
   */
  sweep(now: number = Date.now()): void {
    for (const [key, attempt] of this.#attempts) {
      if (attempt.resetAt <= now) {
        this.#attempts.delete(key);
      }
    }
  }
}

export { RateLimiter };
export type { RateLimitOptions };
