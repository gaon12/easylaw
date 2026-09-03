import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createUser } from "@/db/app/repository";
import type { AppDb } from "@/db/client";
import { createTestAppDb } from "@/db/testing";

/**
 * 세션 쿠키의 `Secure` 판단. `server/request.ts`
 *
 * **이 값이 틀리면 아무 오류 없이 로그인이 풀린다.** http 요청에 `Secure` 쿠키를 심으면
 * 브라우저가 조용히 버리고, 설치 마법사는 빠져나갈 수 없는 고리에 갇힌다. 실제로
 * 일어났던 일이라 회귀 테스트로 박아 둔다 — 눈으로 한 번 확인하고 끝낼 종류가 아니다.
 */

const cookieJar = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
let requestHeaders = new Headers();

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve(cookieJar),
  headers: () => Promise.resolve(requestHeaders),
}));

let db: AppDb;
let close: () => void;

vi.mock("@/db/client", () => ({
  appDb: () => db,
}));

const secureSetting = vi.fn(() => true);

vi.mock("./settings", () => ({
  shouldUseSecureCookies: () => secureSetting(),
}));

/** 모의를 등록한 뒤에 불러와야 한다. */
async function startSessionFor(userId: string): Promise<void> {
  const { startSession } = await import("./owner");
  await startSession(userId);
}

function lastCookieOptions(): { secure: boolean } {
  const call = cookieJar.set.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error("쿠키를 심지 않았습니다.");
  }
  return call[2] as { secure: boolean };
}

/** `createUser`는 이메일이 겹치면 undefined를 낸다. 테스트에서는 겹칠 일이 없다. */
function newAdmin(email: string): string {
  const id = createUser(db, { email, passwordHash: "hash", role: "admin" });
  if (id === undefined) {
    throw new Error(`계정을 만들지 못했습니다 (${email}).`);
  }
  return id;
}

beforeEach(() => {
  const created = createTestAppDb();
  db = created.db;
  close = created.close;
  cookieJar.set.mockClear();
  secureSetting.mockReturnValue(true);
});

afterEach(() => {
  close();
});

describe("startSession의 Secure 플래그", () => {
  it("설정이 켜져 있고 https로 왔으면 붙인다", async () => {
    requestHeaders = new Headers({ "x-forwarded-proto": "https" });
    const userId = newAdmin("a@example.com");

    await startSessionFor(userId);

    expect(lastCookieOptions().secure).toBe(true);
  });

  it("설정이 켜져 있어도 http로 왔으면 붙이지 않는다 — 붙이면 쿠키가 사라진다", async () => {
    requestHeaders = new Headers({ "x-forwarded-proto": "http" });
    const userId = newAdmin("b@example.com");

    await startSessionFor(userId);

    expect(lastCookieOptions().secure).toBe(false);
  });

  it("설정이 꺼져 있으면 https로 와도 붙이지 않는다", async () => {
    secureSetting.mockReturnValue(false);
    requestHeaders = new Headers({ "x-forwarded-proto": "https" });
    const userId = newAdmin("c@example.com");

    await startSessionFor(userId);

    expect(lastCookieOptions().secure).toBe(false);
  });

  it("프로토콜을 알 수 없으면 붙이지 않는다", async () => {
    requestHeaders = new Headers();
    const userId = newAdmin("d@example.com");

    await startSessionFor(userId);

    expect(lastCookieOptions().secure).toBe(false);
  });
});
