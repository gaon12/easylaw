import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSpeechPlayer,
  SPEECH_RATES,
  type SpeechDriver,
  type SpeechItem,
  type SpeechSnapshot,
  toSpeechText,
} from "./speech";

function item(): SpeechItem {
  return { lang: "", rate: 0, onstart: null, onend: null, onerror: null };
}

function harness(texts = ["첫 문장입니다.", "법률에 따른 둘째 문장입니다."]) {
  const spoken: SpeechItem[] = [];
  const snapshots: SpeechSnapshot[] = [];
  const driver: SpeechDriver = {
    speak: (next) => spoken.push(next),
    pause: vi.fn(),
    resume: vi.fn(),
    cancel: vi.fn(),
  };
  const onError = vi.fn();
  const player = createSpeechPlayer({
    texts,
    driver,
    createItem: item,
    onChange: (snapshot) => snapshots.push(snapshot),
    onError,
  });
  return { driver, onError, player, snapshots, spoken };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("음성 읽기 텍스트", () => {
  it("화면의 원문 대신 표준 발음 문자열을 음성 엔진에 보낸다", () => {
    expect(toSpeechText(" 법률에 따라 판단합니다. ")).toBe("범뉴레 따라 판딴함니다.");
  });

  it("속도 선택지는 제품 명세의 세 값뿐이다", () => {
    expect(SPEECH_RATES).toEqual([0.75, 1, 1.25]);
  });
});

describe("문장 단위 음성 재생", () => {
  it("문장이 시작될 때 하이라이트하고 끝나면 다음 문장을 읽는다", () => {
    const { player, snapshots, spoken } = harness();
    player.play();

    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ lang: "ko-KR", rate: 1 });
    spoken[0]?.onstart?.();
    expect(snapshots.at(-1)).toMatchObject({ phase: "playing", activeIndex: 0 });

    spoken[0]?.onend?.();
    expect(spoken).toHaveLength(2);
    spoken[1]?.onstart?.();
    expect(snapshots.at(-1)).toMatchObject({ phase: "playing", activeIndex: 1 });

    spoken[1]?.onend?.();
    expect(snapshots.at(-1)).toEqual({ phase: "idle", activeIndex: null, rate: 1 });
  });

  it("일시정지와 계속 읽기 상태를 구분한다", () => {
    const { driver, player } = harness();
    player.play();
    player.pause();
    expect(driver.pause).toHaveBeenCalledOnce();
    expect(player.snapshot().phase).toBe("paused");

    player.resume();
    expect(driver.resume).toHaveBeenCalledOnce();
    expect(player.snapshot().phase).toBe("playing");
  });

  it("고른 속도는 다음 문장부터 적용한다", () => {
    const { player, spoken } = harness();
    player.setRate(1.25);
    player.play();
    expect(spoken[0]?.rate).toBe(1.25);

    player.setRate(0.75);
    spoken[0]?.onend?.();
    expect(spoken[1]?.rate).toBe(0.75);
  });

  it("정지 뒤 늦게 도착한 콜백은 다음 문장을 시작하지 않는다", () => {
    const { driver, player, spoken } = harness();
    player.play();
    const first = spoken[0];

    player.stop();
    first?.onend?.();

    expect(driver.cancel).toHaveBeenCalledOnce();
    expect(spoken).toHaveLength(1);
    expect(player.snapshot()).toEqual({ phase: "idle", activeIndex: null, rate: 1 });
  });

  it("cleanup은 재생을 취소하고 모든 늦은 콜백을 무효화한다", () => {
    const { driver, onError, player, snapshots, spoken } = harness();
    player.play();
    const beforeDestroy = snapshots.length;
    const first = spoken[0];

    player.destroy();
    first?.onstart?.();
    first?.onerror?.({ error: "network" });

    expect(driver.cancel).toHaveBeenCalledOnce();
    expect(snapshots).toHaveLength(beforeDestroy);
    expect(onError).not.toHaveBeenCalled();
  });

  it("엔진 오류를 알리고 하이라이트를 해제한다", () => {
    const { onError, player, spoken } = harness();
    player.play();
    spoken[0]?.onstart?.();
    spoken[0]?.onerror?.({ error: "synthesis-failed" });

    expect(onError).toHaveBeenCalledOnce();
    expect(player.snapshot()).toEqual({ phase: "idle", activeIndex: null, rate: 1 });
  });
});
