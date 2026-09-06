import type { SpeechDriver, SpeechItem } from "./speech";

/**
 * 미리 만들어 둔 음성 파일로 읽는다. [F-11]
 *
 * **재생 제어기는 그대로 쓴다.** `speech.ts`의 제어기는 "읽을 것 하나"를 `speak`하고
 * `onstart`/`onend`를 기다릴 뿐, 그것이 브라우저 음성인지 파일인지 모른다. 그 경계 덕에
 * 문장 차례·멈춤·다시·속도·강조가 **한 벌로 남는다** — 두 벌이면 언젠가 한쪽만 고쳐진다.
 *
 * 속도는 파일에 굽지 않는다. `playbackRate`로 바꾼다 — 브라우저가 음높이를 보정해 주고,
 * 세 단계를 각각 저장하면 자리가 세 배가 된다.
 */

/** 다음 문장을 미리 받아 둔다. 문장 사이가 끊겨 들리지 않게. */
const PRELOAD_AHEAD = 1;

interface AudioSpeech {
  readonly driver: SpeechDriver;
  readonly createItem: (text: string, index: number) => SpeechItem;
  /** 다 쓰고 나서 부른다. 받아 둔 것을 놓는다. */
  readonly destroy: () => void;
}

/**
 * 주소 목록으로 음성 재생기를 만든다.
 *
 * 하나라도 주소가 없으면 **부르는 쪽이 이것을 쓰지 않는다** — 중간에 브라우저 음성으로
 * 갈아타면 목소리가 문장마다 바뀌어 더 나쁘다.
 */
/** 재생 실패는 `onerror`로 이미 알린다. 여기서 다시 던지지 않는다. */
function ignore(): void {
  /* 비어 있는 것이 뜻이다. */
}

function makeCache(urls: readonly string[]) {
  const cache = new Map<number, HTMLAudioElement>();

  return {
    cache,
    elementFor(index: number): HTMLAudioElement | undefined {
      const url = urls[index];
      if (url === undefined) {
        return;
      }
      const cached = cache.get(index);
      if (cached !== undefined) {
        return cached;
      }
      const audio = new Audio(url);
      audio.preload = "auto";
      cache.set(index, audio);
      return audio;
    },
  };
}

function createAudioSpeech(urls: readonly string[]): AudioSpeech {
  const { cache, elementFor } = makeCache(urls);
  let current: HTMLAudioElement | undefined;

  return {
    driver: {
      speak: () => {
        /* 실제 재생은 `createItem`이 돌려준 것이 시작한다. 여기서 할 일은 없다. */
      },
      pause: () => current?.pause(),
      resume: () => {
        current?.play().catch(ignore);
      },
      cancel: () => {
        current?.pause();
        if (current !== undefined) {
          current.currentTime = 0;
        }
        current = undefined;
      },
    },

    createItem: (_text, index) => {
      const audio = elementFor(index);
      const item: SpeechItem = {
        lang: "ko-KR",
        rate: 1,
        onstart: null,
        onend: null,
        onerror: null,
      };

      if (audio === undefined) {
        /* 주소가 없다. 곧바로 끝난 것으로 알려 다음 문장으로 넘어가게 한다. */
        queueMicrotask(() => item.onend?.());
        return item;
      }

      audio.onplaying = () => item.onstart?.();
      audio.onended = () => item.onend?.();
      audio.onerror = () => item.onerror?.({ error: "audio" });

      /*
       * 제어기가 `speak`를 부르기 전에 이 객체를 만들고 값을 채운다(`rate` 등).
       * 그래서 재생은 다음 순번으로 미룬다 — 그래야 `rate`가 반영된다.
       */
      queueMicrotask(() => {
        current = audio;
        audio.playbackRate = item.rate;
        audio.currentTime = 0;
        audio.play().catch(() => item.onerror?.({ error: "audio" }));
        elementFor(index + PRELOAD_AHEAD)?.load();
      });

      return item;
    },

    destroy: () => {
      for (const audio of cache.values()) {
        audio.pause();
        audio.src = "";
      }
      cache.clear();
      current = undefined;
    },
  };
}

export { createAudioSpeech };
export type { AudioSpeech };
