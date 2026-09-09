"use client";

import { useEffect } from "react";
import { errorFingerprint, publicErrorCode } from "@/lib/error-code";
import { errors, site } from "@/lib/strings";
import "./globals.css";

/**
 * 루트 레이아웃 자체가 깨졌을 때. `PAGES.md` §1
 *
 * 이 파일은 레이아웃을 **대체하므로** `<html>`과 `<body>`를 직접 그려야 한다.
 * 셸도 헤더도 없고, 그래서 여기서는 외부 자산이나 복잡한 컴포넌트를 쓰지 않는다 —
 * 무언가 더 불러오다가 그것마저 실패하면 사용자는 빈 화면을 본다.
 *
 * 여기까지 왔다는 것은 이미 무언가 크게 잘못됐다는 뜻이다. 할 일은 하나다:
 * 무슨 일이 났는지 알리고, 다시 해 볼 방법을 주는 것.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const code = publicErrorCode(errorFingerprint(error));
  useEffect(() => {
    fetch("/api/error-events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        digest: error.digest,
        name: error.name,
        message: error.message,
        stack: error.stack,
        path: window.location.pathname,
      }),
      keepalive: true,
    }).catch(() => undefined);
  }, [error]);
  return (
    <html lang="ko">
      <body>
        <title>{errors.genericTitle}</title>
        <main
          style={{
            width: "min(100% - 2rem, 680px)",
            margin: "min(12vh, 7rem) auto",
            padding: "clamp(2rem, 6vw, 4rem)",
            display: "grid",
            gap: "1.25rem",
            border: "1px solid #d8e1ee",
            borderRadius: "24px",
            background: "#fff",
            boxShadow: "0 18px 48px rgb(29 48 91 / 12%)",
          }}
        >
          <p style={{ margin: 0, color: "#345fa8", fontWeight: 800 }}>{site.name}</p>
          <h1 style={{ margin: 0, color: "#17233a", fontSize: "clamp(1.75rem, 5vw, 2.5rem)" }}>
            {errors.genericTitle}
          </h1>
          <p style={{ margin: 0, color: "#4e5967", lineHeight: 1.65 }}>{errors.genericBody}</p>
          <p style={{ margin: 0, padding: "1rem", borderRadius: "12px", background: "#f2f6fb" }}>
            {errors.errorCode(code)}
          </p>
          <button
            onClick={retry}
            style={{
              width: "fit-content",
              minHeight: "48px",
              padding: "0 1.25rem",
              border: 0,
              borderRadius: "10px",
              color: "#fff",
              background: "#1f5ca8",
              fontWeight: 800,
            }}
            type="button"
          >
            {errors.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
