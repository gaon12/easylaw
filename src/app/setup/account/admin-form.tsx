"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { PASSWORD_MIN } from "@/lib/credentials";
import { auth, setup } from "@/lib/strings";
import { createAdmin, type SetupState } from "@/server/setup-actions";
import styles from "../setup-steps.module.css";

/** 설치 단계에서만 나오는 문제(이미 관리자가 있음)와 일반 가입 문제를 함께 다룬다. */
function problemMessage(problem: SetupState["problem"]): string | undefined {
  if (problem === undefined) {
    return;
  }
  if (problem === "already_done") {
    return setup.closedBody;
  }
  return auth.errors[problem];
}

/**
 * 1단계 폼 — 관리자 계정.
 *
 * 가입 폼과 겉모습이 같지만 컴포넌트를 나눴다. 이 폼은 **관리자를 만드는 폼**이고,
 * 나중에 가입 폼에 약관 동의 같은 것이 붙어도 여기에는 붙지 않아야 한다.
 */
function AdminForm() {
  const [state, formAction, pending] = useActionState<SetupState, FormData>(createAdmin, {});
  const message = problemMessage(state.problem);

  return (
    <form action={formAction} className={styles.form}>
      {message === undefined ? null : (
        <p aria-live="polite" className={styles.error} role="alert">
          {message}
        </p>
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
          autoComplete="new-password"
          className={styles.input}
          minLength={PASSWORD_MIN}
          name="password"
          required={true}
          type="password"
        />
        <span className={styles.hint}>{auth.passwordHint(PASSWORD_MIN)}</span>
      </label>

      <Button disabled={pending} size="l" type="submit">
        {pending ? setup.accountSubmitting : setup.accountSubmit}
      </Button>
    </form>
  );
}

export { AdminForm };
