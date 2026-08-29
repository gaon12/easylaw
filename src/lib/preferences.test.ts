import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPreferences,
  CONTRAST_ATTRIBUTE,
  DEFAULTS,
  DISPLAY_KEY,
  PREFERENCES_SCRIPT,
  readPreferences,
  TEXT_SIZE_ATTRIBUTE,
  TEXT_SIZE_KEY,
} from "./preferences";

/** localStorage 대역. 실제 브라우저 저장소 없이 읽기/쓰기 규칙만 검사한다. */
function stubStorage(values: Record<string, string>, throws = false) {
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => {
        if (throws) {
          throw new Error("접근 거부");
        }
        return values[key] ?? null;
      },
    },
    matchMedia: () => ({ matches: false }),
  });
}

function stubDocument() {
  const attributes: Record<string, string> = {};
  vi.stubGlobal("document", {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  });
  return attributes;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("readPreferences", () => {
  it("저장된 값을 읽는다", () => {
    stubStorage({ [TEXT_SIZE_KEY]: "xl", [DISPLAY_KEY]: "more" });
    expect(readPreferences()).toEqual({ textSize: "xl", display: "more" });
  });

  it("모르는 값은 기본값으로 되돌린다", () => {
    // 저장소는 아무나 고칠 수 있다. 이상한 값이 들어와도 화면이 깨지면 안 된다.
    stubStorage({ [TEXT_SIZE_KEY]: "huge", [DISPLAY_KEY]: "rainbow" });
    expect(readPreferences()).toEqual(DEFAULTS);
  });

  it("예전에 저장된 normal을 기본 모드로 이어받는다", () => {
    // 대비 설정만 있던 시절 normal을 고른 사람은 "시스템 설정"이 아니라 "기본"을 고른 것이다.
    // 이 처리가 없으면 그 사람들의 설정이 조용히 초기화된다.
    stubStorage({ [DISPLAY_KEY]: "normal" });
    expect(readPreferences().display).toBe("light");
  });

  it("저장소 접근이 막혀도 기본값으로 돈다", () => {
    // 사생활 보호 모드에서는 접근 자체가 예외를 던진다.
    stubStorage({}, true);
    expect(readPreferences()).toEqual(DEFAULTS);
  });
});

describe("applyPreferences", () => {
  it("글자 크기와 대비를 속성으로 옮긴다", () => {
    stubStorage({});
    const attributes = stubDocument();
    applyPreferences({ textSize: "l", display: "more" });

    expect(attributes[TEXT_SIZE_ATTRIBUTE]).toBe("l");
    expect(attributes[CONTRAST_ATTRIBUTE]).toBe("more");
  });

  it("기본 모드는 시스템 설정을 따르지 않는다", () => {
    // 시스템이 고대비여도 사용자가 "기본"을 골랐으면 밝은 화면이어야 한다.
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const attributes = stubDocument();
    applyPreferences({ textSize: "m", display: "light" });

    expect(attributes[CONTRAST_ATTRIBUTE]).toBe("normal");
  });

  it("시스템 설정을 고르면 운영체제를 따라간다", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const attributes = stubDocument();
    applyPreferences({ textSize: "m", display: "system" });

    expect(attributes[CONTRAST_ATTRIBUTE]).toBe("more");
  });
});

describe("PREFERENCES_SCRIPT", () => {
  it("저장소 키와 속성 이름을 상수에서 가져온다", () => {
    // 스크립트에 문자열을 다시 적으면 한쪽만 바뀐 채로 조용히 동작을 멈춘다.
    expect(PREFERENCES_SCRIPT).toContain(TEXT_SIZE_KEY);
    expect(PREFERENCES_SCRIPT).toContain(DISPLAY_KEY);
    expect(PREFERENCES_SCRIPT).toContain(TEXT_SIZE_ATTRIBUTE);
    expect(PREFERENCES_SCRIPT).toContain(CONTRAST_ATTRIBUTE);
  });

  it("저장소 접근 실패를 삼킨다 — 첫 페인트를 막으면 안 된다", () => {
    expect(PREFERENCES_SCRIPT).toContain("try{");
    expect(PREFERENCES_SCRIPT).toContain("catch(e){}");
  });
});
