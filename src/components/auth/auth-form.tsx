"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NICKNAME_MAX, NICKNAME_MIN, PASSWORD_MIN } from "@/lib/credentials";
import { auth } from "@/lib/strings";
import type { AuthState } from "@/server/auth-actions";
import styles from "./auth-form.module.css";

type AuthAction = (previous: AuthState, formData: FormData) => Promise<AuthState>;

interface AuthFormProps {
  action: AuthAction;
  submitLabel: string;
  submittingLabel: string;
  /** 가입 폼은 새 비밀번호를, 로그인 폼은 저장된 비밀번호를 받는다. */
  mode: "signup" | "login";
}

/**
 * 가입·로그인 공용 폼. `PAGES.md` §17
 *
 * `useActionState`로 실패했을 때 이메일을 다시 채워 준다. **비밀번호는 채우지 않는다** —
 * 편의를 위해 서버에서 돌려보내면 그 값이 HTML에 실린다. 다시 입력하는 수고가
 * 비밀번호가 화면 소스에 남는 것보다 낫다.
 *
 * `autoComplete`을 정확히 준다. 브라우저 비밀번호 관리자가 제대로 동작해야 사람들이
 * 길고 다른 비밀번호를 쓴다 — 그게 어떤 복잡도 규칙보다 실제로 안전하다.
 */
function AuthForm({ action, submitLabel, submittingLabel, mode }: AuthFormProps) {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(action, {});
  const message = state.problem === undefined ? undefined : auth.errors[state.problem];

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

        {mode === "signup" ? (
          <label className={styles.field}>
            <span className={styles.label}>{auth.nicknameLabel}</span>
            <input
              autoComplete="nickname"
              className={styles.input}
              defaultValue={state.nickname}
              maxLength={NICKNAME_MAX}
              minLength={NICKNAME_MIN}
              name="nickname"
              placeholder={auth.nicknamePlaceholder}
              required={true}
              type="text"
            />
            <span className={styles.hint}>{auth.nicknameHint(NICKNAME_MIN, NICKNAME_MAX)}</span>
          </label>
        ) : null}

        <label className={styles.field}>
          <span className={styles.label}>{auth.passwordLabel}</span>
          <input
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            className={styles.input}
            minLength={mode === "signup" ? PASSWORD_MIN : undefined}
            name="password"
            required={true}
            type="password"
          />
          {mode === "signup" ? (
            <span className={styles.hint}>{auth.passwordHint(PASSWORD_MIN)}</span>
          ) : null}
        </label>

        <Button disabled={pending} size="l" type="submit">
          {pending ? submittingLabel : submitLabel}
        </Button>
      </Card>
    </form>
  );
}

export { AuthForm };
