import { describe, expect, it } from "vitest";
import { asOfNote, readAsOf } from "@/lib/law-citation/as-of";
import { law as strings } from "@/lib/strings";

const now = new Date("2026-09-03T00:00:00Z");

describe("readAsOf", () => {
  it("날짜를 읽으면 그 날짜를 기준으로 삼는다", () => {
    const got = readAsOf("2019-06-01", now);
    expect(got.dated).toBe(true);
    expect(got.at.toISOString()).toBe("2019-06-01T00:00:00.000Z");
  });

  it("날짜가 없으면 오늘을 기준으로 삼는다", () => {
    expect(readAsOf(undefined, now)).toEqual({ at: now, dated: false });
  });

  it("못 읽는 날짜는 오늘로 되돌린다 — Invalid Date로 조회하지 않는다", () => {
    // 이것을 그대로 넘기면 SQL 비교가 NaN이 되어 조용히 0건이 된다.
    expect(readAsOf("zzz", now)).toEqual({ at: now, dated: false });
  });
});

describe("asOfNote", () => {
  it("선고일을 알 때만 '판결 당시의 법'이라고 말한다", () => {
    expect(asOfNote("2019-06-01", true)).toBe(strings.asOfNote);
  });

  it("주소를 직접 친 경우 오늘 기준이라고 말한다", () => {
    // 예전에는 여기서도 "이 판결이 선고될 때"라고 말했다. 판결이 아예 없는데도.
    expect(asOfNote(undefined, false)).toBe(strings.currentNote);
    expect(asOfNote(undefined, false)).not.toBe(strings.asOfNote);
  });

  it("날짜를 받았지만 못 읽었으면 선고일을 모른다고 말한다", () => {
    expect(asOfNote("zzz", false)).toBe(strings.unknownDateNote);
    expect(asOfNote("zzz", false)).not.toBe(strings.currentNote);
  });

  it("세 문구가 서로 다르다 — 하나로 뭉치면 둘은 거짓이 된다", () => {
    const notes = new Set([strings.asOfNote, strings.currentNote, strings.unknownDateNote]);
    expect(notes.size).toBe(3);
  });
});
