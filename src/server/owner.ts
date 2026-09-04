import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import {
  createSession,
  deleteExpiredSessions,
  deleteSession,
  findLiveSession,
  findUserById,
  touchSession,
  type UserRole,
} from "@/db/app/repository";
import { appDb } from "@/db/client";
import { isSecureRequest } from "./request";
import { shouldUseSecureCookies } from "./settings";

/**
 * 로그인 세션. `PRODUCT.md` §6.3
 *
 * 브라우저에는 **무작위 토큰**을 쿠키로 주고, 서버에는 그 토큰의 SHA-256만 저장한다.
 * DB가 유출돼도 남의 세션을 흉내 낼 수 없다.
 *
 * **세션은 로그인한 사람에게만 있다.** 문서를 올리려면 계정이 있어야 하기 때문이다.
 * 그냥 둘러보는 사람에게는 쿠키를 주지 않는다 — 아무것도 저장할 것이 없는데 식별자를
 * 심는 것은 필요 없는 추적이다.
 */

const COOKIE_NAME = "el_session";
const TOKEN_BYTES = 32;

/** 하루(초). 24 × 60 × 60. */
const DAY_SECONDS = 86_400;
const MS_PER_SECOND = 1000;
/**
 * 세션 수명. 쓸 때마다 뒤로 밀리므로 실제로는 "30일 동안 안 들어오면 로그아웃"이다.
 * 잃어버려도 다시 로그인하면 되니 길게 잡을 이유가 없다.
 */
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function expiryFrom(now: Date): Date {
  return new Date(now.getTime() + SESSION_DAYS * DAY_SECONDS * MS_PER_SECOND);
}

interface CurrentSession {
  readonly sessionId: string;
  readonly userId: string;
  /** 가입한 계정인가. 화면의 로그인/로그아웃 표시가 이 값을 본다. */
  readonly email: string | null;
  /** 화면에 보이는 이름. 없으면 화면이 이메일 앞부분을 쓴다. */
  readonly nickname: string | null;
  /** 관리자만 서비스 설정을 바꿀 수 있다. */
  readonly role: UserRole;
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
  return {
    sessionId: row.id,
    userId: row.userId,
    email: account?.email ?? null,
    nickname: account?.nickname ?? null,
    role: account?.role ?? "member",
  };
}

/** 문서 조회에 쓰는 축약형. 소유자 판정에는 사용자 id만 있으면 된다. */
async function currentOwnerId(): Promise<string | undefined> {
  return (await currentSession())?.userId;
}

/** 쿠키를 심는다. 서버 액션·라우트 핸들러에서만 동작한다. */
async function setSessionCookie(token: string): Promise<void> {
  /*
   * `Secure`는 **설정이 켜져 있고 지금 요청이 실제로 https일 때만** 붙인다.
   *
   * http 요청에 `Secure` 쿠키를 심으면 브라우저가 조용히 버린다. 그러면 로그인은
   * 성공했는데 다음 요청에 쿠키가 오지 않고, 설치 마법사는 2단계 → 3단계 → 1단계로
   * 되튕기는 고리에 갇힌다. `/login`도 설치 전에는 `/setup`으로 돌아가므로 빠져나갈
   * 길이 없다 — 실제로 이 프로젝트에서 일어났다.
   *
   * **보안을 낮추는 것이 아니다.** http로 온 요청에는 `Secure`가 지킬 것이 없다.
   * 그 자리에서 플래그가 하는 일은 "쿠키를 버리게 만들기" 하나뿐이다. https로 오면
   * 설정 그대로 붙는다.
   */
  const secure = shouldUseSecureCookies() && (await isSecureRequest());

  (await cookies()).set(COOKIE_NAME, token, {
    // 스크립트가 읽을 수 없어야 한다. 이 토큰이 곧 문서 열쇠다.
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_DAYS * DAY_SECONDS,
  });
}

/**
 * 이 사용자로 새 세션을 열고 쿠키를 심는다.
 *
 * 로그인·가입 직후에 부른다. **가입 시점에도 새 세션을 연다** — 세션 고정(session
 * fixation) 공격을 막으려면 권한이 바뀌는 순간 세션 식별자가 바뀌어야 한다.
 */
async function startSession(userId: string): Promise<void> {
  const db = appDb();
  const token = randomBytes(TOKEN_BYTES).toString("base64url");

  createSession(db, userId, hashToken(token), expiryFrom(new Date()));
  await setSessionCookie(token);

  // 세션을 열 때마다 만료된 것들을 조금씩 치운다. 별도 스케줄러를 두지 않는다.
  deleteExpiredSessions(db);
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
function renewSession(sessionId: string): void {
  touchSession(appDb(), sessionId, expiryFrom(new Date()));
}

/**
 * 화면에 보여 줄 이름.
 *
 * **이메일을 화면에 쓰지 않는다.** 헤더나 인사말에 이메일이 떠 있으면 화면을 공유하거나
 * 어깨너머로 볼 때 그대로 샌다. 닉네임이 없는 옛 계정은 이메일 앞부분(@ 앞)을 쓴다 —
 * 도메인까지 보여 줄 이유가 없다.
 *
 * 한 곳에 두는 이유는 규칙이 화면마다 달라지지 않게 하기 위해서다.
 */
function displayName(session: { nickname: string | null; email: string | null }): string | null {
  if (session.nickname !== null && session.nickname.length > 0) {
    return session.nickname;
  }
  if (session.email === null) {
    return null;
  }
  return session.email.split("@")[0] ?? session.email;
}

export {
  COOKIE_NAME,
  currentOwnerId,
  currentSession,
  displayName,
  endSession,
  renewSession,
  startSession,
};
export type { CurrentSession };
