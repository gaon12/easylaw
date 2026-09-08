import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button as ShadcnButton } from "@/components/shadcn/ui/button";
import { buttonVariants } from "@/components/shadcn/ui/button-variants";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "tertiary";
type ButtonSize = "l" | "m" | "s";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
}

const VARIANTS = {
  primary: "default",
  secondary: "secondary",
  tertiary: "outline",
} as const;

const SIZES = {
  l: "lg",
  m: "default",
  s: "sm",
} as const;

const EASYLAW_SIZES = {
  l: "min-h-14 px-6 text-[length:var(--el-text-body-l)] font-bold",
  m: "min-h-12 px-5 text-[length:var(--el-text-body-m)] font-bold",
  s: "min-h-10 px-4 text-[length:var(--el-text-body-s)] font-bold",
} as const;

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

/** shadcn Button의 상태·포커스 처리를 쓰고 EasyLaw의 큰 터치 크기만 덧붙인다. */
function Button({
  variant = "primary",
  size = "m",
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <ShadcnButton
      className={cn(EASYLAW_SIZES[size], className)}
      size={SIZES[size]}
      type={type}
      variant={VARIANTS[variant]}
      {...rest}
    >
      {children}
    </ShadcnButton>
  );
}

interface ButtonLinkProps extends CommonProps {
  href: string;
}

/** 링크의 기본 동작을 지키면서 shadcn Button과 같은 variant를 적용한다. */
function ButtonLink({
  href,
  variant = "primary",
  size = "m",
  children,
  className,
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(
        buttonVariants({ variant: VARIANTS[variant], size: SIZES[size] }),
        EASYLAW_SIZES[size],
        className,
      )}
      href={href}
    >
      {children}
    </Link>
  );
}

export { Button, ButtonLink };
