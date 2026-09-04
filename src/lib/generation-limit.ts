/**
 * 생성 비용을 요청자 단위로 제한하는 순수한 방어막.
 *
 * 일일 총량은 DB에서 원자적으로 세지만, IP·세션 상한은 이 모듈처럼 별도 계층에
 * 두어야 한다. 나중에 Redis 같은 공유 저장소로 바꾸더라도 호출부가 바뀌지 않도록
 * `claim`과 `remaining`만 노출한다. 현재 구현은 로그인 시도 제한과 같은 프로세스
 * 메모리 정책이다(재시작·다중 인스턴스에서는 저장소를 교체해야 한다).
 */

interface GenerationLimitOptions {
  /** IP 하나가 창 안에서 만들 수 있는 횟수. */
  readonly ipLimit: number;
  /** 세션 하나가 창 안에서 만들 수 있는 횟수. */
  readonly sessionLimit: number;
  /** 기본값은 하루(밀리초). 테스트에서는 짧게 줄인다. */
  readonly windowMs?: number;
}

interface GenerationIdentity {
  /** 프록시가 전달한 값을 무검증으로 쓰지 말고, 신뢰하는 요청 어댑터가 정한다. */
  readonly ip: string;
  /** 로그인 세션 해시 등. 익명 요청이면 생략한다. */
  readonly session?: string;
}

interface GenerationLimitStatus {
  readonly allowed: boolean;
  readonly ipRemaining: number;
  readonly sessionRemaining: number | null;
}

interface Counter {
  count: number;
  resetAt: number;
}

const DAY_MS = 86_400_000;

function validLimit(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

/** IP·세션 둘 중 하나라도 넘으면 생성 몫을 소비하지 않는다. */
class GenerationLimiter {
  readonly #ip = new Map<string, Counter>();
  readonly #session = new Map<string, Counter>();
  readonly #ipLimit: number;
  readonly #sessionLimit: number;
  readonly #windowMs: number;

  constructor(options: GenerationLimitOptions) {
    if (!(validLimit(options.ipLimit) && validLimit(options.sessionLimit))) {
      throw new RangeError("생성 상한은 양의 정수여야 합니다.");
    }
    const windowMs = options.windowMs ?? DAY_MS;
    if (!Number.isInteger(windowMs) || windowMs <= 0) {
      throw new RangeError("생성 상한 창은 양의 정수 밀리초여야 합니다.");
    }
    this.#ipLimit = options.ipLimit;
    this.#sessionLimit = options.sessionLimit;
    this.#windowMs = windowMs;
  }

  /** 이번 요청이 허용되는지 확인하고, 허용되면 두 카운터를 함께 올린다. */
  claim(identity: GenerationIdentity, now: number = Date.now()): GenerationLimitStatus {
    const ip = this.#read(this.#ip, identity.ip, now);
    const session =
      identity.session === undefined ? undefined : this.#read(this.#session, identity.session, now);
    const ipRemaining = Math.max(0, this.#ipLimit - ip.count);
    const sessionRemaining =
      session === undefined ? null : Math.max(0, this.#sessionLimit - session.count);

    if (ipRemaining === 0 || sessionRemaining === 0) {
      return { allowed: false, ipRemaining, sessionRemaining };
    }

    ip.count += 1;
    if (session !== undefined) {
      session.count += 1;
    }
    return {
      allowed: true,
      ipRemaining: ipRemaining - 1,
      sessionRemaining: sessionRemaining === null ? null : sessionRemaining - 1,
    };
  }

  /** 뒤 단계(예: 일일 DB 상한)가 요청을 거절했을 때 방금 예약한 몫을 되돌린다. */
  release(identity: GenerationIdentity, now: number = Date.now()): void {
    const ip = this.#ip.get(identity.ip);
    if (ip !== undefined && ip.resetAt > now && ip.count > 0) {
      ip.count -= 1;
    }
    if (identity.session !== undefined) {
      const session = this.#session.get(identity.session);
      if (session !== undefined && session.resetAt > now && session.count > 0) {
        session.count -= 1;
      }
    }
  }

  /** 만료된 키를 버려 메모리가 요청자 수만큼 계속 커지지 않게 한다. */
  sweep(now: number = Date.now()): void {
    for (const [key, counter] of this.#ip) {
      if (counter.resetAt <= now) {
        this.#ip.delete(key);
      }
    }
    for (const [key, counter] of this.#session) {
      if (counter.resetAt <= now) {
        this.#session.delete(key);
      }
    }
  }

  #read(map: Map<string, Counter>, key: string, now: number): Counter {
    const existing = map.get(key);
    if (existing !== undefined && existing.resetAt > now) {
      return existing;
    }
    const fresh = { count: 0, resetAt: now + this.#windowMs };
    map.set(key, fresh);
    return fresh;
  }
}

/** 긴 문서는 토큰 비용이 급증하므로 명시적 확인 전에는 생성하지 않는다. */
type DocumentLengthResult =
  | { readonly kind: "ok"; readonly charCount: number }
  | { readonly kind: "confirm"; readonly charCount: number; readonly maxChars: number }
  | { readonly kind: "too_long"; readonly charCount: number; readonly maxChars: number };

function checkDocumentLength(input: {
  readonly charCount: number;
  readonly confirmAfter: number;
  readonly maxChars: number;
  readonly confirmed?: boolean;
}): DocumentLengthResult {
  const { charCount, confirmAfter, maxChars, confirmed = false } = input;
  if (!Number.isInteger(charCount) || charCount < 0) {
    return { kind: "too_long", charCount, maxChars };
  }
  if (!(validLimit(confirmAfter) && validLimit(maxChars)) || confirmAfter > maxChars) {
    throw new RangeError("문서 길이 설정이 올바르지 않습니다.");
  }
  if (charCount > maxChars) {
    return { kind: "too_long", charCount, maxChars };
  }
  if (charCount > confirmAfter && !confirmed) {
    return { kind: "confirm", charCount, maxChars };
  }
  return { kind: "ok", charCount };
}

export { DAY_MS, GenerationLimiter, checkDocumentLength };
export type {
  DocumentLengthResult,
  GenerationIdentity,
  GenerationLimitOptions,
  GenerationLimitStatus,
};
