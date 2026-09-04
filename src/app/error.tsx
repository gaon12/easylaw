"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { PaperFigure } from "@/components/ui/paper-figure";
import { errors } from "@/lib/strings";
import styles from "./status.module.css";

/**
 * 실행 중 오류. `PAGES.md` §1
 *
 * Next 16에서 재시도 함수의 이름은 `retry`다(15까지는 `reset`이었다).
 *
 * **셸(헤더·푸터)을 두르지 않는다.** 두 가지 이유가 있다.
 * 1. 이 파일은 클라이언트 컴포넌트인데, 셸은 세션을 읽으려고 데이터베이스에 닿는다.
 *    두르면 서버 코드가 브라우저 번들로 딸려 들어간다(`server-only`가 빌드를 실패시킨다).
 * 2. 오류가 셸에서 났을 수도 있다. 같은 셸로 오류 화면을 그리면 그 화면도 함께 넘어진다.
 *    `global-error.tsx`가 아무 컴포넌트도 쓰지 않는 것과 같은 이유다.
 *
 * **오류 번호(digest)를 숨기지 않고 보여 준다.** 서버 컴포넌트의 오류 메시지는 운영에서
 * 감춰지므로 사용자가 전할 수 있는 것은 이 번호뿐이고, 이 번호가 있어야 서버 기록에서
 * 같은 오류를 찾을 수 있다. 보이지 않으면 문의는 "안 돼요" 한 줄로 끝난다.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <div className={styles.page}>
      <PaperFigure mood="hurt" />
      <h1 className={styles.title}>{errors.genericTitle}</h1>
      <p className={styles.body}>{errors.genericBody}</p>

      {error.digest === undefined ? null : (
        <p className={styles.code}>
          <span className={styles.codeValue}>{errors.errorCode(error.digest)}</span>
          <span className={styles.codeHint}>{errors.errorCodeHint}</span>
        </p>
      )}

      <div className={styles.actions}>
        <Button onClick={retry} size="m" type="button">
          {errors.retry}
        </Button>
        <ButtonLink href="/" size="m" variant="tertiary">
          {errors.backHome}
        </ButtonLink>
      </div>
    </div>
  );
}
