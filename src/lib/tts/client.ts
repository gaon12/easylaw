import "server-only";
import { REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_SECONDS } from "@/lib/timing";
import type { TtsConfig } from "@/server/settings";
import { sampleRateOf, wrapPcmInWav } from "./wav";

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
 * ## 두 가지 규격을 말한다
 *
 * **Gemini는 OpenAI 호환 `/audio/speech`를 주지 않는다**(실측: 404). 음성은 네이티브
 * `generateContent`에 `responseModalities: ["AUDIO"]`를 실어야 나오고, 돌아오는 것은
 * 압축하지 않은 PCM이다. 그래서 주소를 보고 길을 가른다 — 설정 칸을 늘리지 않으려는
 * 것이다. 운영자가 넣은 주소가 곧 어느 제공자인지를 말해 준다.
 *
 * ## 형식
 *
 * `opus`를 먼저 청한다. 같은 품질에 mp3의 절반쯤이고, 문장마다 파일을 두는 우리 구조에서
 * 그 차이가 그대로 저장 용량이 된다. 다만 **모든 제공자가 주지는 않는다** — 거절당하면
 * `mp3`로 한 번 더 청한다. mp3는 어디서나 재생된다.
 */

/** 청하는 순서. 앞의 것이 거절당하면 다음 것으로 한 번 더 청한다. */
const FORMATS = ["opus", "mp3"] as const;

/** 저장·재생에 쓰는 형식. `wav`는 Gemini처럼 압축하지 않은 PCM을 주는 곳에서 나온다. */
type AudioFormat = (typeof FORMATS)[number] | "wav";

/** 브라우저에 넘길 때 쓸 이름. `<audio>`가 이 값을 보고 디코더를 고른다. */
const MIME: Readonly<Record<AudioFormat, string>> = {
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

/**
 * 문장 하나가 이보다 길면 자른다.
 *
 * 우리 문장은 L4가 20자, L1이 길어야 100자 남짓이다(린터가 잡는다). 이 상한은 품질이
 * 아니라 **사고를 막는 것**이다 — 어딘가에서 문장 나누기가 깨져 문단 하나가 통째로
 * 넘어오면, 그 한 번의 호출이 몇 분을 잡아먹는다.
 */
const MAX_CHARS = 400;

/** 다시 걸면 될 법한 상태 코드. 그 밖은 같은 요청을 다시 보내도 같은 답이 온다. */
const TOO_MANY_REQUESTS = 429;
const SERVER_ERROR_FLOOR = 500;

class TtsError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "TtsError";
    this.status = status;
  }

  /**
   * 잠시 뒤에 다시 걸면 될 일인가.
   *
   * **무료 등급의 속도 제한이 흔하다.** Gemini로 실제로 돌려 보니 여덟 문장 만에 429가
   * 왔다. 그것을 "설정이 틀렸다"고 말하면 멀쩡한 설정을 고치게 만든다.
   */
  get retryable(): boolean {
    return (
      this.status === undefined ||
      this.status === TOO_MANY_REQUESTS ||
      this.status >= SERVER_ERROR_FLOOR
    );
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

/** Gemini는 음성을 네이티브 API로만 준다. 주소가 그것을 말해 준다. */
const GEMINI_HOST = "generativelanguage.googleapis.com";

function isGemini(baseUrl: string): boolean {
  return baseUrl.includes(GEMINI_HOST);
}

/**
 * 음성을 달라는 설정. 제공자 규격의 필드명이라 카멜케이스를 그대로 쓴다 —
 * 이름을 바꾸면 조용히 무시되고 글이 돌아온다.
 */
function geminiAudioConfig(voice: string): unknown {
  return {
    responseModalities: ["AUDIO"],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
  };
}

interface GeminiPart {
  inlineData?: { mimeType?: string; data?: string };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  error?: { message?: string };
}

/**
 * Gemini 네이티브 음성.
 *
 * 돌아오는 것은 **압축하지 않은 PCM**(`audio/l16; rate=24000`)이라 그대로는 브라우저가
 * 재생하지 못한다. 44바이트 머리를 붙여 WAV로 만든다(`wav.ts`).
 *
 * 키를 주소줄에 싣는다. Google이 그렇게만 받는다 — 그래서 이 주소가 **로그에 남지 않게**
 * 조심해야 한다. 오류 문구에도 주소를 넣지 않는 이유다.
 */
async function geminiSpeak(
  config: TtsConfig,
  text: string,
  signal: AbortSignal | undefined,
): Promise<Speech> {
  const base = config.baseUrl.trim().replace(TRAILING_SLASHES, "");
  const url = `${base}/models/${config.model}:generateContent?key=${encodeURIComponent(config.apiKey)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: text.slice(0, MAX_CHARS) }] }],
      generationConfig: geminiAudioConfig(config.voice),
    }),
    signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw await errorOf(response);
  }

  const body = (await response.json()) as GeminiResponse;
  const part = body.candidates?.[0]?.content?.parts?.find(
    (one) => one.inlineData?.data !== undefined,
  )?.inlineData;

  if (part?.data === undefined) {
    /*
     * 200인데 소리가 없다. 모델 이름이 음성 모델이 아닐 때 이렇게 온다 — 그때 "연결 실패"라고
     * 하면 엉뚱한 곳을 보게 된다.
     */
    throw new TtsError(
      `음성이 오지 않았습니다. 모델 이름이 음성 모델인지 확인하세요: ${body.error?.message ?? "(설명 없음)"}`,
    );
  }

  return {
    bytes: wrapPcmInWav(Buffer.from(part.data, "base64"), sampleRateOf(part.mimeType)),
    format: "wav",
  };
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
function speak(config: TtsConfig, text: string, signal?: AbortSignal): Promise<Speech> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return Promise.reject(new TtsError("빈 문장은 소리로 만들지 않습니다."));
  }

  if (isGemini(config.baseUrl)) {
    return geminiSpeak(config, trimmed, signal);
  }

  return openAiSpeak(config, trimmed, signal);
}

async function openAiSpeak(
  config: TtsConfig,
  trimmed: string,
  signal: AbortSignal | undefined,
): Promise<Speech> {
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
