import { describe, expect, it } from "vitest";
import { dayKey, daysUntil, formatDate } from "./format";

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

describe("시간대를 바꾸면", () => {
  it("같은 순간이 다른 날짜로 보인다", () => {
    // 설치할 때 고른 시간대가 실제로 화면에 반영되는지. 기본값만 검사하면 이걸 놓친다.
    const moment = new Date("2026-08-28T16:00:00Z");
    expect(formatDate(moment, "Asia/Seoul")).toBe("2026년 8월 29일");
    expect(formatDate(moment, "UTC")).toBe("2026년 8월 28일");
  });

  it("남은 날짜도 그 시간대로 센다", () => {
    const now = new Date("2026-08-29T20:00:00Z"); // 서울은 이미 8월 30일 새벽
    const target = new Date("2026-08-30T20:00:00Z");
    expect(daysUntil(target, now, "Asia/Seoul")).toBe(1);
    expect(daysUntil(target, now, "UTC")).toBe(1);
  });
});

describe("dayKey", () => {
  it("하루를 가리키는 이름을 준다", () => {
    expect(dayKey(new Date("2026-09-04T05:00:00Z"))).toBe("2026-09-04");
  });

  it("자정을 넘긴 순간은 그 시간대의 다음 날이다", () => {
    // UTC로는 9월 4일 오후 4시. 서울은 이미 9월 5일이라 하루 몫이 새로 찬다.
    const moment = new Date("2026-09-04T16:00:00Z");
    expect(dayKey(moment, "Asia/Seoul")).toBe("2026-09-05");
    expect(dayKey(moment, "UTC")).toBe("2026-09-04");
  });
});
