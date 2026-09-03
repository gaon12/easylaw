"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { data as strings } from "@/lib/strings";
import { type DataState, deleteAllDocs, deleteMyAccount } from "@/server/data-actions";
import styles from "./page.module.css";

/**
 * 되돌릴 수 없는 동작. `PAGES.md` §17
 *
 * **비밀번호를 다시 받는다.** 확인 문구를 받아 적게 하는 방법은 손이 미끄러지는 것만
 * 막는다. 잠기지 않은 화면 앞에 남이 잠깐 앉는 경우까지 막으려면 열쇠를 다시 물어야 한다.
 * 이유는 `server/data-actions.ts`에 적었다.
 *
 * **자바스크립트 없이도 제출된다.** 스크립트가 있으면 결과 알림과 눌린 동안의 표시가
 * 붙을 뿐이다 — 자기 자료를 지우는 일이 스크립트에 달려 있으면 안 된다.
 */
function DangerForm({
  action,
  cta,
  heading,
  body,
}: {
  action: "docs" | "account";
  cta: string;
  heading: string;
  body: string;
}) {
  const [state, formAction, pending] = useActionState<DataState, FormData>(
    action === "docs" ? deleteAllDocs : deleteMyAccount,
    {},
  );

  return (
    <form action={formAction}>
      <Card as="section" className={styles.danger}>
        <h2 className={styles.sectionTitle}>{heading}</h2>
        <p className={styles.body}>{body}</p>
        <p className={styles.warning}>{strings.irreversible}</p>

        {state.problem === "password_wrong" ? (
          <div aria-live="polite" role="alert">
            <Alert title={strings.passwordWrong} tone="danger" />
          </div>
        ) : null}
        {state.done === "docs_deleted" ? (
          <div aria-live="polite">
            <Alert title={strings.deleteDocsDone(state.count ?? 0)} tone="success" />
          </div>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>{strings.passwordLabel}</span>
          <input
            autoComplete="current-password"
            className={styles.input}
            name="password"
            required={true}
            type="password"
          />
        </label>

        {/* 삭제 버튼은 `/doc`과 같은 tertiary다. 화면마다 다르면 같은 무게의 일로 안 읽힌다. */}
        <Button disabled={pending} size="m" type="submit" variant="tertiary">
          {cta}
        </Button>
      </Card>
    </form>
  );
}

export { DangerForm };
