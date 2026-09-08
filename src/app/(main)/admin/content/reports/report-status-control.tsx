"use client";

import { useActionState } from "react";
import { Input } from "@/components/shadcn/ui/input";
import { NativeSelect } from "@/components/shadcn/ui/native-select";
import { Button } from "@/components/ui/button";
import { admin } from "@/lib/strings";
import {
  type ContentReportActionState,
  manageContentReport,
} from "@/server/content-report-actions";
import styles from "../../admin.module.css";

function ReportStatusControl({ reportId, status }: { reportId: string; status: string }) {
  const [state, formAction, pending] = useActionState<ContentReportActionState, FormData>(
    manageContentReport,
    {},
  );
  return (
    <form action={formAction} className={styles.rowActions}>
      <Input name="report_id" type="hidden" value={reportId} />
      <NativeSelect aria-label={admin.reportStatusLabel} defaultValue={status} name="status">
        {Object.entries(admin.reportStatuses).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </NativeSelect>
      <Button disabled={pending} size="s" type="submit" variant="secondary">
        {pending ? admin.reportSaving : admin.reportSave}
      </Button>
      {state.done === undefined ? null : <span className={styles.hint}>{state.done}</span>}
      {state.problem === undefined ? null : (
        <span className={styles.roleError} role="alert">
          {state.problem}
        </span>
      )}
    </form>
  );
}

export { ReportStatusControl };
