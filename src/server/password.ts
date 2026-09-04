import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/**
 * 비밀번호 해시. `.dev/CONVENTIONS.md` §7
 *
 * **scrypt를 쓴다.** Node에 내장돼 있어 의존성이 늘지 않고, 메모리를 많이 쓰도록 설계돼
 * GPU로 병렬 공격하기 어렵다. 비밀번호를 직접 다루는 코드는 외부 패키지에 맡기지 않는
 * 편이 감사하기 쉽다 — 이 파일 하나만 읽으면 무엇을 저장하는지 다 보인다.
 *
 * `src/server`에 두는 이유는 이 코드가 클라이언트 번들에 절대 들어가서는 안 되기 때문이다.
 * `server-only`가 그것을 빌드 단계에서 강제한다.
 *
 * 저장 형식은 `scrypt$N$r$p$salt$hash`다. 파라미터를 값 안에 담아 두면 나중에 비용을
 * 올려도 예전 해시를 그대로 검증할 수 있다. 파라미터를 코드에만 두면 값을 올리는 순간
 * 기존 사용자가 전부 로그인하지 못한다.
 */

/** CPU/메모리 비용. 128 × N × r = 32MB를 쓴다. */
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** 기본 상한(32MB)으로는 위 파라미터가 들어가지 않는다. 여유를 두고 96MB로 올린다. */
const MAX_MEMORY = 100_663_296;

const ALGORITHM = "scrypt";
const SEPARATOR = "$";
/** `알고리즘$N$r$p$솔트$해시` — 여섯 칸. */
const FIELD_COUNT = 6;

interface ScryptParams {
  readonly cost: number;
  readonly blockSize: number;
  readonly parallel: number;
}

const DEFAULT_PARAMS: ScryptParams = {
  cost: COST,
  blockSize: BLOCK_SIZE,
  parallel: PARALLELIZATION,
};

/**
 * 유니코드를 정규화하고 파생한다.
 *
 * 한글은 자모 분리형(NFD)과 완성형(NFC)이 다른 바이트열이다. 키보드나 운영체제에 따라
 * 어느 쪽으로도 들어올 수 있어서, 정규화하지 않으면 눈에 같은 글자로 로그인이 안 된다.
 */
function derive(password: string, salt: Buffer, params: ScryptParams): Buffer {
  return scryptSync(password.normalize("NFKC"), salt, KEY_LENGTH, {
    N: params.cost,
    r: params.blockSize,
    p: params.parallel,
    maxmem: MAX_MEMORY,
  });
}

/** 저장할 문자열 하나를 만든다. 솔트는 비밀번호마다 새로 뽑는다. */
function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES);
  const hash = derive(password, salt, DEFAULT_PARAMS);
  return [
    ALGORITHM,
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64"),
    hash.toString("base64"),
  ].join(SEPARATOR);
}

/**
 * 비밀번호가 맞는지 확인한다.
 *
 * 비교는 반드시 `timingSafeEqual`로 한다. `===`로 비교하면 앞에서부터 몇 바이트가
 * 맞았는지가 응답 시간에 새어 나온다.
 *
 * 형식이 깨진 값에는 예외를 던지지 않고 false를 돌려준다 — 저장된 해시가 손상됐다고
 * 로그인 화면이 500으로 죽으면 사용자는 무슨 일이 생겼는지 알 수 없다.
 */
function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(SEPARATOR);
  if (parts.length !== FIELD_COUNT || parts[0] !== ALGORITHM) {
    return false;
  }

  const [, costRaw, blockRaw, parallelRaw, saltRaw, hashRaw] = parts;
  const cost = Number(costRaw);
  const blockSize = Number(blockRaw);
  const parallel = Number(parallelRaw);
  if (!(Number.isInteger(cost) && Number.isInteger(blockSize) && Number.isInteger(parallel))) {
    return false;
  }

  const expected = Buffer.from(hashRaw ?? "", "base64");
  if (expected.length !== KEY_LENGTH) {
    return false;
  }

  const actual = derive(password, Buffer.from(saltRaw ?? "", "base64"), {
    cost,
    blockSize,
    parallel,
  });
  return timingSafeEqual(actual, expected);
}

export { hashPassword, verifyPassword };
