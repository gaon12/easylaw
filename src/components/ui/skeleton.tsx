import { Skeleton } from "@/components/shadcn/ui/skeleton";
import { cn } from "@/lib/utils";

const WIDTHS = {
  full: "w-full",
  long: "w-[88%]",
  medium: "w-3/5",
  short: "w-[38%]",
} as const;

function SkeletonLine({ width }: { width?: keyof typeof WIDTHS }) {
  return (
    <Skeleton
      aria-hidden="true"
      className={cn(
        "block h-[1.0625rem] rounded-[var(--el-radius-xs)] bg-[var(--el-bg-subtle)]",
        WIDTHS[width ?? "full"],
      )}
    />
  );
}

function lineWidth(index: number, total: number): "full" | "long" | "short" {
  if (index === total - 1) {
    return "short";
  }
  return index % 2 === 0 ? "full" : "long";
}

function SkeletonParagraph({ lines = 3 }: { lines?: number }) {
  return (
    <span aria-hidden="true" className="grid gap-3">
      {Array.from({ length: lines }, (_, index) => (
        <SkeletonLine key={String(index)} width={lineWidth(index, lines)} />
      ))}
    </span>
  );
}

function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div
      aria-hidden="true"
      className="grid gap-4 rounded-xl border border-[var(--el-border-subtle)] p-[var(--el-space-6)]"
    >
      <SkeletonLine width="medium" />
      <SkeletonParagraph lines={lines} />
    </div>
  );
}

export { SkeletonCard, SkeletonLine, SkeletonParagraph };
