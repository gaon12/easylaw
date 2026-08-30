import "server-only";
import { createUser, findUserByEmail, touchUser, type UserRole } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { type CredentialProblem, normalizeEmail, validateNewCredentials } from "@/lib/credentials";
import { RateLimiter } from "@/lib/rate-limit";
import { endSession, startSession } from "./owner";
import { hashPassword, verifyPassword } from "./password";

/**
 * 가입과 로그인. `PAGES.md` §17 · `CONVENTIONS.md` §7
 *
 * 문서를 올리려면 계정이 있어야 한다. 판결문에는 이름·주민등록번호·주소가 그대로 들어
 * 있어서, 그 문서의 주인이 누구인지가 쿠키 하나에 달려 있으면 안 되기 때문이다.
 * 쿠키는 지워지고, 기기는 바뀌고, 같은 컴퓨터를 여러 사람이 쓴다.
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
async function signUp(
  rawEmail: string,
  rawPassword: string,
  role: UserRole = "member",
): Promise<AuthResult> {
  const validated = validateNewCredentials(rawEmail, rawPassword);
  if (!validated.ok) {
    return { ok: false, problem: validated.problem };
  }

  const { email, password } = validated.credentials;
  const userId = createUser(appDb(), email, hashPassword(password), role);
  if (userId === undefined) {
    return { ok: false, problem: "email_taken" };
  }

  await startSession(userId);
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
  touchUser(db, account.id);
  await startSession(account.id);
  return { ok: true };
}

/** 로그아웃. 이 기기의 세션만 닫는다. */
async function signOut(): Promise<void> {
  await endSession();
}

export { signIn, signOut, signUp };
export type { AuthProblem, AuthResult };
