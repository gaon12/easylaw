const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_RADIX = 58n;
const CODE_LENGTH = 8;
const CODE_GROUP_LENGTH = 4;
const HASH_BASE = 257n;
const HASH_MODULUS = 18_446_744_073_709_551_557n;
const DECIMAL = /^\d+$/;
const DIGEST_LIMIT = 200;
const NAME_LIMIT = 100;
const MESSAGE_LIMIT = 2000;
const STACK_LIMIT = 12_000;

function hashText(value: string): bigint {
  let hash = 0n;
  for (const character of value) {
    hash = (hash * HASH_BASE + BigInt((character.codePointAt(0) ?? 0) + 1)) % HASH_MODULUS;
  }
  return hash;
}

function encodeBase58(value: bigint): string {
  if (value === 0n) {
    return BASE58[0] ?? "1";
  }
  let remaining = value;
  let encoded = "";
  while (remaining > 0n) {
    const index = Number(remaining % BASE58_RADIX);
    encoded = `${BASE58[index] ?? "1"}${encoded}`;
    remaining /= BASE58_RADIX;
  }
  return encoded;
}

/** Next digest나 클라이언트 오류 지문을 옮겨 적기 쉬운 공개 번호로 바꾼다. */
function publicErrorCode(fingerprint: string): string {
  const normalized = fingerprint.trim() || "unknown-error";
  const numeric = DECIMAL.test(normalized) ? BigInt(normalized) : hashText(normalized);
  const token = encodeBase58(numeric).padStart(CODE_LENGTH, "1").slice(-CODE_LENGTH);
  return `EL-${token.slice(0, CODE_GROUP_LENGTH)}-${token.slice(CODE_GROUP_LENGTH)}`;
}

function errorFingerprint(error: Error & { digest?: string }): string {
  return (
    error.digest?.slice(0, DIGEST_LIMIT) ??
    `${error.name.slice(0, NAME_LIMIT)}\n${error.message.slice(0, MESSAGE_LIMIT)}\n${(error.stack ?? "").slice(0, STACK_LIMIT)}`
  );
}

export { errorFingerprint, publicErrorCode };
