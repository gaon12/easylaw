import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { PreferencesSync } from "@/components/preferences-sync";
import { PREFERENCES_SCRIPT } from "@/lib/preferences";
import { site } from "@/lib/strings";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: `${site.name} — ${site.tagline}`,
    template: `%s · ${site.name}`,
  },
  description: site.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/**
 * 문서 뼈대. **셸(헤더·푸터)은 여기 없다.**
 *
 * 헤더와 푸터는 *서비스*의 것이지 문서의 것이 아니다. 설치 마법사는 다른 셸을 쓰고,
 * 그래서 각 라우트 그룹이 자기 셸을 고른다(`(main)/layout.tsx`, `setup/layout.tsx`).
 * 여기서 셸을 그리면 설치 화면에도 서비스 메뉴가 따라붙는데, 그 메뉴는 설치가 끝나기
 * 전에는 전부 `/setup`으로 되튕겨 아무 데도 가지 못한다.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  /*
   * 인라인 스크립트에 붙일 표(nonce). `proxy.ts`가 요청마다 새로 만들어 헤더에 담아 준다.
   * 이 값이 없으면 CSP가 이 스크립트를 막고, 그러면 화면 설정이 첫 페인트에 적용되지 않는다.
   */
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    /*
     * `suppressHydrationWarning`은 **이 태그 한 겹에만** 걸린다(자식에는 걸리지 않는다).
     *
     * 위의 인라인 스크립트가 하이드레이션 전에 `<html>`의 속성을 바꾸기 때문에 필요하다.
     * 서버는 브라우저에 저장된 설정을 알 수 없으므로 이 차이는 **의도한 것**이고, 고칠 수
     * 있는 종류의 불일치가 아니다. 기본값인 방문자에게는 스크립트가 아무 속성도 붙이지
     * 않으므로 애초에 차이가 없고, 이 선언은 설정을 바꾼 사람에게만 쓰인다.
     *
     * 쿠키에 담아 서버가 직접 그리는 방법도 있지만 "시스템 설정" 모드를 풀 수 없다 —
     * 운영체제의 고대비 설정은 서버가 모르고, CSS 미디어 쿼리로 대신하려면 토큰 오버라이드
     * 블록을 통째로 복사해야 한다(`tokens.css`가 금지한다).
     */
    <html lang="ko" suppressHydrationWarning={true}>
      <head>
        {/*
          화면 설정을 첫 페인트 전에 적용한다. 없으면 밝은 화면이 한 번 그려진 뒤
          어두운 화면으로 바뀌는데, 고대비 모드를 쓰는 사람에게 그 번쩍임은 불편이 아니라
          통증에 가깝다. 이 자리에서만 인라인 스크립트를 쓴다.
        */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 코드에서 만든 고정 문자열이고 사용자 입력이 섞이지 않는다. 첫 페인트 전에 실행되어야 해서 다른 방법이 없다. */}
        {/* biome-ignore lint/style/useNamingConvention: `__html`은 React가 정한 이름이라 바꿀 수 없다. */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} nonce={nonce} />
      </head>
      <body>
        <PreferencesSync />
        {children}
      </body>
    </html>
  );
}
