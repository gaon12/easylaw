"use client";

import { useActionState, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/lib/credentials";
import { account, auth } from "@/lib/strings";
import { type AccountState, changeNickname } from "@/server/account-actions";
import styles from "./page.module.css";

/** 아바타 미리보기 크기. 헤더(32px)보다 크게 보여 준다 — 고르는 화면이라 잘 보여야 한다. */
const PREVIEW_PX = 72;

/**
 * 닉네임 바꾸기.
 *
 * **아바타가 이름에서 나오므로 미리보기를 함께 둔다.** 이름을 바꾸면 그림도 바뀌는데,
 * 저장하고 나서야 알게 되면 되돌리러 다시 와야 한다.
 *
 * 미리보기는 타이핑에 따라 바뀌지만, **폼 자체는 자바스크립트 없이도 제출된다.**
 * 스크립트가 없으면 미리보기가 저장된 이름의 그림에 머무를 뿐이다.
 */
function NicknameForm({ current }: { current: string }) {
  const [state, formAction, pending] = useActionState<AccountState, FormData>(changeNickname, {});
  const [draft, setDraft] = useState(current);

  const preview = draft.trim().length > 0 ? draft.trim() : current;
  const message = state.problem === undefined ? undefined : auth.errors[state.problem];

  return (
    <form action={formAction}>
      <Card className={styles.form}>
        {message === undefined ? null : (
          <div aria-live="polite" role="alert">
            <Alert title={message} tone="danger" />
          </div>
        )}
        {state.saved === true ? (
          <div aria-live="polite">
            <Alert title={account.saved} tone="success" />
          </div>
        ) : null}

        <div className={styles.previewRow}>
          {/* biome-ignore lint/performance/noImgElement: 우리 라우트가 내주는 SVG다. 이유는 `site-shell.tsx`의 같은 주석에 적었다. */}
          <img
            alt=""
            className={styles.previewAvatar}
            height={PREVIEW_PX}
            src={`/avatar/${encodeURIComponent(preview)}`}
            width={PREVIEW_PX}
          />
          <p className={styles.previewNote}>{account.avatarNote}</p>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{auth.nicknameLabel}</span>
          <input
            autoComplete="nickname"
            className={styles.input}
            maxLength={NICKNAME_MAX}
            minLength={NICKNAME_MIN}
            name="nickname"
            onChange={(event) => setDraft(event.target.value)}
            placeholder={auth.nicknamePlaceholder}
            required={true}
            type="text"
            value={draft}
          />
          <span className={styles.hint}>{auth.nicknameHint(NICKNAME_MIN, NICKNAME_MAX)}</span>
        </label>

        <Button disabled={pending} size="m" type="submit">
          {pending ? account.saving : account.save}
        </Button>
      </Card>
    </form>
  );
}

export { NicknameForm };
