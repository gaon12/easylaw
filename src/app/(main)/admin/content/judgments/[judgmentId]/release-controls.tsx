"use client";

import { useActionState } from "react";
import { Input } from "@/components/shadcn/ui/input";
import { Button } from "@/components/ui/button";
import { admin } from "@/lib/strings";
import { manageJudgmentRelease, type ReleaseState } from "@/server/admin-actions";
import styles from "../../../admin.module.css";

interface Props {
  readonly judgmentId: string;
  readonly level: "L1" | "L2" | "L3" | "L4";
  readonly latestRenditionId: string | null;
  readonly publishedRenditionId: string | null;
  readonly publishBlocked: boolean;
}

/** 각 단계가 자기 액션 상태를 가진다. 다른 단계의 작업 버튼까지 잠그지 않는다. */
function ReleaseControls({
  judgmentId,
  level,
  latestRenditionId,
  publishedRenditionId,
  publishBlocked,
}: Props) {
  const [state, formAction, pending] = useActionState<ReleaseState, FormData>(
    manageJudgmentRelease,
    {},
  );
  const canPublish =
    latestRenditionId !== null && latestRenditionId !== publishedRenditionId && !publishBlocked;

  return (
    <div className={styles.releaseActions}>
      <div className={styles.rowActions}>
        {latestRenditionId === null ? null : (
          <form action={formAction}>
            <Input name="judgment_id" type="hidden" value={judgmentId} />
            <Input name="level" type="hidden" value={level} />
            <Input name="rendition_id" type="hidden" value={latestRenditionId} />
            <Input name="operation" type="hidden" value="publish" />
            <Button
              disabled={pending || !canPublish}
              size="s"
              title={publishBlocked ? admin.releaseBlocked : undefined}
              type="submit"
            >
              {pending ? admin.releaseChanging : admin.releasePublish}
            </Button>
          </form>
        )}
        {publishedRenditionId === null ? null : (
          <form action={formAction}>
            <Input name="judgment_id" type="hidden" value={judgmentId} />
            <Input name="level" type="hidden" value={level} />
            <Input name="operation" type="hidden" value="withdraw" />
            <Button disabled={pending} size="s" type="submit" variant="secondary">
              {admin.releaseWithdraw}
            </Button>
          </form>
        )}
      </div>
      {state.done === undefined ? null : <span className={styles.hint}>{state.done}</span>}
      {state.problem === undefined ? null : (
        <span className={styles.roleError} role="alert">
          {state.problem}
        </span>
      )}
    </div>
  );
}

function RestoreReleaseControl({
  judgmentId,
  releaseId,
  disabled,
  disabledTitle,
}: {
  judgmentId: string;
  releaseId: string;
  disabled: boolean;
  disabledTitle?: string;
}) {
  const [state, formAction, pending] = useActionState<ReleaseState, FormData>(
    manageJudgmentRelease,
    {},
  );

  return (
    <div className={styles.releaseActions}>
      <form action={formAction}>
        <Input name="judgment_id" type="hidden" value={judgmentId} />
        <Input name="release_id" type="hidden" value={releaseId} />
        <Input name="operation" type="hidden" value="restore" />
        <Button
          disabled={disabled || pending}
          size="s"
          title={disabled ? disabledTitle : undefined}
          type="submit"
          variant="secondary"
        >
          {pending ? admin.releaseChanging : admin.releaseRestore}
        </Button>
      </form>
      {state.done === undefined ? null : <span className={styles.hint}>{state.done}</span>}
      {state.problem === undefined ? null : (
        <span className={styles.roleError} role="alert">
          {state.problem}
        </span>
      )}
    </div>
  );
}

export { ReleaseControls, RestoreReleaseControl };
