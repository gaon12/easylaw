"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { data as strings, upload as uploadStrings } from "@/lib/strings";
import { changeRetention, type DataState } from "@/server/data-actions";
import styles from "./page.module.css";

/**
 * 문서 하나의 보관 기간을 바꾼다. `PAGES.md` §17
 *
 * 지금까지 보관 기간은 **올릴 때 한 번** 정하면 끝이었다. 7일로 올려 둔 사건이 길어지면
 * 다시 올리는 수밖에 없었다.
 *
 * 되돌릴 수 있는 동작이라 비밀번호를 묻지 않는다 — 언제든 다시 바꾸면 된다.
 *
 * 선택지 이름은 **업로드 화면과 같은 것을 쓴다**. 같은 것을 고르는데 말이 다르면
 * 다른 것으로 읽힌다.
 *
 * **자바스크립트 없이도 제출된다.** 스크립트가 있으면 "바꿨어요"가 그 자리에 붙을 뿐이다.
 */
function RetentionForm({ docId, label }: { docId: string; label: string }) {
  const [state, formAction, pending] = useActionState<DataState, FormData>(changeRetention, {});
  const selectId = `retention-${docId}`;

  return (
    <form action={formAction} className={styles.retentionForm}>
      <input name="docId" type="hidden" value={docId} />

      {/* 지금 기한은 글로 적는다. select로 되돌릴 수 없는 이유는 `strings.ts`에 적었다. */}
      <p className={styles.docMeta}>{label}</p>

      <div className={styles.retentionRow}>
        <label className="sr-only" htmlFor={selectId}>
          {uploadStrings.retentionLabel}
        </label>
        <select
          className={styles.select}
          defaultValue=""
          id={selectId}
          name="retention"
          required={true}
        >
          <option disabled={true} value="">
            {strings.retentionPlaceholder}
          </option>
          {uploadStrings.retentionOrder.map((choice) => (
            <option key={choice} value={choice}>
              {uploadStrings.retentionOptions[choice]}
            </option>
          ))}
        </select>

        <Button disabled={pending} size="s" type="submit" variant="secondary">
          {strings.retentionSave}
        </Button>
      </div>

      {state.done === "retention" ? (
        <p aria-live="polite" className={styles.saved}>
          {strings.retentionSaved}
        </p>
      ) : null}
    </form>
  );
}

export { RetentionForm };
