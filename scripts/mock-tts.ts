/**
 * 가짜 음성 서버. `npm run tts:mock`
 *
 * biome-ignore-all lint/correctness/noNodejsModules: 개발용 서버다.
 *
 * **배관을 먼저 확인하려고 둔다.** 실제 모델을 붙이기 전에 "청하고 → 받고 → 저장하고 →
 * 재생한다"가 끝까지 이어지는지 본다. LLM 때 `llm:mock`으로 같은 순서를 밟았고, 그 덕에
 * 배관 문제와 모델 문제를 갈라 볼 수 있었다.
 *
 * OpenAI 호환 `/v1/audio/speech`를 말한다. **소리는 진짜 소리다** — 글자 수에 비례하는
 * 길이의 사인파 WAV를 만든다. 무음을 주면 "재생이 안 되는 것"과 "소리가 없는 것"을
 * 구분할 수 없다.
 *
 * 사용:
 *   npm run tts:mock
 *   /admin에서 음성 주소를 http://127.0.0.1:3998/v1 로
 */

import { createServer } from "node:http";
import process from "node:process";

const PORT = 3998;

/** 한국어를 소리 내어 읽는 속도. 글자 수로 길이를 정하는 데 쓴다. */
const CHARS_PER_SECOND = 5.5;
const SAMPLE_RATE = 16_000;
const TONE_HZ = 220;
const MAX_SECONDS = 30;

function wav(seconds: number): Buffer {
  const samples = Math.max(1, Math.floor(SAMPLE_RATE * Math.min(seconds, MAX_SECONDS)));
  const data = Buffer.alloc(samples * 2);
  for (let at = 0; at < samples; at += 1) {
    /* 끝을 향해 잦아들게 한다. 여러 문장을 이어 들을 때 경계가 들린다. */
    const fade = 1 - at / samples;
    const value = Math.sin((2 * Math.PI * TONE_HZ * at) / SAMPLE_RATE) * 0.2 * fade;
    data.writeInt16LE(Math.round(value * 32_767), at * 2);
  }

  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

const server = createServer((request, response) => {
  if (!request.url?.endsWith("/audio/speech")) {
    response.writeHead(404).end("not found");
    return;
  }

  let body = "";
  request.on("data", (chunk: Buffer) => {
    body += chunk.toString("utf8");
  });
  request.on("end", () => {
    let input = "";
    let format = "mp3";
    try {
      const parsed = JSON.parse(body) as { input?: string; response_format?: string };
      input = parsed.input ?? "";
      format = parsed.response_format ?? "mp3";
    } catch {
      response.writeHead(400).end("bad json");
      return;
    }

    /*
     * **`opus`를 거절한다.** 진짜 제공자 중에도 못 주는 곳이 있고, 그때 우리가 mp3로
     * 물러설 수 있는지가 이 가짜 서버로 확인하려는 것 중 하나다.
     */
    if (format === "opus") {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "opus is not supported" } }));
      return;
    }

    const audio = wav(input.length / CHARS_PER_SECOND);
    process.stdout.write(`${input.length}자 → ${audio.length}바이트 (${format})\n`);
    response.writeHead(200, { "content-type": "audio/wav", "content-length": audio.length });
    response.end(audio);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`가짜 음성 서버: http://127.0.0.1:${PORT}/v1\n`);
});
