import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { createUser, findUserByOwnerKeyHash, touchUser } from "@/db/app/repository";
import { appDb } from "@/db/client";
import { isProduction } from "@/lib/env";

/**
 * 문서 소유권. `PRODUCT.md` §6.3
 *
 * 로그인은 아직 없다. 대신 브라우저에 **무작위 토큰**을 쿠키로 주고, 서버에는 그 토큰의
 * 해시만 저장한다. 토큰을 가진 브라우저가 자기 문서를 연다.
 *
 * 이 방식의 한계를 분명히 해 둔다.
 * - 쿠키를 지우거나 다른 기기로 옮기면 **문서를 되찾을 수 없다.** 복구 수단이 없다.
 *   그래서 업로드 화면에서 이 사실을 미리 알린다 — 나중에 놀라는 것보다 낫다.
 * - 계정이 아니라 브라우저 단위다. 같은 기기를 여러 사람이 쓰면 문서가 섞인다.
 *
 * 그럼에도 이 방식을 고른 이유는, 판결문을 올려 보려는 사람에게 회원가입을 먼저 요구하면
 * 대부분 거기서 그만두기 때문이다. 로그인은 나중에 같은 `user` 행에 email을 붙여 잇는다.
 */

const COOKIE_NAME = "el_owner";
/** 쿠키 수명 1년(초). 60 × 60 × 24 × 365. */
const ONE_YEAR_SECONDS = 31_536_000;
const TOKEN_BYTES = 32;

/** 토큰 원문은 저장하지 않는다. DB가 유출돼도 남의 문서를 열 수 없어야 한다. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * 지금 요청의 소유자. 쿠키가 없거나 모르는 토큰이면 undefined.
 *
 * **쿠키를 만들지 않는다.** 서버 컴포넌트에서는 쿠키를 심을 수 없고, 문서를 읽기만 하는
 * 화면이 소유자를 새로 만들 이유도 없다.
 */
async function currentOwnerId(): Promise<string | undefined> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (token === undefined || token.length === 0) {
    return;
  }
  return findUserByOwnerKeyHash(appDb(), hashToken(token))?.id;
}

/**
 * 소유자를 확보한다. 없으면 만들고 쿠키를 심는다.
 *
 * **서버 액션이나 라우트 핸들러에서만 부른다.** HTTP는 응답이 시작된 뒤에 쿠키를 심을 수
 * 없으므로 서버 컴포넌트 렌더 중에는 동작하지 않는다.
 */
async function ensureOwnerId(): Promise<string> {
  const store = await cookies();
  const db = appDb();

  const token = store.get(COOKIE_NAME)?.value;
  if (token !== undefined && token.length > 0) {
    const existing = findUserByOwnerKeyHash(db, hashToken(token));
    if (existing !== undefined) {
      touchUser(db, existing.id);
      return existing.id;
    }
  }

  // 토큰이 없거나, 있어도 서버가 모르는 값이다(DB를 지웠거나 남의 쿠키다). 새로 만든다.
  const fresh = randomBytes(TOKEN_BYTES).toString("base64url");
  const id = createUser(db, hashToken(fresh));

  store.set(COOKIE_NAME, fresh, {
    httpOnly: true,
    // 스크립트가 읽을 수 없어야 한다. 이 토큰이 곧 문서 열쇠다.
    sameSite: "lax",
    secure: isProduction(),
    path: "/",
    maxAge: ONE_YEAR_SECONDS,
  });

  return id;
}

export { COOKIE_NAME, currentOwnerId, ensureOwnerId };
