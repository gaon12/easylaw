"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { doc, upload } from "@/lib/strings";
import { type ReplaceState, replaceDocRevision } from "./actions";
import styles from "./page.module.css";

function ReplaceDocumentForm({ docId }: { docId: string }) {
  const [state, formAction, pending] = useActionState<ReplaceState, FormData>(
    replaceDocRevision,
    {},
  );
  const error = state.error === undefined ? undefined : doc.replaceErrors[state.error];
  const success = state.success === undefined ? undefined : doc.replaceSuccess[state.success];

  return (
    <details className={styles.replace}>
      <summary className={styles.replaceSummary}>{doc.replaceTitle}</summary>
      <div className={styles.replaceBody}>
        <p className={styles.hint}>{doc.replaceBody}</p>
        <form action={formAction} className={styles.replaceForm}>
          <input name="docId" type="hidden" value={docId} />
          {error === undefined ? null : (
            <div aria-live="polite" role="alert">
              <Alert title={error} tone="danger" />
            </div>
          )}
          {success === undefined ? null : (
            <div aria-live="polite">
              <Alert title={success} tone="success" />
            </div>
          )}
          {state.error === "confirm_required" ? (
            <label className={styles.replaceConfirm}>
              <input name="confirmLongDocument" type="checkbox" value="on" />
              <span>{upload.confirmLong}</span>
            </label>
          ) : null}
          <label className={styles.replaceField}>
            <span className={styles.replaceLabel}>{doc.replaceTextLabel}</span>
            <textarea
              className={styles.replaceTextarea}
              defaultValue={state.text}
              name="text"
              placeholder={upload.textPlaceholder}
              rows={10}
            />
          </label>
          <label className={styles.replaceFile}>
            <span className={styles.replaceLabel}>{doc.replaceFileLabel}</span>
            <input accept=".pdf,application/pdf,.txt,text/plain" name="file" type="file" />
            <span className={styles.hint}>{upload.fileHint}</span>
          </label>
          <Button disabled={pending} size="m" type="submit" variant="secondary">
            {pending ? doc.replaceSubmitting : doc.replaceSubmit}
          </Button>
        </form>
      </div>
    </details>
  );
}

export { ReplaceDocumentForm };
