import { standardizePronunciation } from "es-hangul";

/** 제품에서 제공하는 음성 속도. 옵션을 화면과 제어기에 따로 적지 않는다. */
const SLOW_RATE = 0.75;
const NORMAL_RATE = 1;
const FAST_RATE = 1.25;
const SPEECH_RATES = [SLOW_RATE, NORMAL_RATE, FAST_RATE] as const;
type SpeechRate = (typeof SPEECH_RATES)[number];

type SpeechPhase = "idle" | "playing" | "paused";

interface SpeechSnapshot {
  readonly phase: SpeechPhase;
  /** 실제로 소리가 나기 시작한 문장. 엔진이 준비 중이면 null이다. */
  readonly activeIndex: number | null;
  readonly rate: SpeechRate;
}

/**
 * DOM의 SpeechSynthesisUtterance에서 실제로 쓰는 부분만 가진다.
 *
 * 이 작은 경계 덕분에 브라우저 음성 엔진 없이도 문장 순서·중단·cleanup을 검사할 수 있다.
 */
interface SpeechItem {
  lang: string;
  rate: number;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { readonly error?: string }) => void) | null;
}

interface SpeechDriver {
  readonly speak: (item: SpeechItem) => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly cancel: () => void;
}

interface SpeechPlayerOptions {
  readonly texts: readonly string[];
  readonly driver: SpeechDriver;
  readonly createItem: (text: string) => SpeechItem;
  readonly onChange: (snapshot: SpeechSnapshot) => void;
  readonly onError: () => void;
}

interface SpeechPlayer {
  readonly play: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly stop: () => void;
  readonly setRate: (rate: SpeechRate) => void;
  /** 컴포넌트가 사라질 때 호출한다. 진행 중 콜백도 함께 무효화한다. */
  readonly destroy: () => void;
  readonly snapshot: () => SpeechSnapshot;
}

/** 화면의 글자는 바꾸지 않고, 음성 엔진에 건넬 글자만 표준 발음으로 바꾼다. */
function toSpeechText(text: string): string {
  return standardizePronunciation(text.trim());
}

/**
 * 문장을 하나씩 큐에 넣는 작은 재생 제어기.
 *
 * 브라우저의 경계(boundary) 이벤트는 한국어 음성마다 지원 정도가 다르다. 문장마다 별도
 * utterance를 만들면 어느 엔진에서도 `onstart`/`onend`만으로 같은 단위의 하이라이트를
 * 보장할 수 있다.
 */
class SentenceSpeechPlayer implements SpeechPlayer {
  private readonly options: SpeechPlayerOptions;
  private phase: SpeechPhase = "idle";
  private activeIndex: number | null = null;
  private rate: SpeechRate = NORMAL_RATE;
  private runId = 0;
  private destroyed = false;

  constructor(options: SpeechPlayerOptions) {
    this.options = options;
  }

  snapshot(): SpeechSnapshot {
    return { phase: this.phase, activeIndex: this.activeIndex, rate: this.rate };
  }

  private announce(): void {
    if (!this.destroyed) {
      this.options.onChange(this.snapshot());
    }
  }

  private finish(): void {
    this.phase = "idle";
    this.activeIndex = null;
    this.announce();
  }

  private queue(index: number, expectedRunId: number): void {
    if (this.destroyed || expectedRunId !== this.runId) {
      return;
    }
    if (index >= this.options.texts.length) {
      this.finish();
      return;
    }

    const item = this.options.createItem(toSpeechText(this.options.texts[index] ?? ""));
    item.lang = "ko-KR";
    item.rate = this.rate;
    item.onstart = () => {
      if (this.destroyed || expectedRunId !== this.runId) {
        return;
      }
      this.phase = "playing";
      this.activeIndex = index;
      this.announce();
    };
    item.onend = () => {
      if (this.destroyed || expectedRunId !== this.runId) {
        return;
      }
      this.queue(index + 1, expectedRunId);
    };
    item.onerror = (event) => {
      if (this.destroyed || expectedRunId !== this.runId) {
        return;
      }
      /* stop/cancel 뒤에 오는 늦은 오류는 runId로 걸러진다. 엔진 자체 오류만 알린다. */
      if (event.error !== "canceled" && event.error !== "interrupted") {
        this.options.onError();
      }
      this.finish();
    };
    this.options.driver.speak(item);
  }

  play(): void {
    if (this.destroyed || this.options.texts.length === 0) {
      return;
    }
    if (this.phase === "paused") {
      this.resume();
      return;
    }
    if (this.phase === "playing") {
      return;
    }

    const expectedRunId = ++this.runId;
    this.phase = "playing";
    this.activeIndex = null;
    this.announce();
    this.queue(0, expectedRunId);
  }

  pause(): void {
    if (this.destroyed || this.phase !== "playing") {
      return;
    }
    this.options.driver.pause();
    this.phase = "paused";
    this.announce();
  }

  resume(): void {
    if (this.destroyed || this.phase !== "paused") {
      return;
    }
    this.options.driver.resume();
    this.phase = "playing";
    this.announce();
  }

  stop(): void {
    if (this.destroyed) {
      return;
    }
    this.runId += 1;
    this.options.driver.cancel();
    this.finish();
  }

  setRate(nextRate: SpeechRate): void {
    if (this.destroyed || this.rate === nextRate) {
      return;
    }
    this.rate = nextRate;
    this.announce();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.runId += 1;
    this.destroyed = true;
    this.options.driver.cancel();
  }
}

function createSpeechPlayer(options: SpeechPlayerOptions): SpeechPlayer {
  return new SentenceSpeechPlayer(options);
}

export { createSpeechPlayer, SPEECH_RATES, toSpeechText };
export type { SpeechDriver, SpeechItem, SpeechPhase, SpeechPlayer, SpeechRate, SpeechSnapshot };
