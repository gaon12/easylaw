"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { upload } from "@/lib/strings";
import { createUpload, type UploadState } from "./actions";
import styles from "./page.module.css";

/**
 * 업로드 폼. `PAGES.md` §4
 *
 * `useActionState`를 쓰는 이유는 하나다 — **실패했을 때 붙여 넣은 내용을 잃지 않기 위해서.**
 * 판결문은 길다. 오류 한 번에 처음부터 다시 붙여 넣게 하면 두 번째 시도는 없다.
 * 자바스크립트가 없어도 폼은 그대로 제출되고, 서버가 같은 상태를 그려 돌려준다.
 */
function UploadForm() {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(createUpload, {});
  const message = state.error === undefined ? undefined : upload.errors[state.error];

  return (
    <form action={formAction}>
      <Card className={styles.form}>
        {message === undefined ? null : (
          // 오류는 폼 맨 위에 둔다. 제출 버튼 옆에만 두면 긴 폼에서는 보이지 않는다.
          <div aria-live="polite" role="alert">
            <Alert title={message} tone="danger" />
          </div>
        )}

        <label className={styles.field}>
          <span className={styles.label}>{upload.textLabel}</span>
          <textarea
            className={styles.textarea}
            defaultValue={state.text}
            name="text"
            placeholder={upload.textPlaceholder}
            rows={14}
          />
        </label>

        {/* 점선 드롭존(`DESIGN.md` §6 `file-upload`). 라벨이 입력을 감싸 전체가 클릭 영역이 된다. */}
        <label className={styles.dropzone}>
          <span className={styles.dropzoneLabel}>{upload.fileLabel}</span>
          <input
            accept=".pdf,application/pdf,.txt,text/plain"
            className={styles.file}
            name="file"
            type="file"
          />
          <span className={styles.hint}>{upload.fileHint}</span>
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>{upload.titleLabel}</span>
            <input
              autoComplete="off"
              className={styles.input}
              name="title"
              placeholder={upload.titlePlaceholder}
              type="text"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>{upload.caseNoLabel}</span>
            <input
              autoComplete="off"
              className={styles.input}
              name="caseNo"
              placeholder={upload.caseNoPlaceholder}
              type="text"
            />
          </label>
        </div>

        <label className={styles.field}>
          <span className={styles.label}>{upload.retentionLabel}</span>
          <select className={styles.select} defaultValue={upload.retentionDefault} name="retention">
            {upload.retentionOrder.map((key) => (
              <option key={key} value={key}>
                {upload.retentionOptions[key]}
              </option>
            ))}
          </select>
        </label>

        <Button disabled={pending} size="l" type="submit">
          {pending ? upload.submitting : upload.submit}
        </Button>
      </Card>
    </form>
  );
}

export { UploadForm };
