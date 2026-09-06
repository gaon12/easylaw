import { describe, expect, it } from "vitest";
import { sampleRateOf, wrapPcmInWav } from "./wav";

/**
 * 머리를 잘못 적으면 소리가 **재생은 되면서 이상하게 들린다** — 속도가 두 배가 되거나
 * 잡음이 된다. 그래서 규격의 바이트 자리를 그대로 검사한다.
 */
describe("wrapPcmInWav", () => {
  const pcm = Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]);

  it("44바이트 머리를 앞에 붙인다. 소리는 건드리지 않는다", () => {
    const wav = wrapPcmInWav(pcm, 24_000);

    expect(wav.length).toBe(44 + pcm.length);
    expect(wav.subarray(44)).toEqual(pcm);
  });

  it("RIFF·WAVE 표시를 적는다", () => {
    const wav = wrapPcmInWav(pcm, 24_000);

    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.toString("ascii", 36, 40)).toBe("data");
  });

  it("표본 속도와 자료 크기를 적는다 — 이것이 틀리면 속도가 달라진다", () => {
    const wav = wrapPcmInWav(pcm, 16_000);

    expect(wav.readUInt32LE(24)).toBe(16_000);
    /* 초당 바이트 = 속도 × 채널 1 × 2바이트 */
    expect(wav.readUInt32LE(28)).toBe(32_000);
    expect(wav.readUInt32LE(40)).toBe(pcm.length);
    expect(wav.readUInt32LE(4)).toBe(36 + pcm.length);
  });

  it("16비트 모노로 적는다", () => {
    const wav = wrapPcmInWav(pcm, 24_000);

    expect(wav.readUInt16LE(20)).toBe(1);
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt16LE(34)).toBe(16);
  });
});

describe("sampleRateOf", () => {
  it("Gemini가 주는 형태에서 속도를 읽는다", () => {
    expect(sampleRateOf("audio/l16; rate=24000; channels=1")).toBe(24_000);
    expect(sampleRateOf("audio/L16;codec=pcm;rate=16000")).toBe(16_000);
  });

  it("적혀 있지 않으면 24kHz로 본다 — 조용히 0으로 두면 소리가 깨진다", () => {
    expect(sampleRateOf(undefined)).toBe(24_000);
    expect(sampleRateOf("audio/l16")).toBe(24_000);
  });
});
