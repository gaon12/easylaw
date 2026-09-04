/**
 * 소리 내어 읽기의 순수한 부분. `FEATURES.md` [F-11]
 *
 * **브라우저의 `speechSynthesis`를 쓴다.** 판결문을 남의 서버로 보내지 않기 위해서다 —
 * 이 서비스는 글꼴까지 자체 호스팅해 외부 요청을 0으로 두고 있는데(`69f501c`), 정작
 * 본문을 통째로 음성 API에 보내면 그 원칙이 무의미해진다. 운영체제·브라우저에 이미 있는
 * 목소리를 쓰면 아무것도 나가지 않는다.
 *
 * 이 파일에는 **DOM도 브라우저 API도 없다.** 끊는 규칙만 있어서 그대로 시험할 수 있다.
 *
 * **발음을 미리 바꾸지 않는다.** `es-hangul`의 `standardizePronunciation`으로 "법률"을
 * "범뉼"로 바꿔 넘기는 방법을 검토했지만 쓰지 않기로 했다 — 한국어 음성 엔진은 이미 그
 * 변환을 자기 방식으로 하고, 미리 바꾼 글자를 넣으면 억양과 낱말 경계가 오히려 무너진다.
 * 우리가 고칠 수 있는 것은 **무엇을 어떤 순서로 읽을지**이지 어떻게 소리 낼지가 아니다.
 */

/** 느리게 / 보통 / 빠르게. 이 셋뿐이다 — 고르는 일을 만들지 않는다. */
const RATE_SLOW = 0.8;
const RATE_NORMAL = 1;
const RATE_FAST = 1.25;

/** 읽기 속도 3단. 보통을 가운데 두고 양옆으로 한 단씩. */
const SPEECH_RATES = [RATE_SLOW, RATE_NORMAL, RATE_FAST] as const;
type SpeechRate = (typeof SPEECH_RATES)[number];

/**
 * 한 번에 넘길 글자 수 상한.
 *
 * 엔진마다 긴 문장을 통째로 넘기면 중간에 끊기거나 아예 침묵하는 경우가 있다. 판결문
 * 한 문장이 200자를 넘는 일은 흔하므로(그것이 이 서비스가 있는 이유이기도 하다) 잘라서 넘긴다.
 */
const MAX_CHUNK = 180;

/** 문장이 끝나는 자리. 자를 때는 여기를 먼저 찾는다. */
const SENTENCE_END = /(?<=[.!?。]|다\.|요\.)\s+/u;

/**
 * 긴 글을 읽기 좋은 덩어리로 자른다.
 *
 * 먼저 문장 경계로 자르고, 그래도 긴 덩어리는 **띄어쓰기 자리**에서 자른다.
 * 낱말 가운데를 자르면 그 자리에서 소리가 어색하게 끊긴다.
 */
function splitForSpeech(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const chunks: string[] = [];
  for (const part of trimmed.split(SENTENCE_END)) {
    if (part.length <= MAX_CHUNK) {
      if (part.trim().length > 0) {
        chunks.push(part.trim());
      }
      continue;
    }

    let rest = part.trim();
    while (rest.length > MAX_CHUNK) {
      const cut = rest.lastIndexOf(" ", MAX_CHUNK);
      const at = cut > MAX_CHUNK / 2 ? cut : MAX_CHUNK;
      chunks.push(rest.slice(0, at).trim());
      rest = rest.slice(at).trim();
    }
    if (rest.length > 0) {
      chunks.push(rest);
    }
  }

  return chunks;
}

interface SpeakableSentence {
  readonly role: "heading" | "body";
  readonly text: string;
}

/**
 * 화면의 문장들을 읽을 차례로 만든다.
 *
 * **제목도 읽는다.** "다음 절차" 같은 제목은 그 아래 문장이 무엇에 관한 것인지를 말해
 * 주는데, 눈으로 보는 사람은 그것을 한눈에 보지만 듣는 사람은 읽어 주지 않으면 알 수 없다.
 */
function speechQueue(sentences: readonly SpeakableSentence[]): string[] {
  return sentences.flatMap((sentence) => splitForSpeech(sentence.text));
}

export { MAX_CHUNK, RATE_NORMAL, SPEECH_RATES, speechQueue, splitForSpeech };
export type { SpeakableSentence, SpeechRate };
