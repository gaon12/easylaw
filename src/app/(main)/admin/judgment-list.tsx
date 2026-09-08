"use client";

import { useActionState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { admin } from "@/lib/strings";
import { type RefreshState, refreshJudgmentText } from "@/server/admin-actions";
import styles from "./admin.module.css";

interface JudgmentRow {
  readonly id: string;
  readonly caseNo: string;
  readonly caseNoCanonical: string;
  readonly court: string | null;
  readonly spans: number;
  readonly textCachedAt: Date | null;
}

/**
 * 판례 한 줄과 "원문 다시 받기".
 *
 * 줄마다 따로 상태를 갖는다 — 하나를 다시 받는 동안 다른 줄이 함께 잠기면, 여러 개를
 * 고쳐야 하는 사람은 한 번에 하나씩 기다려야 한다고 오해한다.
 */
function JudgmentRowView({ row, formatTime }: { row: JudgmentRow; formatTime: string }) {
  const [state, formAction, pending] = useActionState<RefreshState, FormData>(
    refreshJudgmentText,
    {},
  );

  return (
    <tr>
      <td>{row.caseNo.length === 0 ? admin.judgmentNoCaseNo : row.caseNo}</td>
      <td>{row.court ?? "—"}</td>
      <td>{row.spans.toLocaleString()}</td>
      <td>{formatTime}</td>
      <td>
        <div className={styles.rowActions}>
          <ButtonLink href={`/admin/content/judgments/${row.id}`} size="s" variant="tertiary">
            {admin.judgmentHistory}
          </ButtonLink>
          <form action={formAction}>
            <input name="case_no" type="hidden" value={row.caseNoCanonical} />
            <Button disabled={pending} size="s" type="submit" variant="secondary">
              {pending ? admin.judgmentRefreshing : admin.judgmentRefresh}
            </Button>
          </form>
        </div>
        {state.done === undefined ? null : <span className={styles.hint}>{state.done}</span>}
        {state.problem === undefined ? null : (
          <span className={styles.roleError} role="alert">
            {state.problem}
          </span>
        )}
      </td>
    </tr>
  );
}

/**
 * 들고 있는 판례와 원문 상태.
 *
 * **문장 수를 보여 주는 이유**는 잘린 본문이 사건번호만으로는 보이지 않기 때문이다.
 * 대법원 판결이 열 몇 문장이면 무언가 잘못된 것이고, 그때 여기서 다시 받으면 된다.
 */
function JudgmentList({
  rows,
  formatTime,
}: {
  rows: readonly JudgmentRow[];
  formatTime: (at: Date | null) => string;
}) {
  if (rows.length === 0) {
    return <p className={styles.empty}>{admin.judgmentEmpty}</p>;
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{admin.judgmentColumns.caseNo}</th>
            <th scope="col">{admin.judgmentColumns.court}</th>
            <th scope="col">{admin.judgmentColumns.spans}</th>
            <th scope="col">{admin.judgmentColumns.cachedAt}</th>
            <th className="sr-only" scope="col">
              {admin.judgmentRefresh}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <JudgmentRowView
              formatTime={formatTime(row.textCachedAt)}
              key={row.caseNoCanonical}
              row={row}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export { JudgmentList };
export type { JudgmentRow };
