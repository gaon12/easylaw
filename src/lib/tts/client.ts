import "server-only";
import { REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_SECONDS } from "@/lib/timing";
import type { TtsConfig } from "@/server/settings";

/**
 * 음성 합성 클라이언트. [F-11] · `PRODUCT.md` §6.2
 *
 * **OpenAI 호환 `/audio/speech` 규격으로 말한다.** `llm/client.ts`와 같은 판단이다 —
 * 설정이 주소·키·모델 세 칸인 이상 그것이 곧 이 규격을 고른다는 뜻이고, 자가 호스팅하는
 * 사람이 무엇을 꽂든(상용 API든, 내 컴퓨터의 MeloTTS 감싸개든) 같은 세 칸으로 끝난다.
 *
 * SDK를 쓰지 않는다. 보내는 것이 JSON 한 덩어리, 받는 것이 오디오 바이트 하나뿐이라
 * `fetch`로 충분하고, 그러면 응답을 어떻게 다루는지가 이 파일 안에 다 보인다.
 *
 * ## 형식
 *
 * `opus`를 먼저 청한다. 같은 품질에 mp3의 절반쯤이고, 문장마다 파일을 두는 우리 구조에서
 * 그 차이가 그대로 저장 용량이 된다. 다만 **모든 제공자가 주지는 않는다** — 거절당하면
 * `mp3`로 한 번 더 청한다. mp3는 어디서나 재생된다.
 */

/** 청하는 순서. 앞의 것이 거절당하면 다음 것으로 한 번 더 청한다. */
const FORMATS = ["opus", "mp3"] as const;

type AudioFormat = (typeof FORMATS)[number];

/** 브라우저에 넘길 때 쓸 이름. `<audio>`가 이 값을 보고 디코더를 고른다. */
const MIME: Readonly<Record<AudioFormat, string>> = {
  opus: "audio/ogg",
  mp3: "audio/mpeg",
};

/**
 * 문장 하나가 이보다 길면 자른다.
 *
 * 우리 문장은 L4가 20자, L1이 길어야 100자 남짓이다(린터가 잡는다). 이 상한은 품질이
 * 아니라 **사고를 막는 것**이다 — 어딘가에서 문장 나누기가 깨져 문단 하나가 통째로
 * 넘어오면, 그 한 번의 호출이 몇 분을 잡아먹는다.
 */
const MAX_CHARS = 400;

class TtsError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "TtsError";
    this.status = status;
  }
}

interface Speech {
  readonly bytes: Buffer;
  readonly format: AudioFormat;
}

/** 끝의 슬래시. 두 번 이어 붙지 않게 턴다(`llm/base-url.ts`와 같은 이유다). */
const TRAILING_SLASHES = /\/+$/u;

function requestSpeech(
  config: TtsConfig,
  text: string,
  format: AudioFormat,
  signal: AbortSignal | undefined,
): Promise<Response> {
  const base = config.baseUrl.trim().replace(TRAILING_SLASHES, "");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (config.apiKey.length > 0) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }

  return fetch(`${base}/audio/speech`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.model,
      voice: config.voice,
      input: text.slice(0, MAX_CHARS),
      response_format: format,
    }),
    signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}

/** 오류 본문을 그대로 다 담지 않는다. 원인을 알 만큼만 남긴다(`llm/client.ts`와 같다). */
const ERROR_DETAIL_LIMIT = 300;

async function errorOf(response: Response): Promise<TtsError> {
  const detail = (await response.text().catch(() => "")).slice(0, ERROR_DETAIL_LIMIT);
  return new TtsError(
    `음성 서버 응답이 ${response.status}입니다. ${detail}`.trim(),
    response.status,
  );
}

/**
 * 문장 하나를 소리로. 형식이 거절당하면 다음 형식으로 한 번 더 청한다.
 *
 * 빈 글은 부르지 않는다 — 제공자마다 빈 입력을 다르게 다루고(400·무음·오류), 어느 쪽이든
 * 우리가 원한 것이 아니다.
 */
async function speak(config: TtsConfig, text: string, signal?: AbortSignal): Promise<Speech> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new TtsError("빈 문장은 소리로 만들지 않습니다.");
  }

  let last: TtsError | undefined;
  for (const format of FORMATS) {
    // biome-ignore lint/performance/noAwaitInLoops: 앞 형식이 거절당해야 다음을 청한다. 동시에 걸 수 없다.
    const response = await requestSpeech(config, trimmed, format, signal);
    if (response.ok) {
      return { bytes: Buffer.from(await response.arrayBuffer()), format };
    }
    last = await errorOf(response);
  }

  throw last ?? new TtsError(`음성 서버가 ${REQUEST_TIMEOUT_SECONDS}초 안에 답하지 않았습니다.`);
}

export { MIME, speak, TtsError };
export type { AudioFormat, Speech };
