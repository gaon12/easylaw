import type { ReactNode } from "react";
import { Card as ShadcnCard } from "@/components/shadcn/ui/card";
import { cn } from "@/lib/utils";
import type { CardTone } from "./types";

type CardPadding = "default" | "tight" | "none";

const PADDING = {
  default: "p-[var(--el-space-6)] max-sm:p-[var(--el-space-4)]",
  tight: "p-[var(--el-space-5)]",
  none: "p-0",
} as const;

const TONES = {
  default: "ring-1 ring-[var(--el-border-default)] shadow-none",
  elevated: "ring-0 shadow-[var(--el-shadow-2)]",
  selected: "ring-2 ring-[var(--el-action)] bg-[var(--el-action-weak)] shadow-none",
} as const;

/** shadcn Card를 의미에 맞는 HTML 태그로도 쓸 수 있게 감싼 호환 계층. */
function Card({
  tone = "default",
  padding = "default",
  as: Tag = "div",
  className,
  children,
}: {
  tone?: CardTone;
  padding?: CardPadding;
  as?: "div" | "li" | "section";
  className?: string;
  children: ReactNode;
}) {
  const classes = cn(
    "grid content-start gap-[var(--el-space-4)] overflow-hidden rounded-xl bg-card text-card-foreground",
    PADDING[padding],
    TONES[tone],
    className,
  );

  if (Tag === "div") {
    return <ShadcnCard className={classes}>{children}</ShadcnCard>;
  }
  return (
    <Tag className={classes} data-slot="card">
      {children}
    </Tag>
  );
}

export { Card };
