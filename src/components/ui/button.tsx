import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./button.module.css";

type ButtonVariant = "primary" | "secondary" | "tertiary";
type ButtonSize = "l" | "m" | "s";

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: ReactNode;
  className?: string;
}

function classesFor(variant: ButtonVariant, size: ButtonSize, extra?: string): string {
  return [styles.base, styles[size], styles[variant], extra].filter(Boolean).join(" ");
}

type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className">;

function Button({
  variant = "primary",
  size = "m",
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button className={classesFor(variant, size, className)} type={type} {...rest}>
      {children}
    </button>
  );
}

interface ButtonLinkProps extends CommonProps {
  href: string;
}

/** 이동은 링크로 한다 — 버튼처럼 보여도 새 탭·복사 같은 링크 동작을 뺏지 않는다. */
function ButtonLink({
  href,
  variant = "primary",
  size = "m",
  children,
  className,
}: ButtonLinkProps) {
  return (
    <Link className={classesFor(variant, size, className)} href={href}>
      {children}
    </Link>
  );
}

export { Button, ButtonLink };
