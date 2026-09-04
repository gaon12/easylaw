/* biome-ignore-all lint/correctness/noNodejsModules: 첫 페인트용 브라우저 스크립트를 격리된 전역에서 실제 실행한다. */
import vm from "node:vm";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyPreferences,
  CONTRAST_ATTRIBUTE,
  DEFAULT_LEVEL_KEY,
  DEFAULTS,
  DISPLAY_KEY,
  PREFERENCES_SCRIPT,
  readPreferences,
  TEXT_SIZE_ATTRIBUTE,
  TEXT_SIZE_KEY,
  writePreferences,
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
      setItem: (key: string, value: string) => {
        if (throws) {
          throw new Error("접근 거부");
        }
        values[key] = value;
      },
    },
    matchMedia: () => ({ matches: false }),
  });
}

function stubDocument() {
  const attributes: Record<string, string | undefined> = {};
  vi.stubGlobal("document", {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
      removeAttribute: (name: string) => {
        delete attributes[name];
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
    stubStorage({
      [TEXT_SIZE_KEY]: "xl",
      [DISPLAY_KEY]: "more",
      [DEFAULT_LEVEL_KEY]: "L4",
    });
    expect(readPreferences()).toEqual({ textSize: "xl", display: "more", defaultLevel: "L4" });
  });

  it("모르는 값은 기본값으로 되돌린다", () => {
    // 저장소는 아무나 고칠 수 있다. 이상한 값이 들어와도 화면이 깨지면 안 된다.
    stubStorage({
      [TEXT_SIZE_KEY]: "huge",
      [DISPLAY_KEY]: "rainbow",
      [DEFAULT_LEVEL_KEY]: "L9",
    });
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

describe("writePreferences", () => {
  it("기본 단계를 다른 화면 설정과 함께 브라우저에 저장한다", () => {
    const stored: Record<string, string> = {};
    stubStorage(stored);

    writePreferences({ textSize: "l", display: "light", defaultLevel: "L3" });

    expect(stored).toEqual({
      [TEXT_SIZE_KEY]: "l",
      [DISPLAY_KEY]: "light",
      [DEFAULT_LEVEL_KEY]: "L3",
    });
  });

  it("저장소 쓰기가 막혀도 화면을 죽이지 않는다", () => {
    stubStorage({}, true);
    expect(() => writePreferences(DEFAULTS)).not.toThrow();
  });
});

describe("applyPreferences", () => {
  it("기본값이 아닌 설정만 속성으로 옮긴다", () => {
    stubStorage({});
    const attributes = stubDocument();
    applyPreferences({ ...DEFAULTS, textSize: "l", display: "more" });

    expect(attributes[TEXT_SIZE_ATTRIBUTE]).toBe("l");
    expect(attributes[CONTRAST_ATTRIBUTE]).toBe("more");
  });

  it("기본값이면 속성을 아예 붙이지 않는다", () => {
    /*
     * 이것이 하이드레이션 불일치를 막는 자리다. 서버는 `<html>`을 아무 속성 없이 그리므로,
     * 기본값인 방문자에게 클라이언트가 `normal`을 써 넣으면 아무것도 바꾸지 않으면서
     * 서버가 보낸 것과 달라지기만 한다. CSS도 `[data-contrast="more"]`만 본다.
     */
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const attributes = stubDocument();
    applyPreferences(DEFAULTS);

    expect(attributes[TEXT_SIZE_ATTRIBUTE]).toBeUndefined();
    expect(attributes[CONTRAST_ATTRIBUTE]).toBeUndefined();
  });

  it("설정을 되돌리면 붙였던 속성을 뗀다", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    const attributes = stubDocument();

    applyPreferences({ ...DEFAULTS, textSize: "xxl", display: "more" });
    expect(attributes[CONTRAST_ATTRIBUTE]).toBe("more");

    applyPreferences({ ...DEFAULTS, display: "light" });
    expect(attributes[TEXT_SIZE_ATTRIBUTE]).toBeUndefined();
    expect(attributes[CONTRAST_ATTRIBUTE]).toBeUndefined();
  });

  it("기본 모드는 시스템 설정을 따르지 않는다", () => {
    // 시스템이 고대비여도 사용자가 "기본"을 골랐으면 밝은 화면이어야 한다.
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const attributes = stubDocument();
    applyPreferences({ ...DEFAULTS, display: "light" });

    expect(attributes[CONTRAST_ATTRIBUTE]).toBeUndefined();
  });

  it("시스템 설정을 고르면 운영체제를 따라간다", () => {
    vi.stubGlobal("window", { matchMedia: () => ({ matches: true }) });
    const attributes = stubDocument();
    applyPreferences(DEFAULTS);

    expect(attributes[CONTRAST_ATTRIBUTE]).toBe("more");
  });
});

describe("PREFERENCES_SCRIPT", () => {
  it("저장소 키와 속성 이름을 상수에서 가져온다", () => {
    // 스크립트에 문자열을 다시 적으면 한쪽만 바뀐 채로 조용히 동작을 멈춘다.
    expect(PREFERENCES_SCRIPT).toContain(TEXT_SIZE_KEY);
    expect(PREFERENCES_SCRIPT).toContain(DISPLAY_KEY);
    expect(PREFERENCES_SCRIPT).toContain(DEFAULT_LEVEL_KEY);
    expect(PREFERENCES_SCRIPT).toContain(TEXT_SIZE_ATTRIBUTE);
    expect(PREFERENCES_SCRIPT).toContain(CONTRAST_ATTRIBUTE);
  });

  it("저장소 접근 실패를 삼킨다 — 첫 페인트를 막으면 안 된다", () => {
    expect(PREFERENCES_SCRIPT).toContain("try{");
    expect(PREFERENCES_SCRIPT).toContain("catch(e){}");
  });

  it("기본값에는 아무 속성도 쓰지 않는다", () => {
    // 설정을 바꾼 적 없는 방문자에게 `<html>`이 서버가 보낸 그대로 남아야
    // 하이드레이션 불일치가 아예 생기지 않는다.
    expect(PREFERENCES_SCRIPT).not.toContain('"normal"');
  });

  it("문서 뷰어에 단계 쿼리가 없을 때만 저장된 기본 단계로 옮긴다", () => {
    expect(PREFERENCES_SCRIPT).toContain("/^\\/(case|doc)\\/[^/]+\\/?$/");
    expect(PREFERENCES_SCRIPT).toContain('!u.searchParams.has("level")');
    expect(PREFERENCES_SCRIPT).toContain("location.replace(u.pathname+u.search+u.hash)");
  });

  it.each([
    ["https://example.test/case/2023%EB%8B%A4287663", "/case/2023%EB%8B%A4287663?level=L4"],
    ["https://example.test/doc/my-doc?again=1#original", "/doc/my-doc?again=1&level=L4#original"],
  ])("첫 페인트 전에 %s를 저장된 단계 주소로 옮긴다", (href, expected) => {
    const replaced: string[] = [];
    const current = new URL(href);
    const location = {
      href,
      pathname: current.pathname,
      replace: (next: string) => replaced.push(next),
    };

    vm.runInNewContext(PREFERENCES_SCRIPT, {
      URL,
      document: { documentElement: { removeAttribute: vi.fn(), setAttribute: vi.fn() } },
      localStorage: { getItem: (key: string) => (key === DEFAULT_LEVEL_KEY ? "L4" : null) },
      location,
      matchMedia: () => ({ matches: false }),
    });

    expect(replaced).toEqual([expected]);
  });

  it.each([
    "https://example.test/case/2023%EB%8B%A4287663?level=L2",
    "https://example.test/settings",
  ])("명시한 단계나 뷰어 밖의 주소 %s는 바꾸지 않는다", (href) => {
    const replaced: string[] = [];
    const current = new URL(href);
    const location = {
      href,
      pathname: current.pathname,
      replace: (next: string) => replaced.push(next),
    };

    vm.runInNewContext(PREFERENCES_SCRIPT, {
      URL,
      document: { documentElement: { removeAttribute: vi.fn(), setAttribute: vi.fn() } },
      localStorage: { getItem: (key: string) => (key === DEFAULT_LEVEL_KEY ? "L4" : null) },
      location,
      matchMedia: () => ({ matches: false }),
    });

    expect(replaced).toEqual([]);
  });
});
