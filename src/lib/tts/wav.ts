/**
 * PCM에 WAV 머리를 붙인다. [F-11]
 *
 * **Gemini는 압축하지 않은 PCM(L16)을 준다.** 그대로는 `<audio>`가 재생하지 못한다 —
 * 어느 속도로, 몇 채널로, 몇 비트로 읽어야 하는지 적혀 있지 않기 때문이다. 44바이트짜리
 * 머리가 그것을 적어 준다.
 *
 * 소리를 건드리지 않는다. 앞에 44바이트를 붙일 뿐이다.
 */

const HEADER_BYTES = 44;
/** RIFF 크기 칸은 자기 앞의 8바이트를 세지 않는다. */
const RIFF_PREFIX = 8;
/** PCM의 `fmt ` 덩어리 길이. 규격이 16으로 정한다. */
const FMT_CHUNK_BYTES = 16;
const PCM_FORMAT = 1;
const MONO = 1;
const BITS = 16;
const BITS_PER_BYTE = 8;
const BYTES_PER_SAMPLE = BITS / BITS_PER_BYTE;

/** RIFF 머리에 적히는 자리들. 규격이 정한 바이트 위치다. */
const AT = {
  riff: 0,
  size: 4,
  wave: 8,
  fmt: 12,
  fmtSize: 16,
  format: 20,
  channels: 22,
  rate: 24,
  byteRate: 28,
  blockAlign: 32,
  bits: 34,
  data: 36,
  dataSize: 40,
} as const;

function wrapPcmInWav(pcm: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(HEADER_BYTES);
  header.write("RIFF", AT.riff);
  header.writeUInt32LE(HEADER_BYTES - RIFF_PREFIX + pcm.length, AT.size);
  header.write("WAVE", AT.wave);
  header.write("fmt ", AT.fmt);
  header.writeUInt32LE(FMT_CHUNK_BYTES, AT.fmtSize);
  header.writeUInt16LE(PCM_FORMAT, AT.format);
  header.writeUInt16LE(MONO, AT.channels);
  header.writeUInt32LE(sampleRate, AT.rate);
  header.writeUInt32LE(sampleRate * MONO * BYTES_PER_SAMPLE, AT.byteRate);
  header.writeUInt16LE(MONO * BYTES_PER_SAMPLE, AT.blockAlign);
  header.writeUInt16LE(BITS, AT.bits);
  header.write("data", AT.data);
  header.writeUInt32LE(pcm.length, AT.dataSize);

  return Buffer.concat([header, pcm]);
}

/** `audio/l16; rate=24000; channels=1`에서 표본 속도를 읽는다. 없으면 24kHz로 본다. */
const RATE = /rate=(\d+)/u;
const DEFAULT_RATE = 24_000;

function sampleRateOf(mimeType: string | undefined): number {
  const found = Number(RATE.exec(mimeType ?? "")?.[1]);
  return Number.isFinite(found) && found > 0 ? found : DEFAULT_RATE;
}

export { sampleRateOf, wrapPcmInWav };
