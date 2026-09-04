import { describe, expect, it } from "vitest";
import { isSecureProtocol } from "./request";

/**
 * 이 판정이 틀리면 로그인이 조용히 막힌다. 헤더 조합을 하나씩 못 박아 둔다.
 */
describe("isSecureProtocol", () => {
  it("x-forwarded-proto를 먼저 본다", () => {
    expect(isSecureProtocol("https", null)).toBe(true);
    expect(isSecureProtocol("http", null)).toBe(false);
  });

  it("프록시가 여러 단계면 맨 앞 값을 쓴다 — 브라우저와 맞닿은 쪽이다", () => {
    expect(isSecureProtocol("https, http", null)).toBe(true);
    expect(isSecureProtocol("http, https", null)).toBe(false);
  });

  it("대소문자와 공백을 가리지 않는다", () => {
    expect(isSecureProtocol(" HTTPS ", null)).toBe(true);
  });

  it("헤더가 http라고 하면 Origin이 https여도 http로 본다", () => {
    // 프록시가 알려 준 것이 실제 연결이다. Origin은 브라우저가 적어 보내는 값이다.
    expect(isSecureProtocol("http", "https://example.com")).toBe(false);
  });

  it("x-forwarded-proto가 없으면 Origin의 스킴을 본다", () => {
    expect(isSecureProtocol(null, "https://example.com")).toBe(true);
    expect(isSecureProtocol(null, "http://localhost:3000")).toBe(false);
  });

  it("아무것도 없으면 http로 본다 — 모를 때 https라고 하면 쿠키가 사라진다", () => {
    expect(isSecureProtocol(null, null)).toBe(false);
    expect(isSecureProtocol("", "")).toBe(false);
  });
});
