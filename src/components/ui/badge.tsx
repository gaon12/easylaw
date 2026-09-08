import { Badge as ShadcnBadge } from "@/components/shadcn/ui/badge";
import { cn } from "@/lib/utils";
import { Icon } from "./icon";
import type { BadgeTone, IconName } from "./types";

const ICONS: Readonly<Record<BadgeTone, IconName>> = {
  grounded: "check",
  "needs-check": "alert",
  ungrounded: "cross",
  neutral: "info",
};

const OUTLINED = {
  grounded:
    "border-[var(--el-grounded-line)] bg-[var(--el-grounded-bg)] text-[var(--el-grounded-fg)]",
  "needs-check":
    "border-[var(--el-needs-check-line)] bg-[var(--el-needs-check-bg)] text-[var(--el-needs-check-fg)]",
  ungrounded:
    "border-[var(--el-ungrounded-line)] bg-[var(--el-ungrounded-bg)] text-[var(--el-ungrounded-fg)]",
  neutral: "border-[var(--el-border-default)] bg-[var(--el-bg-subtle)] text-[var(--el-fg-2)]",
} as const;

const SOLID = {
  grounded: "border-transparent bg-[var(--el-grounded-line)] text-[var(--el-fg-inverse)]",
  "needs-check": "border-transparent bg-[var(--el-needs-check-line)] text-[var(--el-fg-inverse)]",
  ungrounded: "border-transparent bg-[var(--el-ungrounded-line)] text-[var(--el-fg-inverse)]",
  neutral: "border-transparent bg-[var(--el-bg-inverse)] text-[var(--el-fg-inverse)]",
} as const;

function Badge({
  tone = "neutral",
  variant = "outlined",
  wrap = false,
  children,
}: {
  tone?: BadgeTone;
  variant?: "outlined" | "solid";
  wrap?: boolean;
  children: string;
}) {
  return (
    <ShadcnBadge
      className={cn(
        "h-auto gap-1 rounded-[var(--el-radius-xs)] px-2 py-0.5 text-[length:var(--el-text-body-xs)] font-bold leading-[var(--el-leading-tight)]",
        variant === "solid" ? SOLID[tone] : OUTLINED[tone],
        wrap && "max-w-full items-start whitespace-normal [overflow-wrap:anywhere]",
      )}
      variant="outline"
    >
      <Icon name={ICONS[tone]} size={16} />
      {children}
    </ShadcnBadge>
  );
}

export { Badge };
