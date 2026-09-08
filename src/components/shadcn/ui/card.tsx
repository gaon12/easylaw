import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type CardProps = ComponentProps<"div"> & { size?: "default" | "sm" };

function Card({ className, size = "default", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10 [--card-spacing:--spacing(4)] data-[size=sm]:[--card-spacing:--spacing(3)]",
        className,
      )}
      data-size={size}
      data-slot="card"
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("px-(--card-spacing)", className)} data-slot="card-content" {...props} />
  );
}

export { Card, CardContent };
