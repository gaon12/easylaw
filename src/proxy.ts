import { type NextRequest, NextResponse } from "next/server";

/**
 * 보안 헤더. `CONVENTIONS.md` §7
 *
 * §7은 "**CSP를 설정하고 인라인 스크립트를 허용하지 않는다**"고 적어 두었는데 그동안
 * 헤더가 하나도 없었다. 판결문과 개인정보를 다루는 화면에서 XSS 한 번은 그 문서를 통째로
 * 밖으로 보내는 일이라, 이 자리가 비어 있는 것은 그대로 위험이다.
 *
 * **nonce 방식을 쓴다.** 우리 화면에는 인라인 스크립트가 하나 있고(화면 설정을 첫 페인트
 * 전에 적용하는 것 — `layout.tsx`), Next 자신도 RSC 페이로드를 인라인으로 넣는다.
 * `'unsafe-inline'`으로 열면 CSP가 하는 일이 거의 없어지므로, 요청마다 난수를 만들어
 * 그 스크립트에만 표를 준다. Next가 자기 스크립트에는 이 nonce를 알아서 붙인다.
 *
 * 모든 화면이 이미 요청 시점 렌더다(헤더가 세션 쿠키를 읽는다). nonce는 그때만 쓸 수 있다.
 */

/*
 * 개발 중인가. 프록시는 Node 런타임이 아니라 `node:process`를 가져올 수 없고,
 * `process.env.NODE_ENV`는 빌드 시점에 값이 박히는 특별한 형태라 여기서 읽을 수 있다.
 */
// biome-ignore lint/correctness/noProcessGlobal: 프록시 런타임에는 node:process가 없다. Next가 이 표현을 빌드 시점에 값으로 바꾼다.
// biome-ignore lint/style/noProcessEnv: 같은 이유. 이 파일은 `lib/env.ts`(부팅 설정)와 달리 DB를 열기 전에 도는 자리다.
const IS_DEV = process.env.NODE_ENV === "development";

/** `unsafe-eval`은 개발 중 React가 오류 스택을 복원하는 데 쓴다. 운영에는 넣지 않는다. */
function scriptSrc(nonce: string, isDev: boolean): string {
  const base = `'self' 'nonce-${nonce}' 'strict-dynamic'`;
  return isDev ? `${base} 'unsafe-eval'` : base;
}

/**
 * 정책 한 줄.
 *
 * - `connect-src 'self'` — 진행 표시(SSE)가 같은 출처다. 법제처·AI 호출은 **서버에서** 나가므로
 *   브라우저 정책과 무관하다.
 * - `img-src`에 `data:`를 둔다 — 아바타(DiceBear)를 우리가 직접 그려 SVG로 내보낸다.
 * - `font-src 'self'` — 글꼴을 자체 호스팅한다(`69f501c`). 외부 글꼴 CDN을 쓰지 않는다.
 * - `style-src-attr 'unsafe-inline'` — 전역 오류 화면은 CSS 파일이 실리지 않은 상황에서도
 *   읽혀야 해서 style 속성을 쓴다(`global-error.tsx`). 그 자리 하나 때문에 속성만 연다.
 * - `frame-ancestors 'none'` — 판결문 화면을 남의 페이지 안에 끼워 넣지 못하게 한다.
 */
function policy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src ${scriptSrc(nonce, isDev)}`,
    "style-src 'self'",
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** 프록시 뒤에서도 https인지 알아본다. HSTS를 http 응답에 붙이면 안 된다. */
function isHttps(request: NextRequest): boolean {
  return (
    request.headers.get("x-forwarded-proto") === "https" || request.nextUrl.protocol === "https:"
  );
}

/** 1년. HSTS는 https로 서비스할 때만 붙인다 — 사내망 http 설치를 잠가 버리면 안 된다. */
const HSTS = "max-age=31536000; includeSubDomains";

function proxy(request: NextRequest): NextResponse {
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const csp = policy(nonce, IS_DEV);

  /*
   * 요청 헤더에도 넣는다. Next가 렌더 중에 이 값을 읽어 자기 스크립트에 nonce를 붙이고,
   * 우리 레이아웃도 `x-nonce`로 같은 값을 받아 인라인 스크립트에 붙인다.
   */
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  // MIME 스니핑 금지. 업로드한 파일을 되돌려 주는 경로가 생길 때 특히 중요하다.
  response.headers.set("x-content-type-options", "nosniff");
  // 다른 사이트로 나갈 때 주소에 담긴 사건번호를 흘리지 않는다.
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  // 쓰지 않는 장치 권한은 아예 닫는다.
  response.headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  if (isHttps(request)) {
    response.headers.set("strict-transport-security", HSTS);
  }

  return response;
}

/**
 * 정적 파일과 프리페치는 건너뛴다. 글꼴·CSS·JS에는 CSP가 필요 없고, 프리페치까지 nonce를
 * 만들면 같은 화면에 두 개의 nonce가 생긴다.
 */
export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|fonts).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};

export { proxy };
