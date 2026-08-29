import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("맞는 비밀번호를 확인한다", () => {
    const stored = hashPassword("우리집 보증금 2026");
    expect(verifyPassword("우리집 보증금 2026", stored)).toBe(true);
  });

  it("틀린 비밀번호를 거절한다", () => {
    const stored = hashPassword("우리집 보증금 2026");
    expect(verifyPassword("우리집 보증금 2025", stored)).toBe(false);
    expect(verifyPassword("", stored)).toBe(false);
  });

  it("같은 비밀번호라도 매번 다른 값이 나온다", () => {
    // 솔트가 없으면 같은 비밀번호를 쓰는 사용자들이 한눈에 드러난다.
    expect(hashPassword("같은비밀번호12345")).not.toBe(hashPassword("같은비밀번호12345"));
  });

  it("파라미터를 값 안에 담는다 — 나중에 비용을 올려도 예전 해시를 검증할 수 있다", () => {
    const stored = hashPassword("비밀번호12345678");
    expect(stored.startsWith("scrypt$32768$8$1$")).toBe(true);
    expect(stored.split("$")).toHaveLength(6);
  });

  it("유니코드 정규화가 다른 입력도 같은 비밀번호로 본다", () => {
    // 한글은 자모 분리형(NFD)과 완성형(NFC)이 다른 바이트열이다. 키보드나 OS에 따라
    // 어느 쪽으로도 들어올 수 있어서, 정규화하지 않으면 같은 글자로 로그인이 안 된다.
    const stored = hashPassword("가나다라마바사12".normalize("NFC"));
    expect(verifyPassword("가나다라마바사12".normalize("NFD"), stored)).toBe(true);
  });

  it("형식이 깨진 저장값에 예외를 던지지 않는다", () => {
    expect(verifyPassword("아무거나", "")).toBe(false);
    expect(verifyPassword("아무거나", "scrypt$bad")).toBe(false);
    expect(verifyPassword("아무거나", "bcrypt$32768$8$1$c2FsdA==$aGFzaA==")).toBe(false);
    expect(verifyPassword("아무거나", "scrypt$32768$8$1$c2FsdA==$dG9vc2hvcnQ=")).toBe(false);
  });
});
