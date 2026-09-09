import { browserSupportMajors } from "@/lib/browser-support.generated";

type BrowserFamily = "chrome" | "edgehtml" | "firefox" | "ie" | "ios-safari" | "other" | "safari";

type BrowserSupportReason = "legacy" | "outdated" | "unlisted";

type BrowserSupportDecision =
  | { status: "supported"; family: BrowserFamily; major: number }
  | {
      status: "unsupported";
      family: BrowserFamily;
      major: number | null;
      reason: BrowserSupportReason;
    }
  | { status: "unknown" };

const BOT_USER_AGENT = /bot\b|crawler|spider|slurp|bingpreview|facebookexternalhit/i;
const IOS_DEVICE = /iPhone|iPad|iPod/;
const IPAD_DESKTOP_USER_AGENT = /Macintosh.*Mobile\//;
const IOS_VERSION = /(?:CPU (?:iPhone )?OS|CPU OS) (\d+)[._]/;
const SAFARI_VERSION = /Version\/(\d+)[._]/;
const MSIE_VERSION = /MSIE\s+(\d+)/;
const TRIDENT_VERSION = /Trident\/.*rv:(\d+)/;
const EDGEHTML_VERSION = /\bEdge\/(\d+)/;
const CHROME_IOS_VERSION = /CriOS\/(\d+)/;
const FIREFOX_IOS_VERSION = /FxiOS\/(\d+)/;
const FIREFOX_VERSION = /Firefox\/(\d+)/;
const CHROMIUM_VERSION = /(?:Chrome|Chromium)\/(\d+)/;
const SAFARI_TOKEN = /Safari\//;
const VERSION_TOKEN = /Version\//;
const MOZILLA_TOKEN = /Mozilla\//;

function majorFrom(userAgent: string, pattern: RegExp): number | null {
  const value = pattern.exec(userAgent)?.[1];
  if (!value) {
    return null;
  }
  const major = Number.parseInt(value, 10);
  return Number.isFinite(major) ? major : null;
}

function decideVersion(
  family: BrowserFamily,
  major: number | null,
  supportedMajors: readonly number[],
): BrowserSupportDecision {
  if (major === null) {
    return { status: "unsupported", family, major, reason: "unlisted" };
  }

  const newestKnown = supportedMajors[0] ?? major;
  if (supportedMajors.includes(major) || major > newestKnown) {
    return { status: "supported", family, major };
  }

  return { status: "unsupported", family, major, reason: "outdated" };
}

function isIos(userAgent: string): boolean {
  return IOS_DEVICE.test(userAgent) || IPAD_DESKTOP_USER_AGENT.test(userAgent);
}

function iosMajor(userAgent: string): number | null {
  return majorFrom(userAgent, IOS_VERSION) ?? majorFrom(userAgent, SAFARI_VERSION);
}

function unknownOrUnlisted(userAgent: string): BrowserSupportDecision {
  return MOZILLA_TOKEN.test(userAgent)
    ? { status: "unsupported", family: "other", major: null, reason: "unlisted" }
    : { status: "unknown" };
}

function legacyBrowser(userAgent: string): BrowserSupportDecision | null {
  const ieMajor = majorFrom(userAgent, MSIE_VERSION) ?? majorFrom(userAgent, TRIDENT_VERSION);
  if (ieMajor !== null) {
    return { status: "unsupported", family: "ie", major: ieMajor, reason: "legacy" };
  }

  const edgeHtmlMajor = majorFrom(userAgent, EDGEHTML_VERSION);
  if (edgeHtmlMajor === null) {
    return null;
  }
  return {
    status: "unsupported",
    family: "edgehtml",
    major: edgeHtmlMajor,
    reason: "legacy",
  };
}

function iosBrowser(userAgent: string): BrowserSupportDecision {
  const systemDecision = decideVersion(
    "ios-safari",
    iosMajor(userAgent),
    browserSupportMajors.iosSafari,
  );
  if (systemDecision.status === "unsupported") {
    return systemDecision;
  }

  const chromeMajor = majorFrom(userAgent, CHROME_IOS_VERSION);
  if (chromeMajor !== null) {
    return decideVersion("chrome", chromeMajor, browserSupportMajors.chrome);
  }

  const firefoxMajor = majorFrom(userAgent, FIREFOX_IOS_VERSION);
  if (firefoxMajor !== null) {
    return decideVersion("firefox", firefoxMajor, browserSupportMajors.firefox);
  }

  if (SAFARI_TOKEN.test(userAgent) || VERSION_TOKEN.test(userAgent)) {
    return systemDecision;
  }
  return unknownOrUnlisted(userAgent);
}

function desktopBrowser(userAgent: string): BrowserSupportDecision {
  const firefoxMajor = majorFrom(userAgent, FIREFOX_VERSION);
  if (firefoxMajor !== null) {
    return decideVersion("firefox", firefoxMajor, browserSupportMajors.firefox);
  }

  /* Chromium Edge·Opera·Samsung Internet도 엔진 기준인 Chrome 토큰으로 판정한다. */
  const chromeMajor = majorFrom(userAgent, CHROMIUM_VERSION);
  if (chromeMajor !== null) {
    return decideVersion("chrome", chromeMajor, browserSupportMajors.chrome);
  }

  if (SAFARI_TOKEN.test(userAgent)) {
    return decideVersion(
      "safari",
      majorFrom(userAgent, SAFARI_VERSION),
      browserSupportMajors.safari,
    );
  }

  return unknownOrUnlisted(userAgent);
}

/**
 * User-Agent는 사용자가 바꿀 수 있으므로 보안 경계가 아니다. 여기서는 낡은 엔진에 깨진
 * 화면을 보내지 않고 업데이트 안내로 연결하는 용도로만 쓴다.
 *
 * 버전 표는 `.browserslistrc`에서 생성된다. 알려진 최신 버전보다 큰 번호는 차단하지 않아
 * caniuse 데이터 갱신과 새 브라우저 배포 사이에 정상 이용자를 막지 않는다.
 */
function browserSupportForUserAgent(rawUserAgent: string | null): BrowserSupportDecision {
  const userAgent = rawUserAgent?.trim();
  if (!userAgent || BOT_USER_AGENT.test(userAgent)) {
    return { status: "unknown" };
  }

  const legacy = legacyBrowser(userAgent);
  if (legacy) {
    return legacy;
  }
  return isIos(userAgent) ? iosBrowser(userAgent) : desktopBrowser(userAgent);
}

export {
  browserSupportForUserAgent,
  type BrowserFamily,
  type BrowserSupportDecision,
  type BrowserSupportReason,
};
