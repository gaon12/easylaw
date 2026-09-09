import type { BrowserFamily } from "@/lib/browser-support";

const DOWNLOADS = {
  edge: { name: "Microsoft Edge", href: "https://www.microsoft.com/edge/download" },
  chrome: { name: "Google Chrome", href: "https://www.google.com/chrome/" },
  firefox: { name: "Mozilla Firefox", href: "https://www.mozilla.org/firefox/new/" },
  safari: { name: "Safari", href: "https://support.apple.com/102665" },
} as const;

const UPGRADE_REQUIRED = 426;

const COPY = {
  legacy: {
    eyebrow: "지원이 끝난 브라우저",
    title: "최신 브라우저로 다시 열어 주세요",
    description:
      "Internet Explorer와 구형 Microsoft Edge(EdgeHTML)에서는 이지로의 문서와 접근성 기능이 올바르게 작동하지 않습니다.",
  },
  outdated: {
    eyebrow: "브라우저 업데이트 필요",
    title: "브라우저를 업데이트해 주세요",
    description:
      "현재 브라우저 버전은 이지로의 지원 범위보다 오래되어 문서가 깨지거나 일부 기능이 작동하지 않을 수 있습니다.",
  },
  unlisted: {
    eyebrow: "지원하지 않는 브라우저",
    title: "지원되는 브라우저로 열어 주세요",
    description: "이지로는 최신 Chrome 계열, Firefox, Safari에서 사용할 수 있습니다.",
  },
} as const;

type CopyKey = keyof typeof COPY;
type DownloadKey = keyof typeof DOWNLOADS;

const BROWSER_FAMILIES: readonly BrowserFamily[] = [
  "chrome",
  "edge",
  "edgehtml",
  "firefox",
  "ie",
  "ios-safari",
  "other",
  "safari",
];

function reasonFrom(request: Request): CopyKey {
  const reason = new URL(request.url).searchParams.get("reason");
  return reason === "legacy" || reason === "outdated" || reason === "unlisted"
    ? reason
    : "unlisted";
}

function familyFrom(request: Request): BrowserFamily {
  const family = new URL(request.url).searchParams.get("family") as BrowserFamily | null;
  return family !== null && BROWSER_FAMILIES.includes(family) ? family : "other";
}

function downloadsFor(reason: CopyKey, family: BrowserFamily): readonly DownloadKey[] {
  if (reason === "legacy") {
    return ["edge", "chrome", "firefox"];
  }
  if (reason !== "outdated") {
    return ["edge", "chrome", "firefox", "safari"];
  }

  if (family === "edge" || family === "chrome" || family === "firefox") {
    return [family];
  }
  if (family === "safari" || family === "ios-safari") {
    return ["safari"];
  }
  return ["edge", "chrome", "firefox", "safari"];
}

function browserLinks(downloads: readonly DownloadKey[]): string {
  return downloads
    .map((key) => DOWNLOADS[key])
    .map(
      ({ name, href }) => `
      <li class="browser-item">
        <a class="browser-link" href="${href}" rel="noopener noreferrer">${name} 최신 버전</a>
      </li>`,
    )
    .join("");
}

/** 오래된 엔진에서도 안내 자체는 읽혀야 하므로 React와 자바스크립트를 전혀 싣지 않는다. */
export function GET(request: Request): Response {
  const reason = reasonFrom(request);
  const family = familyFrom(request);
  const copy = COPY[reason];
  const links = browserLinks(downloadsFor(reason, family));
  const html = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>${copy.title} | 이지로</title>
    <link rel="stylesheet" href="/unsupported-browser.css">
  </head>
  <body>
    <main class="page">
      <p class="brand"><img class="brand-mark" src="/icon.svg" alt=""> 이지로</p>
      <section class="notice" aria-labelledby="page-title">
        <div class="character-wrap" aria-hidden="true">
          <picture>
            <source srcset="/media/characters/easylaw-guides-errors-v2-1200.webp" type="image/webp">
            <img class="characters" src="/media/characters/easylaw-guides-errors-v2-compat.png" alt="">
          </picture>
        </div>
        <div class="notice-copy">
          <p class="eyebrow">${copy.eyebrow}</p>
          <h1 id="page-title">${copy.title}</h1>
          <p class="description">${copy.description}</p>
          <p class="help">아래 공식 사이트에서 브라우저를 설치하거나 업데이트한 뒤 다시 접속해 주세요.</p>
          <ul class="browser-list">${links}</ul>
        </div>
      </section>
      <section class="policy" aria-labelledby="policy-title">
        <h2 id="policy-title">지원 범위</h2>
        <ul>
          <li>Chrome 계열 최근 2개 메이저 버전</li>
          <li>Firefox 최근 2개 메이저 버전과 현재 ESR</li>
          <li>macOS Safari 최근 3개 메이저 버전</li>
          <li>iPhone·iPad Safari 최근 3개 메이저 버전</li>
        </ul>
      </section>
    </main>
  </body>
</html>`;

  return new Response(html, {
    status: UPGRADE_REQUIRED,
    headers: {
      "cache-control": "private, no-store",
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
