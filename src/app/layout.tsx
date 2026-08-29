import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { PreferencesSync } from "@/components/preferences-sync";
import { SiteShell } from "@/components/site-shell";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/*
          화면 설정을 첫 페인트 전에 적용한다. 없으면 밝은 화면이 한 번 그려진 뒤
          어두운 화면으로 바뀌는데, 고대비 모드를 쓰는 사람에게 그 번쩍임은 불편이 아니라
          통증에 가깝다. 이 자리에서만 인라인 스크립트를 쓴다.
        */}
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: 코드에서 만든 고정 문자열이고 사용자 입력이 섞이지 않는다. 첫 페인트 전에 실행되어야 해서 다른 방법이 없다. */}
        {/* biome-ignore lint/style/useNamingConvention: `__html`은 React가 정한 이름이라 바꿀 수 없다. */}
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>
      <body>
        <PreferencesSync />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
