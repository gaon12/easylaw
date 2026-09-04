import { z } from "zod";

/**
 * 가입 입력 검증. `.dev/CONVENTIONS.md` §7
 *
 * 서버 액션은 폼을 거치지 않고도 호출되는 공개 진입점이라, 화면에서 무엇을 막았든
 * 여기서 다시 본다.
 *
 * 비밀번호 규칙은 NIST SP 800-63B의 방향을 따랐다 — **길이를 요구하고 구성은 요구하지
 * 않는다.** 대문자·특수문자를 강제하면 사람들은 `Password1!` 같은 예측 가능한 변형을
 * 만들 뿐이고, 실제로 막아야 할 것은 짧은 비밀번호와 흔한 비밀번호다.
 */

/** 이메일 최대 길이(RFC 5321). */
const EMAIL_MAX = 254;
const PASSWORD_MIN = 10;
/** scrypt에 아주 긴 입력을 넣어 서버를 묶어 두는 것을 막는다. */
const PASSWORD_MAX = 128;

/**
 * 아주 흔한 비밀번호. 전수 목록이 아니라 **분명한 것만** 막는다.
 * 긴 목록이 필요해지면 별도 데이터로 옮긴다 — 코드에 수천 줄을 박아 두지 않는다.
 */
const COMMON_PASSWORDS: readonly string[] = [
  "password",
  "password1",
  "password123",
  "qwerty123",
  "1234567890",
  "12345678901",
  "123456789012",
  "asdfasdf12",
  "iloveyou12",
  "administrator",
  "passwordpassword",
];

type CredentialProblem =
  | "email_required"
  | "email_invalid"
  | "password_required"
  | "password_too_short"
  | "password_too_long"
  | "password_too_common"
  | "password_contains_email"
  | "nickname_required"
  | "nickname_too_short"
  | "nickname_too_long"
  | "nickname_invalid";

interface Credentials {
  readonly email: string;
  readonly password: string;
}

type CredentialResult =
  | { readonly ok: true; readonly credentials: Credentials }
  | { readonly ok: false; readonly problem: CredentialProblem };

/** 소문자로 맞추고 공백을 턴다. `A@b.com`과 `a@b.com`으로 각각 가입되면 안 된다. */
function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

const emailSchema = z.string().max(EMAIL_MAX).pipe(z.email());

/** 너무 짧은 앞부분(`a@…`)까지 검사하면 멀쩡한 비밀번호가 걸린다. */
const MIN_LOCAL_PART_TO_CHECK = 3;

/** 이메일 앞부분. 비밀번호에 그대로 들어 있으면 사실상 아이디를 비밀번호로 쓰는 것이다. */
function localPart(email: string): string {
  return email.split("@")[0] ?? "";
}

function checkPassword(password: string, email: string): CredentialProblem | undefined {
  if (password.length === 0) {
    return "password_required";
  }
  if (password.length < PASSWORD_MIN) {
    return "password_too_short";
  }
  if (password.length > PASSWORD_MAX) {
    return "password_too_long";
  }

  const lowered = password.toLowerCase();
  if (COMMON_PASSWORDS.includes(lowered)) {
    return "password_too_common";
  }

  const local = localPart(email);
  if (local.length >= MIN_LOCAL_PART_TO_CHECK && lowered.includes(local)) {
    return "password_contains_email";
  }
  return;
}

/** 가입 입력을 검사한다. 통과하면 정규화된 값을 함께 돌려준다. */
function validateNewCredentials(rawEmail: string, password: string): CredentialResult {
  const email = normalizeEmail(rawEmail);
  if (email.length === 0) {
    return { ok: false, problem: "email_required" };
  }
  if (!emailSchema.safeParse(email).success) {
    return { ok: false, problem: "email_invalid" };
  }

  const problem = checkPassword(password, email);
  if (problem !== undefined) {
    return { ok: false, problem };
  }
  return { ok: true, credentials: { email, password } };
}

/**
 * 닉네임 길이.
 *
 * 아래로는 두 글자를 요구한다 — 한 글자는 화면에서 이름으로 읽히지 않는다.
 * 위로는 헤더가 무너지지 않을 만큼만 둔다.
 */
const NICKNAME_MIN = 2;
const NICKNAME_MAX = 20;

/**
 * 닉네임에 쓸 수 없는 글자.
 *
 * 제어문자·줄바꿈·너비 없는 문자·양방향 제어문자를 막는다. **화면에 그대로 그려지는
 * 값**이라, 눈에 보이지 않는 글자가 섞이면 이름이 이상하게 잘리거나 옆 글자를 밀어낸다.
 * 양방향 제어문자는 글자 순서를 뒤집어 보이게 만드는 데 쓰인다.
 */
// biome-ignore lint/complexity/useRegexLiterals: 정규식 리터럴로 쓰면 이 글자들이 보이지 않는 상태로 소스에 박힌다. 막으려는 대상이 바로 그 "보이지 않는 글자"라, 코드에서도 이스케이프로 적어야 읽고 고칠 수 있다.
const NICKNAME_FORBIDDEN = new RegExp(
  "[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\u202a-\u202e]",
  "u",
);

type NicknameResult =
  | { readonly ok: true; readonly nickname: string }
  | { readonly ok: false; readonly problem: CredentialProblem };

/**
 * 닉네임을 다듬고 본다.
 *
 * **유일성은 보지 않는다.** 이것은 식별자가 아니라 호칭이고, 유일하게 만들면 가입할 때
 * "이미 쓰는 사람이 있어요"를 만나게 된다. 계정을 가르는 것은 이메일이다.
 */
function validateNickname(raw: string): NicknameResult {
  const nickname = raw.trim();
  if (nickname.length === 0) {
    return { ok: false, problem: "nickname_required" };
  }
  if (NICKNAME_FORBIDDEN.test(nickname)) {
    return { ok: false, problem: "nickname_invalid" };
  }
  if (nickname.length < NICKNAME_MIN) {
    return { ok: false, problem: "nickname_too_short" };
  }
  if (nickname.length > NICKNAME_MAX) {
    return { ok: false, problem: "nickname_too_long" };
  }
  return { ok: true, nickname };
}

export {
  NICKNAME_MAX,
  NICKNAME_MIN,
  normalizeEmail,
  PASSWORD_MAX,
  PASSWORD_MIN,
  validateNewCredentials,
  validateNickname,
};
export type { CredentialProblem, CredentialResult, Credentials, NicknameResult };
