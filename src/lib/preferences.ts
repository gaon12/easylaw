/**
 * 화면 설정. `DESIGN.md` §10 · `PAGES.md` §17
 *
 * 값은 **브라우저에만** 저장한다. 서버로 보내지 않는다 — 글자를 얼마나 크게 보는지는
 * 계정에 남길 일이 아니고, 로그인하지 않은 사람도 똑같이 쓸 수 있어야 한다.
 *
 * 적용은 `<html>`의 데이터 속성으로 한다. 인라인 스타일이 아니라 속성인 이유는
 * 실제 값(배율·색)을 `tokens.css` 한 곳에만 두기 위해서다. 두 곳에 두면 어긋난다.
 */

/** 글자 크기 5단. 배율은 `DESIGN.md` §10의 권장값. */
const TEXT_SIZES = ["s", "m", "l", "xl", "xxl"] as const;
type TextSize = (typeof TEXT_SIZES)[number];

/** 화면 표시 모드 3단. `system`은 운영체제의 `prefers-contrast`를 따른다. */
const DISPLAY_MODES = ["light", "more", "system"] as const;
type DisplayMode = (typeof DISPLAY_MODES)[number];

interface Preferences {
  readonly textSize: TextSize;
  readonly display: DisplayMode;
}

const DEFAULTS: Preferences = { textSize: "m", display: "system" };

const TEXT_SIZE_KEY = "easylaw:text-size";
/** 예전 이름. 대비 설정만 있던 시절의 값을 그대로 이어받는다. */
const DISPLAY_KEY = "easylaw:contrast";

const TEXT_SIZE_ATTRIBUTE = "data-text-size";
const CONTRAST_ATTRIBUTE = "data-contrast";

function isTextSize(value: string | null): value is TextSize {
  return value !== null && (TEXT_SIZES as readonly string[]).includes(value);
}

function isDisplayMode(value: string | null): value is DisplayMode {
  return value !== null && (DISPLAY_MODES as readonly string[]).includes(value);
}

/**
 * 예전 값 이어받기.
 *
 * 대비 설정만 있던 시절에는 `normal`/`more`를 저장했다. 그때 `normal`을 고른 사람은
 * "시스템 설정"이 아니라 "기본(밝은 배경)"을 고른 것이므로 `light`로 옮긴다.
 * 이 한 줄이 없으면 그 사람들의 설정이 조용히 초기화된다.
 */
function migrateDisplay(stored: string | null): DisplayMode | undefined {
  if (stored === "normal") {
    return "light";
  }
  return isDisplayMode(stored) ? stored : undefined;
}

/**
 * 저장된 설정을 읽는다.
 *
 * 사생활 보호 모드처럼 저장소 접근이 막힌 곳에서는 예외가 난다. 화면이 죽는 것보다
 * 기본값으로 도는 편이 낫다.
 */
function readPreferences(): Preferences {
  try {
    const textSize = window.localStorage.getItem(TEXT_SIZE_KEY);
    const display = window.localStorage.getItem(DISPLAY_KEY);
    return {
      textSize: isTextSize(textSize) ? textSize : DEFAULTS.textSize,
      display: migrateDisplay(display) ?? DEFAULTS.display,
    };
  } catch {
    return DEFAULTS;
  }
}

function writePreferences(preferences: Preferences): void {
  try {
    window.localStorage.setItem(TEXT_SIZE_KEY, preferences.textSize);
    window.localStorage.setItem(DISPLAY_KEY, preferences.display);
  } catch {
    // 저장은 못 해도 이번 화면에는 적용된다. 그 편이 아무 일도 일어나지 않는 것보다 낫다.
  }
}

/** 시스템이 고대비를 원하는가. */
function systemPrefersMore(): boolean {
  return window.matchMedia("(prefers-contrast: more)").matches;
}

/** 고른 모드를 실제 화면 값으로 옮긴다. `system`일 때만 운영체제에 물어본다. */
function resolveContrast(display: DisplayMode): "more" | "normal" {
  if (display === "system") {
    return systemPrefersMore() ? "more" : "normal";
  }
  return display === "more" ? "more" : "normal";
}

/** 설정을 문서에 적용한다. 저장은 하지 않는다 — 미리보기와 저장을 따로 다루기 위해서다. */
function applyPreferences(preferences: Preferences): void {
  const root = document.documentElement;
  root.setAttribute(TEXT_SIZE_ATTRIBUTE, preferences.textSize);
  root.setAttribute(CONTRAST_ATTRIBUTE, resolveContrast(preferences.display));
}

/**
 * 첫 페인트 **전에** 실행되는 스크립트.
 *
 * 없으면 밝은 화면이 한 번 그려진 뒤 어두운 화면으로 바뀐다. 고대비 모드를 쓰는 사람에게
 * 그 번쩍임은 불편이 아니라 통증에 가깝다. 글자 크기도 마찬가지로 한 번 작게 그려졌다
 * 커지면 읽던 위치를 잃는다.
 *
 * 키와 속성 이름을 문자열로 다시 적지 않고 위 상수를 끼워 넣는다 — 두 곳에 적으면
 * 한쪽만 바뀐 채로 조용히 동작을 멈춘다.
 *
 * 이 코드는 번들러를 거치지 않고 그대로 실행되므로 옛 문법만 쓴다.
 */
const PREFERENCES_SCRIPT = `(function(){try{
var r=document.documentElement;
var t=localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)});
if(${JSON.stringify(TEXT_SIZES)}.indexOf(t)>=0){r.setAttribute(${JSON.stringify(TEXT_SIZE_ATTRIBUTE)},t);}
var d=localStorage.getItem(${JSON.stringify(DISPLAY_KEY)});
var more=d==="more"||((d===null||d==="system")&&matchMedia("(prefers-contrast: more)").matches);
r.setAttribute(${JSON.stringify(CONTRAST_ATTRIBUTE)},more?"more":"normal");
}catch(e){}})();`;

export {
  applyPreferences,
  CONTRAST_ATTRIBUTE,
  DEFAULTS,
  DISPLAY_KEY,
  DISPLAY_MODES,
  PREFERENCES_SCRIPT,
  readPreferences,
  TEXT_SIZE_ATTRIBUTE,
  TEXT_SIZE_KEY,
  TEXT_SIZES,
  writePreferences,
};
export type { DisplayMode, Preferences, TextSize };
