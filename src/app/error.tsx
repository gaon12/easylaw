"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { ServiceCharacter } from "@/components/ui/service-character";
import { errors } from "@/lib/strings";
import { ErrorTrace } from "./error-trace";
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
 * Next digest는 사용자에게 그대로 내지 않고 짧은 Base58 번호로 바꾼다. 서버 기록에도
 * 같은 번호를 남겨 관리자가 원래 digest와 경로·원인을 함께 찾을 수 있게 한다.
 */
export default function ErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className={styles.viewport}>
      <section className={styles.panel}>
        <div className={styles.visual}>
          <ServiceCharacter character="female" className={styles.character} priority={true} />
        </div>
        <div className={styles.content}>
          <p className={styles.eyebrow}>{errors.genericEyebrow}</p>
          <h1 className={styles.title}>{errors.genericTitle}</h1>
          <p className={styles.body}>{errors.genericBody}</p>
          <ErrorTrace error={error} />
          <div className={styles.actions}>
            <Button onClick={retry} size="m" type="button">
              {errors.retry}
            </Button>
            <ButtonLink href="/" size="m" variant="tertiary">
              {errors.backHome}
            </ButtonLink>
          </div>
        </div>
      </section>
    </main>
  );
}
