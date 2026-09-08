import type { ReactNode } from "react";
import { AlertDescription, AlertTitle, Alert as ShadcnAlert } from "@/components/shadcn/ui/alert";
import { Icon } from "./icon";

/** 법적 고지도 shadcn Alert 구조를 쓰되, 일반 경고와 구별되는 흰 정보 표면을 유지한다. */
function Infobox({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <ShadcnAlert className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 rounded-xl border-[var(--el-info-line)] bg-card px-5 py-4 text-[var(--el-info-fg)] max-sm:px-4">
      <span className="row-span-2 mt-px flex size-6 items-center justify-center">
        <Icon name="info" />
      </span>
      <AlertTitle className="col-start-2 font-bold leading-[var(--el-leading-tight)]">
        {title}
      </AlertTitle>
      <AlertDescription className="col-start-2 text-[length:var(--el-text-body-s)] leading-[var(--el-leading-body)] text-[var(--el-fg-2)]">
        {children}
      </AlertDescription>
      {actions === undefined ? null : (
        <div className="col-start-2 flex flex-wrap gap-3 pt-1">{actions}</div>
      )}
    </ShadcnAlert>
  );
}

export { Infobox };
