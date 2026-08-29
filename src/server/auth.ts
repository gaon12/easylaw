import "server-only";
import {
  attachCredentials,
  deleteUserIfEmpty,
  findUserByEmail,
  touchUser,
} from "@/db/app/repository";
import { appDb } from "@/db/client";
import { type CredentialProblem, normalizeEmail, validateNewCredentials } from "@/lib/credentials";
import { RateLimiter } from "@/lib/rate-limit";
import { currentSession, endSession, ensureOwnerId, startSession } from "./owner";
import { hashPassword, verifyPassword } from "./password";

/**
 * 가입과 로그인. `PAGES.md` §17 · `CONVENTIONS.md` §7
 *
 * 가입은 **새 사람이 되는 일이 아니라 지금 쓰던 계정에 이메일을 붙이는 일**이다.
 * 그래서 가입 전에 올린 문서가 그대로 따라온다.
 *
 * 로그인은 다르다. 다른 계정으로 갈아타는 것이므로 그 전에 익명으로 올린 문서는 따라오지
 * 않는다. 같은 컴퓨터를 여러 사람이 쓸 수 있어서, 로그인했다는 이유로 그 브라우저에 있던
 * 문서를 계정으로 옮기면 남의 문서를 가져가는 일이 된다. 화면에서 이 점을 미리 알린다.
 */

/** 15분(밀리초) 안에 10번 틀리면 잠시 막는다. */
const LOGIN_ATTEMPT_LIMIT = 10;
const LOGIN_WINDOW_MS = 900_000;

const loginLimiter = new RateLimiter({ limit: LOGIN_ATTEMPT_LIMIT, windowMs: LOGIN_WINDOW_MS });

/**
 * 사용자가 없을 때 비교에 쓰는 가짜 해시.
 *
 * 없는 이메일이면 즉시 실패로 돌려보내고 싶지만, 그러면 응답 시간만 보고 **어떤 이메일이
 * 가입돼 있는지** 알아낼 수 있다. 없는 경우에도 같은 계산을 한 번 돌린다.
 */
const DUMMY_HASH = hashPassword("이 값은 쓰이지 않는다. 시간을 맞추기 위한 것이다.");

type AuthProblem = CredentialProblem | "email_taken" | "credentials_invalid" | "too_many_attempts";

type AuthResult = { readonly ok: true } | { readonly ok: false; readonly problem: AuthProblem };

/**
 * 가입한다.
 *
 * 성공하면 **세션을 새로 연다.** 권한이 바뀌는 순간 세션 식별자가 바뀌어야
 * 세션 고정(session fixation) 공격이 통하지 않는다.
 */
async function signUp(rawEmail: string, rawPassword: string): Promise<AuthResult> {
  const validated = validateNewCredentials(rawEmail, rawPassword);
  if (!validated.ok) {
    return { ok: false, problem: validated.problem };
  }

  const { email, password } = validated.credentials;
  // 지금 쓰던 (익명) 계정을 그대로 쓴다. 새로 만들면 올린 문서가 남의 것이 된다.
  const userId = await ensureOwnerId();

  if (!attachCredentials(appDb(), userId, email, hashPassword(password))) {
    return { ok: false, problem: "email_taken" };
  }

  await startSession(userId, true);
  return { ok: true };
}

/**
 * 로그인한다.
 *
 * 이메일이 없든 비밀번호가 틀리든 **같은 이유**를 돌려준다. 둘을 구분해 알려 주면
 * 로그인 창이 가입 여부 조회 도구가 된다.
 */
async function signIn(rawEmail: string, password: string): Promise<AuthResult> {
  const email = normalizeEmail(rawEmail);
  const now = Date.now();

  if (!loginLimiter.allows(email, now)) {
    return { ok: false, problem: "too_many_attempts" };
  }

  const db = appDb();
  const account = findUserByEmail(db, email);
  const stored = account?.passwordHash ?? DUMMY_HASH;

  if (!verifyPassword(password, stored) || account?.passwordHash == null) {
    loginLimiter.fail(email, now);
    loginLimiter.sweep(now);
    return { ok: false, problem: "credentials_invalid" };
  }

  loginLimiter.succeed(email);

  // 갈아타기 전, 쓰던 익명 계정이 빈 껍데기면 치운다. 문서가 있으면 건드리지 않는다.
  const previous = await currentSession();
  if (previous !== undefined && previous.userId !== account.id) {
    deleteUserIfEmpty(db, previous.userId);
  }

  touchUser(db, account.id);
  await startSession(account.id, true);
  return { ok: true };
}

/** 로그아웃. 이 기기의 세션만 닫는다. */
async function signOut(): Promise<void> {
  await endSession();
}

export { signIn, signOut, signUp };
export type { AuthProblem, AuthResult };
