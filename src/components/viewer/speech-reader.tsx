"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createSpeechPlayer,
  SPEECH_RATES,
  type SpeechItem,
  type SpeechPhase,
  type SpeechPlayer,
  type SpeechRate,
  type SpeechSnapshot,
} from "@/lib/speech";
import { viewer } from "@/lib/strings";
import styles from "./speech-reader.module.css";

type Support = "checking" | "supported" | "unsupported";

const INITIAL_SNAPSHOT: SpeechSnapshot = { phase: "idle", activeIndex: null, rate: 1 };

function buttonLabel(phase: SpeechPhase): string {
  if (phase === "playing") {
    return viewer.speech.pause;
  }
  if (phase === "paused") {
    return viewer.speech.resume;
  }
  return viewer.speech.play;
}

function statusText({
  support,
  snapshot,
  error,
  total,
}: {
  support: Support;
  snapshot: SpeechSnapshot;
  error: string | null;
  total: number;
}): string {
  if (error !== null) {
    return error;
  }
  if (support === "checking") {
    return viewer.speech.checking;
  }
  if (support === "unsupported") {
    return viewer.speech.unsupported;
  }
  if (snapshot.phase === "paused") {
    return viewer.speech.paused;
  }
  if (snapshot.phase === "playing") {
    return snapshot.activeIndex === null
      ? viewer.speech.starting
      : viewer.speech.reading(snapshot.activeIndex + 1, total);
  }
  return viewer.speech.ready;
}

function SpeechControls({
  snapshot,
  onToggle,
  onStop,
  onRate,
}: {
  snapshot: SpeechSnapshot;
  onToggle: () => void;
  onStop: () => void;
  onRate: (rate: SpeechRate) => void;
}) {
  return (
    <section aria-label={viewer.speech.controls} className={styles.controls}>
      <div className={styles.actions}>
        <Button
          aria-pressed={snapshot.phase !== "idle"}
          onClick={onToggle}
          size="m"
          variant="secondary"
        >
          {buttonLabel(snapshot.phase)}
        </Button>
        <Button disabled={snapshot.phase === "idle"} onClick={onStop} size="m" variant="tertiary">
          {viewer.speech.stop}
        </Button>
      </div>

      <fieldset className={styles.speed}>
        <legend>{viewer.speech.speed}</legend>
        <div className={styles.speedOptions}>
          {SPEECH_RATES.map((rate, index) => (
            <label className={styles.speedOption} key={rate}>
              <input
                checked={snapshot.rate === rate}
                name="speech-rate"
                onChange={() => onRate(rate)}
                type="radio"
                value={rate}
              />
              <span>{viewer.speech.rateLabels[index]}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </section>
  );
}

function useSpeechPlayback(texts: readonly string[]) {
  const [support, setSupport] = useState<Support>("checking");
  const [snapshot, setSnapshot] = useState<SpeechSnapshot>(INITIAL_SNAPSHOT);
  const [error, setError] = useState<string | null>(null);
  const playerRef = useRef<SpeechPlayer | null>(null);

  useEffect(() => {
    if (
      !("speechSynthesis" in window && "SpeechSynthesisUtterance" in window) ||
      texts.length === 0
    ) {
      setSupport("unsupported");
      return;
    }
    const synthesis = window.speechSynthesis;
    const player = createSpeechPlayer({
      texts,
      driver: {
        speak: (item) => synthesis.speak(item as SpeechSynthesisUtterance),
        pause: () => synthesis.pause(),
        resume: () => synthesis.resume(),
        cancel: () => synthesis.cancel(),
      },
      createItem: (text): SpeechItem => new SpeechSynthesisUtterance(text) as unknown as SpeechItem,
      onChange: setSnapshot,
      onError: () => setError(viewer.speech.error),
    });

    playerRef.current = player;
    setSupport("supported");
    setSnapshot(player.snapshot());
    return () => {
      player.destroy();
      playerRef.current = null;
    };
  }, [texts]);

  return { error, playerRef, setError, snapshot, support };
}

function useSpeechHighlight(activeIndex: number | null) {
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (content === null) {
      return;
    }
    content
      .querySelector<HTMLElement>('[data-speech-active="true"]')
      ?.removeAttribute("data-speech-active");
    if (activeIndex === null) {
      return;
    }

    const active = content.querySelector<HTMLElement>(`[data-speech-index="${activeIndex}"]`);
    active?.setAttribute("data-speech-active", "true");
    return () => active?.removeAttribute("data-speech-active");
  }, [activeIndex]);

  return contentRef;
}

/**
 * 현재 설명을 브라우저 음성으로 읽는다.
 *
 * 자식 중 `data-speech-index`가 붙은 요소를 문장 하이라이트 자리로 쓴다. 이렇게 하면
 * 생성 설명의 HTML은 서버 컴포넌트로 남고, 브라우저 API가 필요한 이 작은 껍질만
 * 클라이언트로 보낼 수 있다. 공개 판례와 올린 문서가 같은 `RenditionPanel`을 쓰므로
 * 두 경로의 동작도 한 벌이다.
 */
function SpeechReader({ texts, children }: { texts: readonly string[]; children: ReactNode }) {
  const { error, playerRef, setError, snapshot, support } = useSpeechPlayback(texts);
  const contentRef = useSpeechHighlight(snapshot.activeIndex);

  const toggle = (): void => {
    setError(null);
    if (snapshot.phase === "playing") {
      playerRef.current?.pause();
      return;
    }
    if (snapshot.phase === "paused") {
      playerRef.current?.resume();
      return;
    }
    playerRef.current?.play();
  };

  const stop = (): void => {
    setError(null);
    playerRef.current?.stop();
  };

  const status = statusText({ support, snapshot, error, total: texts.length });

  return (
    <div className={styles.reader}>
      {support === "supported" ? (
        <SpeechControls
          onRate={(rate) => playerRef.current?.setRate(rate)}
          onStop={stop}
          onToggle={toggle}
          snapshot={snapshot}
        />
      ) : null}

      <p
        aria-live="polite"
        className={support === "unsupported" || error !== null ? styles.unavailable : "sr-only"}
      >
        {status}
      </p>

      <div className={styles.content} ref={contentRef}>
        {children}
      </div>
    </div>
  );
}

export { SpeechReader };
