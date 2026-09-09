"use client";

import { useActionState } from "react";
import { Button as ShadcnButton } from "@/components/shadcn/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/ui/dialog";
import { Input } from "@/components/shadcn/ui/input";
import { NativeSelect } from "@/components/shadcn/ui/native-select";
import { Textarea } from "@/components/shadcn/ui/textarea";
import { Button } from "@/components/ui/button";
import { report } from "@/lib/strings";
import { type ContentReportActionState, submitMediaReport } from "@/server/content-report-actions";
import styles from "./sentence-report.module.css";

function MediaReport({ placementId }: { placementId: string }) {
  const reasonId = `media-report-reason-${placementId}`;
  const detailId = `media-report-detail-${placementId}`;
  const [state, formAction, pending] = useActionState<ContentReportActionState, FormData>(
    submitMediaReport,
    {},
  );

  return (
    <Dialog>
      <DialogTrigger render={<ShadcnButton className={styles.trigger} size="sm" variant="ghost" />}>
        {report.mediaOpen}
      </DialogTrigger>
      <DialogContent className={styles.dialog}>
        <DialogHeader>
          <DialogTitle>{report.mediaTitle}</DialogTitle>
          <DialogDescription>{report.mediaIntro}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className={styles.form}>
          <Input name="placement_id" type="hidden" value={placementId} />
          <label className={styles.field} htmlFor={reasonId}>
            <span>{report.reason}</span>
            <NativeSelect defaultValue="misleading" id={reasonId} name="reason" required={true}>
              {Object.entries(report.mediaReasons).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </label>
          <label className={styles.field} htmlFor={detailId}>
            <span>{report.detail}</span>
            <Textarea
              id={detailId}
              maxLength={1000}
              name="detail"
              placeholder={report.mediaDetailHint}
              rows={5}
            />
          </label>
          {state.done === undefined ? null : <p className={styles.done}>{state.done}</p>}
          {state.problem === undefined ? null : (
            <p className={styles.problem} role="alert">
              {state.problem}
            </p>
          )}
          <DialogFooter className={styles.footer}>
            <Button disabled={pending} size="s" type="submit">
              {pending ? report.sending : report.send}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export { MediaReport };
