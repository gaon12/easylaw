"use client";

import { useActionState } from "react";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { Button, ButtonLink } from "@/components/ui/button";
import { admin } from "@/lib/strings";
import { type EditRenditionState, saveEditedRendition } from "@/server/content-editor-actions";
import styles from "./page.module.css";

interface EditableSentence {
  readonly id: string;
  readonly orderIdx: number;
  readonly role: "heading" | "body" | "gloss";
  readonly text: string;
  readonly source: string | null;
  readonly evidence: readonly string[];
}

const HEADING_ROWS = 2;
const BODY_ROWS = 4;
const MAX_SENTENCE_LENGTH = 4000;

function Evidence({ lines }: { lines: readonly string[] }) {
  return (
    <div className={styles.evidence}>
      <strong>{admin.renditionEditEvidence}</strong>
      {lines.length === 0 ? (
        <p>{admin.renditionEditNoEvidence}</p>
      ) : (
        lines.map((line, index) => <blockquote key={`${index}-${line}`}>{line}</blockquote>)
      )}
    </div>
  );
}

function EditorForm({
  judgmentId,
  renditionId,
  sentences,
}: {
  judgmentId: string;
  renditionId: string;
  sentences: readonly EditableSentence[];
}) {
  const [state, formAction, pending] = useActionState<EditRenditionState, FormData>(
    saveEditedRendition,
    {},
  );

  return (
    <form action={formAction} className={styles.form}>
      <input name="judgment_id" type="hidden" value={judgmentId} />
      <input name="base_rendition_id" type="hidden" value={renditionId} />
      <ol className={styles.sentenceList}>
        {sentences.map((sentence) => {
          const readOnly = sentence.role === "gloss";
          const label = admin.renditionEditRoles[sentence.role];
          return (
            <li className={styles.sentenceRow} key={sentence.id}>
              <Evidence lines={sentence.evidence} />
              <div className={styles.editField}>
                <div className={styles.sentenceMeta}>
                  <label
                    htmlFor={`sentence-${sentence.id}`}
                  >{`${sentence.orderIdx + 1}. ${label}`}</label>
                  {sentence.source === null ? null : <span>{sentence.source}</span>}
                </div>
                <input name="sentence_id" type="hidden" value={sentence.id} />
                <Textarea
                  aria-describedby={readOnly ? `sentence-note-${sentence.id}` : undefined}
                  className={styles.textarea}
                  defaultValue={sentence.text}
                  id={`sentence-${sentence.id}`}
                  maxLength={MAX_SENTENCE_LENGTH}
                  name="sentence_text"
                  readOnly={readOnly}
                  required={true}
                  rows={sentence.role === "heading" ? HEADING_ROWS : BODY_ROWS}
                />
                {readOnly ? (
                  <p className={styles.readOnlyNote} id={`sentence-note-${sentence.id}`}>
                    {admin.renditionEditGlossReadonly}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>

      {state.problem === undefined ? null : (
        <p className={styles.problem} role="alert">
          {state.problem}
        </p>
      )}
      <div className={styles.actions}>
        <Button disabled={pending} type="submit">
          {pending ? admin.renditionEditSaving : admin.renditionEditSave}
        </Button>
        <ButtonLink href={`/admin/content/judgments/${judgmentId}`} variant="tertiary">
          {admin.renditionEditCancel}
        </ButtonLink>
      </div>
    </form>
  );
}

export { EditorForm };
export type { EditableSentence };
