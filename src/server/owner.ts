import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  createAnonymousUser,
  createSession,
  deleteExpiredSessions,
  deleteSession,
  findLiveSession,
  findUserById,
  touchSession,
  touchUser,
} from "@/db/app/repository";
import { appDb } from "@/db/client";
import { isProduction } from "@/lib/env";

/**
 * 세션과 문서 소유권. `PRODUCT.md` §6.3
 *
 * 브라우저에는 **무작위 토큰**을 쿠키로 주고, 서버에는 그 토큰의 SHA-256만 저장한다.
 * 이 하나의 장치가 두 가지를 겸한다 — 가입하지 않은 사람의 문서 소유 증명과 로그인 세션.
 *
 * 나누지 않는 이유가 있다. 가입은 **지금 쓰고 있는 계정에 이메일을 붙이는 일**이지
 * 새 사람이 되는 일이 아니다(`repository.attachCredentials`). 그래서 가입 전에 올린
 * 문서가 그대로 따라온다. 가입하면 문서를 잃는 서비스에는 아무도 가입하지 않는다.
 *
 * 남는 한계는 분명하다 — 가입하지 않은 채 쿠키를 지우거나 다른 기기로 옮기면 문서를
 * 되찾을 수 없다. 업로드 화면에서 이 사실을 미리 알리고, 가입을 그 해결책으로 권한다.
 */

const COOKIE_NAME = "el_session";
const TOKEN_BYTES = 32;

/** 하루(초). 24 × 60 × 60. */
const DAY_SECONDS = 86_400;
const MS_PER_SECOND = 1000;
/**
 * 가입하지 않은 세션은 길게 잡는다. 이 쿠키가 사라지면 문서를 되찾을 방법이 없기 때문이다.
 * 가입한 세션은 짧게 잡는다 — 잃어버려도 다시 로그인하면 된다.
 */
const ANONYMOUS_DAYS = 365;
const AUTHENTICATED_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function lifetimeDays(hasAccount: boolean): number {
  return hasAccount ? AUTHENTICATED_DAYS : ANONYMOUS_DAYS;
}

function expiryFrom(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_SECONDS * MS_PER_SECOND);
}

interface CurrentSession {
  readonly sessionId: string;
  readonly userId: string;
  /** 가입한 계정인가. 화면의 로그인/로그아웃 표시가 이 값을 본다. */
  readonly email: string | null;
}

/**
 * 지금 요청의 세션. 없거나 만료됐으면 undefined.
 *
 * **쿠키를 만들지 않는다.** 서버 컴포넌트에서는 쿠키를 심을 수 없고(HTTP는 응답이
 * 시작된 뒤 Set-Cookie를 보낼 수 없다), 읽기만 하는 화면이 세션을 새로 열 이유도 없다.
 */
async function currentSession(): Promise<CurrentSession | undefined> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token === undefined || token.length === 0) {
    return;
  }

  const db = appDb();
  const row = findLiveSession(db, hashToken(token));
  if (row === undefined) {
    return;
  }

  const account = findUserById(db, row.userId);
  return { sessionId: row.id, userId: row.userId, email: account?.email ?? null };
}

/** 문서 조회에 쓰는 축약형. 소유자 판정에는 사용자 id만 있으면 된다. */
async function currentOwnerId(): Promise<string | undefined> {
  return (await currentSession())?.userId;
}

/** 쿠키를 심는다. 서버 액션·라우트 핸들러에서만 동작한다. */
async function setSessionCookie(token: string, days: number): Promise<void> {
  (await cookies()).set(COOKIE_NAME, token, {
    // 스크립트가 읽을 수 없어야 한다. 이 토큰이 곧 문서 열쇠다.
    httpOnly: true,
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: days * DAY_SECONDS,
  });
}

/**
 * 이 사용자로 새 세션을 열고 쿠키를 심는다.
 *
 * 로그인·가입 직후에 부른다. **가입 시점에도 새 세션을 연다** — 세션 고정(session
 * fixation) 공격을 막으려면 권한이 바뀌는 순간 세션 식별자가 바뀌어야 한다.
 */
async function startSession(userId: string, hasAccount: boolean): Promise<void> {
  const db = appDb();
  const token = randomBytes(TOKEN_BYTES).toString("base64url");
  const days = lifetimeDays(hasAccount);

  createSession(db, userId, hashToken(token), expiryFrom(new Date(), days));
  await setSessionCookie(token, days);

  // 세션을 열 때마다 만료된 것들을 조금씩 치운다. 별도 스케줄러를 두지 않는다.
  deleteExpiredSessions(db);
}

/**
 * 소유자를 확보한다. 세션이 없으면 가입하지 않은 사용자와 세션을 함께 만든다.
 *
 * **서버 액션이나 라우트 핸들러에서만 부른다.**
 */
async function ensureOwnerId(): Promise<string> {
  const existing = await currentSession();
  const db = appDb();

  if (existing !== undefined) {
    touchUser(db, existing.userId);
    return existing.userId;
  }

  const userId = createAnonymousUser(db);
  await startSession(userId, false);
  return userId;
}

/** 로그아웃. 이 기기의 세션만 닫는다. 다른 기기는 그대로 둔다. */
async function endSession(): Promise<void> {
  const existing = await currentSession();
  if (existing !== undefined) {
    deleteSession(appDb(), existing.sessionId);
  }
  (await cookies()).delete(COOKIE_NAME);
}

/** 세션 만료를 뒤로 민다. 매일 쓰는 사람이 갑자기 튕기지 않도록. */
function renewSession(sessionId: string, hasAccount: boolean): void {
  touchSession(appDb(), sessionId, expiryFrom(new Date(), lifetimeDays(hasAccount)));
}

export {
  COOKIE_NAME,
  currentOwnerId,
  currentSession,
  endSession,
  ensureOwnerId,
  renewSession,
  startSession,
};
export type { CurrentSession };
