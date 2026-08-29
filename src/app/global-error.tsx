"use client";

import { errors, site } from "@/lib/strings";
import "./globals.css";

/**
 * 루트 레이아웃 자체가 깨졌을 때. `PAGES.md` §1
 *
 * 이 파일은 레이아웃을 **대체하므로** `<html>`과 `<body>`를 직접 그려야 한다.
 * 셸도 헤더도 없고, 그래서 여기서는 그림도 컴포넌트도 쓰지 않는다 —
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
  return (
    <html lang="ko">
      <body>
        <title>{errors.genericTitle}</title>
        <main
          style={{
            maxWidth: "520px",
            margin: "0 auto",
            padding: "4rem 1.5rem",
            display: "grid",
            gap: "1rem",
            justifyItems: "start",
          }}
        >
          <p style={{ fontWeight: 700 }}>{site.name}</p>
          <h1>{errors.genericTitle}</h1>
          <p>{errors.genericBody}</p>
          {error.digest === undefined ? null : <p>{errors.errorCode(error.digest)}</p>}
          <button onClick={retry} type="button">
            {errors.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
