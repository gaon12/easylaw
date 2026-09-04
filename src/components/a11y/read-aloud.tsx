"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RATE_NORMAL, SPEECH_RATES, type SpeakableSentence, speechQueue } from "@/lib/a11y/speech";
import { speech } from "@/lib/strings";
import styles from "./read-aloud.module.css";

/**
 * 소리 내어 읽기. `FEATURES.md` [F-11] · `PAGES.md` §5
 *
 * **브라우저가 읽는다.** 판결문 본문이 밖으로 나가지 않는다 — 운영체제·브라우저에 이미
 * 있는 목소리를 쓰므로 요청이 하나도 생기지 않는다(`lib/a11y/speech.ts`에 이유를 적었다).
 *
 * **이 기능이 없는 브라우저에서는 아무것도 그리지 않는다.** 눌러도 안 되는 버튼을 두는
 * 것은 고장 난 것보다 나쁘다 — 소리를 기다리는 사람이 자기 기기 문제인지 우리 문제인지
 * 알 수 없게 된다.
 *
 * 상태는 셋뿐이다: 멈춤 · 읽는 중 · 잠시 멈춤. 더 두면 버튼이 늘고, 이 화면에서 늘려야
 * 할 것은 글자 크기지 버튼 수가 아니다.
 */
/** 지금 상태를 한 마디로. 셋 중 하나이고, 멈춰 있으면 아무 말도 하지 않는다. */
function statusText(speaking: boolean, paused: boolean): string {
  if (!speaking) {
    return "";
  }
  return paused ? speech.statusPaused : speech.statusSpeaking;
}

/** 속도 고르기. 색만으로 구분하지 않으려고 `aria-pressed`를 함께 준다(`DESIGN.md` §3.4). */
function RateChoices({ rate, onChange }: { rate: number; onChange: (value: number) => void }) {
  return (
    <span className={styles.rates}>
      <span className="sr-only">{speech.rateLabel}</span>
      {SPEECH_RATES.map((value, index) => (
        <button
          aria-pressed={rate === value}
          className={`${styles.rate} ${rate === value ? styles.rateOn : ""}`}
          key={value}
          onClick={() => onChange(value)}
          type="button"
        >
          {speech.rateNames[index]}
        </button>
      ))}
    </span>
  );
}

/**
 * 덩어리들을 차례로 읽게 큐에 넣는다. 읽을 것이 없으면 아무것도 하지 않고 `false`.
 *
 * 마지막 덩어리에만 끝 알림을 단다 — 덩어리마다 달면 중간에 끝난 것으로 읽힌다.
 */
function speakAll(queue: readonly string[], rate: number, onEnd: () => void): boolean {
  const synthesis = window.speechSynthesis;
  synthesis.cancel();
  if (queue.length === 0) {
    return false;
  }

  for (const [index, chunk] of queue.entries()) {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = "ko-KR";
    utterance.rate = rate;
    if (index === queue.length - 1) {
      utterance.onend = onEnd;
    }
    synthesis.speak(utterance);
  }
  return true;
}

/**
 * 읽기 상태를 들고 있는 훅. 컴포넌트에서 떼어 두면 화면은 버튼 배치만 남는다.
 *
 * `speechSynthesis`는 페이지가 아니라 **브라우저에** 매인 큐다. 그래서 화면을 떠날 때
 * 반드시 멈춘다 — 그냥 두면 다른 화면으로 옮겨 간 뒤에도 계속 읽는다.
 */
function useReadAloud(sentences: readonly SpeakableSentence[]) {
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState<number>(RATE_NORMAL);
  const rateRef = useRef<number>(RATE_NORMAL);

  useEffect(() => {
    setSupported(typeof window !== "undefined" && "speechSynthesis" in window);
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const start = useCallback(() => {
    const spoke = speakAll(speechQueue(sentences), rateRef.current, () => {
      setSpeaking(false);
      setPaused(false);
    });
    if (!spoke) {
      return;
    }
    setSpeaking(true);
    setPaused(false);
  }, [sentences]);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }, []);

  const toggle = useCallback(() => {
    const synthesis = window.speechSynthesis;
    if (paused) {
      synthesis.resume();
      setPaused(false);
      return;
    }
    synthesis.pause();
    setPaused(true);
  }, [paused]);

  /*
   * 속도를 바꾸면 **읽던 것을 다시 시작한다.** 이미 큐에 들어간 발화의 속도는 바꿀 수
   * 없어서, 바꾼 값이 다음 문장부터 적용되면 읽는 사람은 무엇이 바뀌었는지 알 수 없다.
   */
  const changeRate = useCallback(
    (value: number) => {
      setRate(value);
      rateRef.current = value;
      if (speaking) {
        start();
      }
    },
    [speaking, start],
  );

  return { supported, speaking, paused, rate, start, stop, toggle, changeRate };
}

function ReadAloud({ sentences }: { sentences: readonly SpeakableSentence[] }) {
  const { supported, speaking, paused, rate, start, stop, toggle, changeRate } =
    useReadAloud(sentences);

  if (!supported) {
    return null;
  }

  return (
    <div className={styles.bar}>
      <span className={styles.label}>{speech.label}</span>

      {speaking ? (
        <>
          <Button onClick={toggle} size="s" variant="secondary">
            {paused ? speech.resume : speech.pause}
          </Button>
          <Button onClick={stop} size="s" variant="tertiary">
            {speech.stop}
          </Button>
        </>
      ) : (
        <Button onClick={start} size="s" variant="secondary">
          {speech.play}
        </Button>
      )}

      <RateChoices onChange={changeRate} rate={rate} />

      {/* 지금 읽고 있는지를 글자로도 알린다. 소리만으로 알리면 소리가 안 날 때 알 수 없다. */}
      <span aria-live="polite" className={styles.status}>
        {statusText(speaking, paused)}
      </span>
    </div>
  );
}

export { ReadAloud };
