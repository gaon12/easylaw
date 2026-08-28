import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ContrastSync } from "@/components/contrast-sync";
import { SiteShell } from "@/components/site-shell";
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
      <body>
        <ContrastSync />
        <SiteShell>{children}</SiteShell>
      </body>
    </html>
  );
}
