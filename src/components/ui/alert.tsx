import type { ReactNode } from "react";
import { AlertDescription, AlertTitle, Alert as ShadcnAlert } from "@/components/shadcn/ui/alert";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import type { AlertTone, IconName } from "./types";

const ICONS: Readonly<Record<AlertTone, IconName>> = {
  success: "check",
  warning: "alert",
  danger: "cross",
};

const TONES = {
  success:
    "border-[var(--el-grounded-line)] bg-[var(--el-grounded-bg)] text-[var(--el-grounded-fg)]",
  warning:
    "border-[var(--el-needs-check-line)] bg-[var(--el-needs-check-bg)] text-[var(--el-needs-check-fg)]",
  danger:
    "border-[var(--el-ungrounded-line)] bg-[var(--el-ungrounded-bg)] text-[var(--el-ungrounded-fg)]",
} as const;

/** shadcn Alert의 구조·role을 쓰고 서비스의 세 가지 의미 색을 연결한다. */
function Alert({
  tone,
  title,
  children,
  actions,
}: {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <ShadcnAlert
      className={cn(
        "grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-xl px-5 py-4 max-sm:px-4",
        TONES[tone],
      )}
    >
      <span className="row-span-2 mt-px flex size-6 items-center justify-center">
        <Icon name={ICONS[tone]} />
      </span>
      <AlertTitle className="col-start-2 font-bold leading-[var(--el-leading-tight)]">
        {title}
      </AlertTitle>
      {children === undefined ? null : (
        <AlertDescription className="col-start-2 text-[length:var(--el-text-body-s)] leading-[var(--el-leading-body)] text-[var(--el-fg-2)]">
          {children}
        </AlertDescription>
      )}
      {actions === undefined ? null : (
        <div className="col-start-2 flex flex-wrap gap-3 pt-1">{actions}</div>
      )}
    </ShadcnAlert>
  );
}

export { Alert };
