import { describe, expect, it } from "vitest";
import { daysUntil, formatDate } from "./format";

describe("formatDate", () => {
  it("한국 시간 기준으로 날짜를 적는다", () => {
    // UTC로는 8월 28일 저녁이지만 한국에서는 이미 8월 29일이다.
    expect(formatDate(new Date("2026-08-28T16:00:00Z"))).toBe("2026년 8월 29일");
  });
});

describe("daysUntil", () => {
  const now = new Date("2026-08-29T01:00:00Z"); // 한국 시간 8월 29일 오전 10시

  it("같은 날이면 0이다", () => {
    expect(daysUntil(new Date("2026-08-29T14:00:00Z"), now)).toBe(0);
  });

  it("남은 날을 센다", () => {
    expect(daysUntil(new Date("2026-09-05T01:00:00Z"), now)).toBe(7);
  });

  it("시각이 아니라 날짜로 센다 — 밤 늦게 봐도 남은 날이 흔들리지 않는다", () => {
    const lateNight = new Date("2026-08-29T14:30:00Z"); // 한국 시간 8월 29일 밤 11시 30분
    expect(daysUntil(new Date("2026-08-30T01:00:00Z"), lateNight)).toBe(1);
  });

  it("이미 지난 날은 음수다", () => {
    expect(daysUntil(new Date("2026-08-27T01:00:00Z"), now)).toBe(-2);
  });
});
