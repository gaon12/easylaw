"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { auth, setup } from "@/lib/strings";
import { type SetupState, signInAdmin } from "@/server/setup-actions";
import styles from "../setup-steps.module.css";

/** 설치 단계에서만 나오는 문제(이미 설치가 끝남)와 일반 로그인 문제를 함께 다룬다. */
function problemMessage(problem: SetupState["problem"]): string | undefined {
  if (problem === undefined) {
    return;
  }
  return problem === "already_done" ? setup.closedBody : auth.errors[problem];
}

/**
 * 2단계 폼 — 이미 만든 관리자로 다시 들어오기.
 *
 * 관리자를 만드는 폼과 나눠 둔다. 같은 칸 두 개를 받지만 하는 일이 다르고,
 * 무엇보다 **여기에는 비밀번호 최소 길이 안내를 붙이지 않는다** — 이미 만든 계정에
 * 규칙을 다시 알리는 것은 도움이 아니라 소음이다.
 */
function SignInForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(signInAdmin, {});
  const message = problemMessage(state.problem);

  return (
    <form action={formAction}>
      <Card className={styles.form}>
        {message === undefined ? null : (
          <div aria-live="polite" role="alert">
            <Alert title={message} tone="danger" />
          </div>
        )}

        <label className={styles.field}>
          <span className={styles.label}>{auth.emailLabel}</span>
          <input
            autoComplete="email"
            className={styles.input}
            defaultValue={state.email}
            inputMode="email"
            name="email"
            placeholder={auth.emailPlaceholder}
            required={true}
            type="email"
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>{auth.passwordLabel}</span>
          <input
            autoComplete="current-password"
            className={styles.input}
            name="password"
            required={true}
            type="password"
          />
        </label>

        <Button disabled={pending} size="l" type="submit">
          {pending ? setup.accountSignInSubmitting : setup.accountSignInSubmit}
        </Button>
      </Card>
    </form>
  );
}

export { SignInForm };
